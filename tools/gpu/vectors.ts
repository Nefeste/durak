// Эталон признаков и оценки сети (tools/gpu/README.md, шаг 3): наблюдения из партий разных ботов на 2–4 места в обоих
// вариантах; для каждого — сырая запись (`pack`), ненулевые входы (`encode`) и оценка сетью `--net` в TypeScript.
// selftest.py сверяет с ними Python (`features.py`, torch), tools/test/net.test.ts — TypeScript с собой прежним.
//
//   bun tools/gpu/vectors.ts --net tools/gpu/vectors/tiny.bin --positions 1500 --out tools/gpu/vectors/features.jsonl.gz [--seed 1]
import { writeFileSync } from 'node:fs';
import { apply, observe, RULES_V1 } from '../../src/engine';
import type { Variant } from '../../src/engine';
import { makeRng } from '../../src/bot';
import { encode, pack, valueOf } from '../../src/bot/net';
import { actorOf } from '../../src/bot/sim';
import { loadNet, playerOf, shuffled, startOf, trainingRules } from './play';

function args(): Record<string, string> {
  const a = process.argv.slice(2), out: Record<string, string> = {};
  for (let i = 0; i < a.length; i += 2) out[a[i].replace(/^--/, '')] = a[i + 1];
  return out;
}

const A = args();
const net = loadNet(A.net);
const count = Number(A.positions ?? 1500);
const rng = makeRng(Number(A.seed ?? 1));
const rules = await trainingRules();
const kinds = ['novice', 'amateur', 'average', `net:${A.net}:2:now`];
const lines: string[] = [];
for (let g = 0; lines.length < count; g++) {
  const seats = 2 + (g % 3);
  const variant: Variant = (g >> 1) % 2 ? 'perevodnoy' : 'podkidnoy';
  const players = Array.from({ length: seats }, (_, i) => playerOf(kinds[(g + i) % kinds.length]));
  // каждая четвёртая партия — «кто успел», остальные — по очереди; в части партий на 3–4 места кто-то сдаётся (#58)
  let s = startOf(shuffled(rng), seats, variant, g % 4 === 3 ? RULES_V1 : rules);
  let resignAt = seats > 2 && (g >> 2) % 2 === 0 ? 5 + rng.int(40) : -1;
  for (let step = 0; s.phase !== 'end' && step < 3000 && lines.length < count; step++) {
    const seat = actorOf(s);
    // наблюдение места наугад (не только ходящего), примерно каждое пятое действие
    if (rng.next() < 0.2) {
      const who = rng.int(seats);
      if (!s.out.includes(who)) {
        const o = observe(s, who);
        const raw = pack(o);
        const x = encode(raw);
        const feat: [number, number][] = [];
        x.forEach((v, i) => { if (v !== 0) feat.push([i, v]); });
        lines.push(JSON.stringify({ obs: o, raw: Array.from(raw), feat, value: valueOf(net, x) }));
      }
    }
    if (step === resignAt) {
      const who = rng.int(seats);
      if (!s.out.includes(who) && !s.resigned.includes(who)) { s = apply(s, who, { type: 'resign' }); resignAt = -1; continue; }
      resignAt++;
    }
    s = apply(s, seat, players[seat](observe(s, seat), rng));
  }
}
writeFileSync(A.out, Bun.gzipSync(new TextEncoder().encode(lines.join('\n') + '\n')));
console.log(JSON.stringify({ positions: lines.length, out: A.out }));
