// Самоигра для обучения сети (tools/gpu/README.md, docs/specs/2026-11-neural.md, «Обучение»). Один процесс — часть
// круга: партии на 2–4 места в обоих вариантах, места — сеть или боты-уровни по смеси, партия — настоящим движком
// приложения. Каждое наблюдение каждого места после каждого действия — пример; цель — λ-возврат по цепочке
// наблюдений этого места до исхода (TD(λ)), на этапе поиска для своих решений сети — смесь с оценкой поиска.
//
//   bun tools/gpu/selfplay.ts --net cur.bin --games 200 --seed 7 --out shard.bin [--mode td|search] …
// Печатает одну строку JSON со счётом круга. Файл: 'DKS1', n, 64, 0 (u32), затем n × 64 байта записей и n float32 целей.
import { writeFileSync } from 'node:fs';
import { apply, observe, rulesWith } from '../../src/engine';
import type { State, ThrowOrder, Variant } from '../../src/engine';
import { legalFor, makeRng, thinkSync } from '../../src/bot';
import type { Rng } from '../../src/bot';
import { encode, netScores, pack, RAW_SIZE, valueOf } from '../../src/bot/net';
import type { NetParams } from '../../src/bot/net';
import { actorOf, outcome } from '../../src/bot/sim';
import { loadNet, playerOf, shuffled, startOf } from './play';
import type { Player } from './play';

function args(): Record<string, string> {
  const a = process.argv.slice(2), out: Record<string, string> = {};
  for (let i = 0; i < a.length; i += 2) out[a[i].replace(/^--/, '')] = a[i + 1];
  return out;
}

/** `a:0.7,b:0.3` → выбор по долям. */
function weighted(spec: string): (rng: Rng) => string {
  const parts = spec.split(',').map(p => { const i = p.lastIndexOf(':'); return { k: p.slice(0, i), w: Number(p.slice(i + 1)) }; });
  const total = parts.reduce((s, p) => s + p.w, 0);
  return rng => {
    let x = rng.next() * total;
    for (const p of parts) if ((x -= p.w) < 0) return p.k;
    return parts[parts.length - 1].k;
  };
}

const A = args();
const net = loadNet(A.net);
const games = Number(A.games ?? 100);
const seed = Number(A.seed ?? 1);
const mode = (A.mode ?? 'td') as 'td' | 'search';
const lam = Number(A.lam ?? 0.8);
const beta = Number(A.beta ?? 0.5);
const eps = Number(A.eps ?? 0.05);
const keep = Number(A.keep ?? 0.5);
const params: NetParams = {
  samples: Number(A.samples ?? (mode === 'td' ? 2 : 8)),
  horizon: (A.horizon ?? (mode === 'td' ? 'now' : 'bout')) as NetParams['horizon'],
  endgame: 0,
};
const pickSeats = weighted(A.seats ?? '2:0.6,3:0.2,4:0.2');
const pickVariant = weighted(A.variants ?? 'podkidnoy:0.5,perevodnoy:0.5');
const pickPlayer = weighted(A.mix ?? 'net:0.7,average:0.12,amateur:0.06,experienced:0.12');
// «Подкидывать»: по умолчанию стола — по очереди (#57); «кто успел» — настройка, её тоже в смесь
const pickOrder = weighted(A.orders ?? 'queue:0.8,free:0.2');

const rng = makeRng(seed * 7919 + 13);
const players: Record<string, Player> = {};
const playerFor = (k: string): Player => (players[k] ??= playerOf(k));

interface Rec { raw: Uint8Array; v: number; q: number }
const raws: Uint8Array[] = [];
const targets: number[] = [];
const x = new Float32Array(net.sizes[0]);
let steps = 0, loops = 0, decisions = 0;
// счёт мест сети за столами, где есть и боты: доля «не остался с картами» против ожидаемой (места − 1) / места
let netMixed = 0, netMixedBase = 0, netMixedN = 0;
const t0 = Date.now();

for (let g = 0; g < games; g++) {
  const seats = Number(pickSeats(rng));
  const variant = pickVariant(rng) as Variant;
  const kinds = Array.from({ length: seats }, () => pickPlayer(rng));
  const rules = rulesWith(pickOrder(rng) as ThrowOrder);
  let s: State = startOf(shuffled(rng), seats, variant, rules);
  const seqs: Rec[][] = Array.from({ length: seats }, () => []);
  const record = (st: State) => {
    if (st.phase === 'end') return;
    for (let seat = 0; seat < seats; seat++) {
      if (st.out.includes(seat)) continue;
      const raw = pack(observe(st, seat));
      seqs[seat].push({ raw, v: valueOf(net, encode(raw, x)), q: -1 });
    }
  };
  record(s);
  let ok = true;
  for (let step = 0; s.phase !== 'end'; step++) {
    if (step > 3000) { ok = false; break; }
    const seat = actorOf(s);
    const o = observe(s, seat);
    let q = -1;
    let action;
    if (kinds[seat] === 'net') {
      const legal = legalFor(o);
      if (legal.length === 1) action = legal[0];
      else {
        decisions++;
        const { scored } = thinkSync(netScores(o, net, params, rng, legal));
        let pick = scored.reduce((b, c) => (c.score > b.score + 1e-9 ? c : b));
        if (rng.next() < eps) pick = scored[rng.int(scored.length)];
        action = pick.action;
        q = pick.score;
      }
    } else action = playerFor(kinds[seat])(o, rng);
    s = apply(s, seat, action);
    steps++;
    record(s);
    // оценка поиска — цель для наблюдения сразу после своего решения (если место ещё в игре)
    if (q >= 0 && s.phase !== 'end' && !s.out.includes(seat)) seqs[seat][seqs[seat].length - 1].q = q;
  }
  if (!ok) { loops++; continue; }
  for (let seat = 0; seat < seats; seat++) {
    const seq = seqs[seat];
    // исход места: 1 — не остался с картами, 0 — дурак, ничья — 0,5 (как `outcome` поиска)
    let G = outcome(s, seat);
    for (let t = seq.length - 1; t >= 0; t--) {
      let target = G;
      if (seq[t].q >= 0 && mode === 'search') target = (1 - beta) * target + beta * seq[t].q;
      if (rng.next() < keep) { raws.push(seq[t].raw); targets.push(target); }
      G = (1 - lam) * seq[t].v + lam * G;
    }
  }
  if (kinds.includes('net') && kinds.some(k => k !== 'net')) {
    for (let seat = 0; seat < seats; seat++) if (kinds[seat] === 'net') {
      netMixed += s.result!.fool === seat ? 0 : s.result!.draw ? 0.5 : 1;
      netMixedBase += (seats - 1) / seats;
      netMixedN++;
    }
  }
}

const n = raws.length;
const buf = new Uint8Array(16 + n * RAW_SIZE + n * 4);
const head = new Uint32Array(buf.buffer, 0, 4);
head[0] = 0x31534b44; head[1] = n; head[2] = RAW_SIZE; head[3] = 0;
for (let i = 0; i < n; i++) buf.set(raws[i], 16 + i * RAW_SIZE);
new Float32Array(buf.buffer, 16 + n * RAW_SIZE, n).set(targets);
if (A.out) writeFileSync(A.out, buf);
console.log(JSON.stringify({
  games, samples: n, steps, decisions, loops, seconds: (Date.now() - t0) / 1000,
  net_mixed: netMixedN ? netMixed / netMixedN : null, net_mixed_base: netMixedN ? netMixedBase / netMixedN : null, net_mixed_n: netMixedN,
}));
