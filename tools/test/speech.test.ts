// Реплики за столом (src/game/speech.ts, docs/09-game-design.md, «Живой стол»): из двух наблюдений места.
import { describe, expect, test } from 'bun:test';
import { apply, observe } from '../../src/engine';
import type { Action, State } from '../../src/engine';
import { speechOf } from '../../src/game/speech';
import { c, pos } from './helpers';

const say = (s: State, seat: number, a: Action, me = 0) => speechOf(observe(s, me), observe(apply(s, seat, a), me));

describe('реплики за столом', () => {
  const s0 = pos({ hands: ['6♠ 6♥ 8♥', '7♣ 9♠ 10♥', '10♠ 6♦ 7♦'], trump: 'Т♦', talon: '8♦ 9♦ 10♦ В♦ Д♦ К♦' });
  test('первый ход и отбой — без реплики, их видно по картам', () => {
    expect(say(s0, 0, { type: 'attack', cards: [c('6♠')] })).toEqual([]);
    const s1 = apply(s0, 0, { type: 'attack', cards: [c('6♠')] });
    expect(say(s1, 1, { type: 'beat', card: c('9♠'), on: c('6♠') })).toEqual([]);
  });
  test('«Беру» — у отбивающегося, «Подкидываю» — у того, у кого убыло карт', () => {
    const s1 = apply(s0, 0, { type: 'attack', cards: [c('6♠')] });
    expect(say(s1, 1, { type: 'take' })).toEqual([{ seat: 1, word: 'take' }]);
    const s2 = apply(s1, 1, { type: 'take' });
    expect(say(s2, 0, { type: 'give', cards: [c('6♥')] })).toEqual([{ seat: 0, word: 'throw' }]);
  });
  test('«пас» при покрытом столе — «Бито», при непокрытом после «Беру» — «Пас»; отбой в сброс — «Бито» последнего', () => {
    const s1 = apply(s0, 0, { type: 'attack', cards: [c('6♠')] });
    const s2 = apply(s1, 1, { type: 'beat', card: c('9♠'), on: c('6♠') });
    expect(say(s2, 0, { type: 'pass' })).toEqual([{ seat: 0, word: 'done' }]);
    const s3 = apply(s2, 0, { type: 'pass' });
    // последним промолчавшим был третий — он и сказал «Бито», стол ушёл в сброс
    expect(say(s3, 2, { type: 'pass' })).toEqual([{ seat: 2, word: 'done' }]);
    const t1 = apply(s1, 1, { type: 'take' });
    expect(say(t1, 0, { type: 'pass' })).toEqual([{ seat: 0, word: 'pass' }]);
  });
  test('перевод — «Перевожу» у переведшего', () => {
    const s = pos({ hands: ['6♠ 8♥', '6♣ 9♠', '10♠ 7♦'], trump: 'Т♦', talon: '8♦ 9♦', variant: 'perevodnoy', bout: 2 });
    const s1 = apply(s, 0, { type: 'attack', cards: [c('6♠')] });
    expect(say(s1, 1, { type: 'transfer', cards: [c('6♣')] })).toEqual([{ seat: 1, word: 'transfer' }]);
  });
  test('новая раздача и другое место — без реплик', () => {
    expect(speechOf(null, observe(s0, 0))).toEqual([]);
    expect(speechOf(observe(s0, 1), observe(s0, 0))).toEqual([]);
  });
});
