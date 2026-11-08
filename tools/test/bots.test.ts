// Уровни ботов на арене (docs/10-bot.md, «Арена»): лестница идёт вверх. Цель лестницы — 60 % у
// каждого соседа; этап А проверяет только, что «Средний» уверенно сильнее «Новичка».
import { describe, expect, test } from 'bun:test';
import { arena } from '../sim/arena';

describe('боты', () => {
  test('«Средний» обыгрывает «Новичка» на зеркальных раздачах', () => {
    const r = arena(150, 'average', 'novice', 'podkidnoy', 5);
    expect(r.low).toBeGreaterThan(0.6);
  }, 60_000);
  test('и в переводном', () => {
    const r = arena(150, 'average', 'novice', 'perevodnoy', 6);
    expect(r.low).toBeGreaterThan(0.6);
  }, 60_000);
});
