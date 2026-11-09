// Вход сборки для Hermes (tools/hermes/bots.ts): сколько думает каждый уровень на позициях из
// партий ботов и сколько стоит точная концовка. Печатает таблицу; числа — в docs/10-bot.md.
import { apply, newGame, observe, RULES } from '../../src/engine';
import { chooseAction, LEVELS, makeRng, solveActions, isEndgame } from '../../src/bot';
import type { Level } from '../../src/bot';
import { actorOf } from '../../src/bot/sim';

declare const print: (s: string) => void;
const deckOf = (rng: { int(n: number): number }) => {
  const d = Array.from({ length: 36 }, (_, i) => i);
  for (let i = 35; i > 0; i--) { const j = rng.int(i + 1); const t = d[i]; d[i] = d[j]; d[j] = t; }
  return d;
};
// позиции: из 6 партий «Среднего» против себя, каждая 4-я позиция
const rng = makeRng(42);
const positions: { o: ReturnType<typeof observe> }[] = [];
const ends: ReturnType<typeof observe>[] = [];
for (let g = 0; g < 6; g++) {
  let s = newGame({ rules: RULES, variant: g % 2 ? 'perevodnoy' : 'podkidnoy', seats: 2, first: 0 }, deckOf(rng));
  let n = 0, endTaken = false;
  while (s.phase !== 'end') {
    const who = actorOf(s);
    const o = observe(s, who);
    if (n++ % 4 === 0 && !isEndgame(o)) positions.push({ o });
    if (!endTaken && isEndgame(o)) { ends.push(o); endTaken = true; }
    s = apply(s, who, chooseAction(o, 'average', rng));
  }
}
const arg = (typeof (globalThis as { LEVELS_ARG?: string }).LEVELS_ARG === 'string') ? (globalThis as { LEVELS_ARG?: string }).LEVELS_ARG! : '';
const levels = (arg ? arg.split(',') : LEVELS) as Level[];
for (const level of levels) {
  const times: number[] = [];
  for (const { o } of positions.slice(0, level === 'master' ? 6 : 30)) {
    const t = Date.now();
    chooseAction(o, level, makeRng(1));
    times.push(Date.now() - t);
  }
  times.sort((a, b) => a - b);
  print(`${level}: позиций ${times.length}, медиана ${times[times.length >> 1]} мс, наибольшее ${times[times.length - 1]} мс`);
}
const et: string[] = [];
for (const o of ends) {
  const t = Date.now();
  const r = solveActions(o, 50_000);
  et.push(`${o.hand.length}+${o.handSizes[1 - o.seat]} карт: ${Date.now() - t} мс${r ? '' : ' (не уложился, по раскладам)'}`);
}
print('концовка: ' + et.join('; '));
print('OK');
