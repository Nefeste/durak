// Поиск по раскладам и точная концовка (docs/10-bot.md): быстрое доигрывание решает так же, как правила
// «Среднего»; решатель концовки совпадает с полным перебором; поиск видит только наблюдение.
import { describe, expect, test } from 'bun:test';
import { apply, legalActions, newGame, observe, RULES_V1 } from '../../src/engine';
import { makeRng } from '../../src/bot';
import { actorFast, decideFast } from '../../src/bot/fast';
import { chooseByRules } from '../../src/bot/rules';
import { actorOf, ROLLOUT } from '../../src/bot/sim';
import { bruteValue, solver } from '../../src/bot/endgame';
import { shuffled } from '../sim/play';
import { pos } from './helpers';

describe('быстрое доигрывание', () => {
  test('тот же ходящий и то же решение, что у правил «Среднего», на 40 000 позиций', () => {
    const rng = makeRng(21);
    let checked = 0;
    for (let g = 0; g < 800; g++) {
      let s = newGame({ rules: RULES_V1, variant: g % 2 ? 'perevodnoy' : 'podkidnoy', seats: 2 + (g % 3), first: g % 2 }, shuffled(rng));
      for (let n = 0; n < 200 && s.phase !== 'end'; n++) {
        const who = actorOf(s);
        expect(actorFast(s)).toBe(who);
        const slow = chooseByRules(observe(s, who), ROLLOUT, makeRng(1), legalActions(s, who));
        expect(decideFast(s, who, makeRng(1))).toEqual(slow);
        checked++;
        // дальше — случайным законным, чтобы встретить и странные позиции
        const legal = legalActions(s, who);
        s = apply(s, who, n % 3 ? slow : legal[rng.int(legal.length)]);
      }
    }
    expect(checked).toBeGreaterThan(40_000);
  }, 120_000);
});

describe('точная концовка вдвоём', () => {
  test('решатель с памятью совпадает с полным перебором на маленьких позициях', () => {
    const rng = makeRng(7);
    let n = 0;
    for (let g = 0; g < 400; g++) {
      // случайные руки по 1–3 карты, прикуп пуст
      const deck = shuffled(rng);
      const a = 1 + rng.int(3), b = 1 + rng.int(3);
      const name = (c: number) => ['6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'][c % 9] + ['♠', '♣', '♦', '♥'][Math.floor(c / 9)];
      const s = pos({
        hands: [deck.slice(0, a).map(name).join(' '), deck.slice(a, a + b).map(name).join(' ')],
        trump: name(deck[20]), talonEmpty: true, variant: g % 2 ? 'perevodnoy' : 'podkidnoy',
      });
      for (const me of [0, 1]) {
        expect(solver(me).value(s)).toBe(bruteValue(s, me));
        n++;
      }
    }
    expect(n).toBe(800);
  }, 120_000);
});
