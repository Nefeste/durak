// Бот видит только своё (ADR 0005): позиции с одним наблюдением и разными скрытыми картами дают
// каждому уровню одно и то же действие (docs/specs/2026-11-v1.md, критерий 2).
import { describe, expect, test } from 'bun:test';
import { apply, legalActions, newGame, observe, RULES, RULES_V1 } from '../../src/engine';
import type { State } from '../../src/engine';
import { chooseAction, LEVELS, makeRng, RULE_LEVELS, unseen } from '../../src/bot';
import { layout } from '../../src/bot/legal';
import { actorOf, shuffled } from '../sim/play';
import { stateFrom } from '../../src/engine';

/** Двойник позиции: скрытые от `seat` карты перемешаны между руками соперников и колодой. */
function twin(s: State, seat: number, seed: number): State {
  const o = observe(s, seat);
  const pool = unseen(o);
  const rng = makeRng(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const { hidden, talon } = layout(o, pool);
  return stateFrom(o, hidden, talon);
}

describe('наблюдение', () => {
  test('двойник даёт то же наблюдение, а руки соперников другие', () => {
    const rng = makeRng(3);
    let differ = 0;
    for (let g = 0; g < 200; g++) {
      let s = newGame({ rules: Math.floor(g / 6) % 2 ? RULES : RULES_V1, variant: g % 2 ? 'perevodnoy' : 'podkidnoy', seats: 2 + (g % 3), first: 0 }, shuffled(rng));
      for (let n = 0; n < 15 && s.phase !== 'end'; n++) {
        const seat = actorOf(s);
        const t = twin(s, seat, g * 100 + n);
        expect(observe(t, seat)).toEqual(observe(s, seat));
        if (JSON.stringify(t.hands) !== JSON.stringify(s.hands)) differ++;
        const legal = legalActions(s, seat);
        s = apply(s, seat, legal[rng.int(legal.length)]);
      }
    }
    expect(differ).toBeGreaterThan(500);
  });

  test('каждый уровень делает одно и то же действие в позиции и в её двойнике', () => {
    const rng = makeRng(11);
    for (let g = 0; g < 150; g++) {
      let s = newGame({ rules: Math.floor(g / 6) % 2 ? RULES : RULES_V1, variant: g % 2 ? 'perevodnoy' : 'podkidnoy', seats: 2 + (g % 3), first: 0 }, shuffled(rng));
      for (let n = 0; n < 25 && s.phase !== 'end'; n++) {
        const seat = actorOf(s);
        const t = twin(s, seat, g * 1000 + n);
        // поиск по раскладам дорогой: `experienced` — на каждой двадцатой позиции, `master` (и старый `strong`) — на
        // каждой восьмидесятой; уровни по правилам — на всех
        const k = g * 25 + n;
        for (const level of LEVELS.filter(l => RULE_LEVELS.includes(l) || (l === 'experienced' ? k % 20 === 0 : k % 80 === 0))) {
          const a = chooseAction(observe(s, seat), level, makeRng(g * 31 + n));
          const b = chooseAction(observe(t, seat), level, makeRng(g * 31 + n));
          expect(b).toEqual(a);
        }
        s = apply(s, seat, chooseAction(observe(s, seat), 'average', rng));
      }
    }
  }, 300_000);
});
