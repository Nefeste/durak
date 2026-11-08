// Сборка набора задач дня (docs/10-bot.md, «Задача дня»). Партии ботов на зеркальных колодах с зерном; в каждой —
// позиция, где колода только что опустела и в партии двое. Точный расчёт: у того, кто ходит, ровно одно первое
// действие спасает (значение 1), все остальные проигрывают при лучшей игре соперника; на лучшем пути — не
// меньше трёх своих решений. Набор `src/game/puzzleSet.ts` генерируется, руками не правится; номера вечные:
// уже записанные задачи переносятся как есть, новые — в конец.
//   bun tools/puzzles/collect.ts [сколько всего] [зерно]
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { apply, dealOf, firstOf, legalActions, observe } from '../../src/engine';
import type { Action, State, Variant } from '../../src/engine';
import { chooseAction, makeRng } from '../../src/bot';
import { chooseByRules } from '../../src/bot/rules';
import { solver, TooDeep } from '../../src/bot/endgame';
import { actorOf, ROLLOUT } from '../../src/bot/sim';
import { shuffled } from '../sim/play';
import type { Puzzle } from '../../src/game/puzzle';

const ROOT = join(import.meta.dir, '../..');
const OUT = process.env.PUZZLE_OUT ?? join(ROOT, 'src/game/puzzleSet.ts');
const [want = '400', seedArg = '1'] = process.argv.slice(2);
const BUDGET = 20_000;

// MERGE=a.ts,b.ts — собрать набор из частей, посчитанных параллельно (каждая — со своим зерном): к уже
// записанному набору — новые задачи частей, без повторов
const parts: Puzzle[] = [];
for (const f of (process.env.MERGE ?? '').split(',').filter(Boolean)) parts.push(...(await import(f)).PUZZLES);
const old: Puzzle[] = process.env.FRESH ? [] : (existsSync(OUT) ? (await import(OUT)).PUZZLES : []);
const sameAct = (a: Action, b: Action) => JSON.stringify(a) === JSON.stringify(b);
const keyOf = (p: Puzzle) => JSON.stringify([p.hands, p.table, p.trump, p.attacker, p.defender, p.phase]);
const seen = new Set(old.map(keyOf));

/** Позиция подходит? Тогда — задача (без номера). */
function judge(s: State, variant: Variant): Omit<Puzzle, 'id'> | null {
  const you = actorOf(s);
  if (you < 0) return null;
  const legal = legalActions(s, you);
  if (legal.length < 2) return null;
  const sv = solver(you, BUDGET);
  let vals: number[];
  try { vals = legal.map(a => sv.value(apply(s, you, a))); } catch (e) { if (e instanceof TooDeep) return null; throw e; }
  const wins = legal.filter((_, i) => vals[i] === 1);
  if (wins.length !== 1 || vals.some(v => v === 0.5)) return null;
  // лучший путь: свои решения — любой выигрывающий ход (первый по порядку), соперник — самый упорный ответ
  let t = apply(s, you, wins[0]), plies = 1, steps = 0;
  try {
    while (t.phase !== 'end' && steps++ < 400) {
      const who = actorOf(t);
      const acts = legalActions(t, who);
      if (who === you) {
        if (acts.length > 1) plies++;
        t = apply(t, who, acts.find(a => sv.value(apply(t, who, a)) === 1)!);
      } else {
        t = apply(t, who, acts.reduce((b, a) => (sv.value(apply(t, who, a)) <= sv.value(apply(t, who, b)) ? a : b)));
      }
    }
  } catch (e) { if (e instanceof TooDeep) return null; throw e; }
  if (plies < 3) return null;
  const o = observe(s, you);
  const rule = chooseByRules(o, ROLLOUT, makeRng(1), legal);
  const hard = legal.length - 1 + (sameAct(rule, wins[0]) ? 0 : 3);
  return {
    variant, you, hands: s.hands.map(h => [...h].sort((a, b) => a - b)), trump: s.trump, table: s.table, discard: [...s.discard].sort((a, b) => a - b),
    openly: s.openly, starter: s.starter, attacker: s.attacker, defender: s.defender, passed: s.passed, boutLimit: s.boutLimit,
    bout: s.bout, phase: s.phase, answer: wins[0], plies, hard,
  };
}

const fresh: Omit<Puzzle, 'id'>[] = [];
for (const p of parts) {
  const k = keyOf(p);
  if (!seen.has(k)) { seen.add(k); const { id: _, ...rest } = p; fresh.push(rest); }
}
const rng = makeRng(Number(seedArg));
let games = 0;
const started = Date.now();
while (!process.env.MERGE && old.length + fresh.length < Number(want)) {
  games++;
  const variant: Variant = games % 3 === 0 ? 'perevodnoy' : 'podkidnoy';
  const deck = shuffled(rng);
  const { hands, trump } = dealOf(deck, 2);
  let s = (await import('../../src/engine')).newGame({ rules: (await import('../../src/engine')).RULES_V1, variant, seats: 2, first: firstOf(hands, trump).seat }, deck);
  // концовка: каждая позиция, пока не нашлась задача (одна задача на партию — так набор разнообразнее)
  let found = false, tried = 0;
  for (let step = 0; s.phase !== 'end' && step < 600; step++) {
    if (!found && tried < 4 && s.talon.length === 0 && s.out.length === 0 && s.table.length === 0) {
      tried++;
      const p = judge(s, variant);
      if (p) {
        found = true;
        const k = keyOf({ ...p, id: 0 });
        if (!seen.has(k)) { seen.add(k); fresh.push(p); }
      }
    }
    const seat = actorOf(s);
    s = apply(s, seat, chooseAction(observe(s, seat), 'experienced', rng));
  }
  if (games % 100 === 0) console.error(`${games} партий, задач ${old.length + fresh.length}, ${Math.round((Date.now() - started) / 1000)} с`);
}
// новые — по неделям от простых к трудным; старые — как были
const sorted: Omit<Puzzle, 'id'>[] = [];
for (let i = 0; i < fresh.length; i += 7) sorted.push(...fresh.slice(i, i + 7).sort((a, b) => a.hard - b.hard));
const all: Puzzle[] = [...old, ...sorted.map((p, i) => ({ id: old.length + i + 1, ...p }))];
writeFileSync(OUT, `// Набор задач дня — сгенерирован tools/puzzles/collect.ts (${all.length} задач); руками не править.
// Номера вечные: новые задачи — только в конец (docs/10-bot.md, «Задача дня»).
import type { Puzzle } from './puzzle';

export const PUZZLES: Puzzle[] = ${JSON.stringify(all)};
`);
console.log(`партий ${games}, новых задач ${fresh.length}, всего ${all.length}`);
