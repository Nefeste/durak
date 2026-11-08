// Уровни ботов на арене (docs/10-bot.md, «Арена»): лестница идёт вверх. Полная лестница — 2 000 партий на
// пару, `tools/sim/ladder.ts`, отчёт в docs/reports/; здесь — короткие проверки, что порядок держится.
import { describe, expect, test } from 'bun:test';
import { apply, newGame, observe, RULES_V1 } from '../../src/engine';
import { adviseThink, legalFor, makeRng, think, thinkSync } from '../../src/bot';
import { actorOf } from '../../src/bot/sim';
import { arena } from '../sim/arena';
import { shuffled } from '../sim/play';

describe('боты', () => {
  test('«Средний» обыгрывает «Новичка» на зеркальных раздачах', () => {
    const r = arena(150, 'average', 'novice', 'podkidnoy', 5);
    expect(r.low).toBeGreaterThan(0.6);
  }, 60_000);
  test('и в переводном', () => {
    const r = arena(150, 'average', 'novice', 'perevodnoy', 6);
    expect(r.low).toBeGreaterThan(0.6);
  }, 60_000);
  test('«Опытный» (расклады) обыгрывает «Среднего»', () => {
    const r = arena(40, 'experienced', 'average', 'podkidnoy', 9);
    expect(r.low).toBeGreaterThan(0.5);
  }, 120_000);
});

describe('думать кусками', () => {
  test('«Сильный» отдаёт управление после каждого расклада, и решение то же, что подряд', () => {
    const rng = makeRng(4);
    let s = newGame({ rules: RULES_V1, variant: 'podkidnoy', seats: 2, first: 0 }, shuffled(rng));
    // позиция, где есть из чего выбирать
    while (legalFor(observe(s, actorOf(s))).length < 4) s = apply(s, actorOf(s), thinkSync(think(observe(s, actorOf(s)), 'average', rng)));
    const o = observe(s, actorOf(s));
    let yields = 0;
    const t = think(o, 'master', makeRng(1));
    let r = t.next();
    while (!r.done) { yields++; r = t.next(false); }
    expect(yields).toBeGreaterThan(50);
    expect(r.value).toEqual(thinkSync(think(o, 'master', makeRng(1))));
  }, 60_000);
  test('сигнал «хватит» — ответ сразу, из досчитанного', () => {
    const rng = makeRng(8);
    const s = newGame({ rules: RULES_V1, variant: 'perevodnoy', seats: 3, first: 0 }, shuffled(rng));
    const o = observe(s, actorOf(s));
    const a = thinkSync(think(o, 'master', makeRng(2)), 3);
    expect(a).toBeTruthy();
  });
});

describe('подсказка', () => {
  test('в концовке вдвоём — точный расчёт', () => {
    const rng = makeRng(13);
    for (let g = 0; g < 40; g++) {
      let s = newGame({ rules: RULES_V1, variant: 'podkidnoy', seats: 2, first: 0 }, shuffled(rng));
      while (s.phase !== 'end' && s.talon.length > 0) s = apply(s, actorOf(s), thinkSync(think(observe(s, actorOf(s)), 'average', rng)));
      if (s.phase === 'end') continue;
      const o = observe(s, actorOf(s));
      const a = thinkSync(adviseThink(o, makeRng(1), 16, 100_000));
      if (a.chance === null) continue;
      expect(a.exact).toBe(true);
      expect([0, 0.5, 1]).toContain(a.chance);
      return;
    }
    throw new Error('не нашлось концовки');
  }, 60_000);
});

describe('кусками на часах', () => {
  test('кусками по часам — то же решение, что подряд, и шаг поиска короткий', async () => {
    const { thinkSliced } = await import('../../src/game/think');
    const rng = makeRng(31);
    let s = newGame({ rules: RULES_V1, variant: 'perevodnoy', seats: 2, first: 0 }, shuffled(rng));
    let checked = 0, longest = 0;
    for (let n = 0; n < 40 && s.phase !== 'end'; n++) {
      const o = observe(s, actorOf(s));
      if (legalFor(o).length > 2) {
        const sync = thinkSync(think(o, 'master', makeRng(n)));
        const sliced = await thinkSliced(think(o, 'master', makeRng(n)), 1e9, 1).promise;
        expect(sliced).toEqual(sync);
        // шаг — работа между двумя `yield`: одно доигрывание или 48 узлов концовки
        const t = think(o, 'master', makeRng(n));
        let at = performance.now();
        for (let r = t.next(); !r.done; r = t.next(false)) { const now = performance.now(); longest = Math.max(longest, now - at); at = now; }
        checked++;
      }
      s = apply(s, actorOf(s), thinkSync(think(o, 'average', rng)));
    }
    expect(checked).toBeGreaterThan(5);
    // в Bun шаг — доли миллисекунды; на Hermes без JIT — в 20–40 раз дольше (docs/10-bot.md, «Скорость»)
    expect(longest).toBeLessThan(25);
  }, 120_000);
});
