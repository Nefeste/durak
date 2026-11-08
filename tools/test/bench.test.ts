// «Замер» (src/game/bench.ts; docs/06-testing.md, «Замер»): сцены дают то, что обещают, — 36 карт на столе при
// раздаче вчетвером, 12 карт со стола уходят в руку, зеркальный стол сдвигает каждую карту; сводка кадров считает
// медиану и долю кадров дольше 25 мс, как требует устав (ADR 0023).
import { describe, expect, test } from 'bun:test';
import { legalActions, stateFrom } from '../../src/engine';
import { botPositions, dealScene, frameSummary, mirrored, takeScene, withinBudget } from '../../src/game/bench';
import { layoutTable, noOrigins } from '../../src/render/layout';
import type { Observation } from '../../src/engine';

const SIZE = { width: 396, height: 560 };
const lay = (o: Observation) => layoutTable(o, { ...SIZE, origins: noOrigins(), order: 'suit', picked: null, targets: [] });

describe('сцены замера', () => {
  test('раздача вчетвером: на столе все 36 карт, лицом — только свои шесть и козырь', () => {
    const l = lay(dealScene());
    expect(l.sprites.length).toBe(36);
    expect(new Set(l.sprites.map(s => s.key)).size).toBe(36);
    expect(l.sprites.filter(s => s.card !== null).length).toBe(7);
  });

  test('«беру»: двенадцать карт стола — те же ключи в руке, число карт не меняется', () => {
    const { before, after } = takeScene();
    expect(before.table.flat().length).toBe(12);
    const a = lay(before), b = lay(after);
    expect(a.sprites.length).toBe(b.sprites.length);
    const moved = before.table.flat().map(c => `c${c}`);
    for (const k of moved) {
      const x = a.sprites.find(s => s.key === k)!, y = b.sprites.find(s => s.key === k)!;
      expect(x && y).toBeTruthy();
      expect(Math.hypot(x.x - y.x, x.y - y.y)).toBeGreaterThan(20);
    }
    expect(after.hand.length).toBe(18);
  });

  test('зеркальный стол: каждая из 36 карт меняет место, дважды — как было', () => {
    const l = lay(dealScene()), m = mirrored(l);
    const moved = l.sprites.filter((s, i) => Math.abs(s.x - m.sprites[i].x) > 1 || s.rot !== m.sprites[i].rot);
    // карта ровно посередине сукна не сдвинется — таких нет
    expect(moved.length).toBe(36);
    const r = (x: number) => Math.round(x * 1000) / 1000 + 0;
    expect(mirrored(m).sprites.map(s => [r(s.x), r(s.rot)])).toEqual(l.sprites.map(s => [r(s.x), r(s.rot)]));
  });

  test('позиции «Мастера»: восемь, у решающего есть действия', () => {
    const ps = botPositions(8);
    expect(ps.length).toBe(8);
    for (const o of ps) {
      const s = stateFrom(o, o.handSizes.map(() => []), []);
      expect(legalActions(s, o.seat).length).toBeGreaterThan(0);
    }
  });
});

describe('сводка кадров', () => {
  test('медиана, p95, доля долгих и худший', () => {
    const f = frameSummary([8, 8, 9, 30, 8, 8, 8, 8, 8, 40]);
    expect(f.n).toBe(10);
    expect(f.p50).toBe(8);
    expect(f.long).toBe(20);
    expect(f.worst).toBe(40);
    expect(frameSummary([]).n).toBe(0);
    expect(frameSummary([10, 20]).p50).toBe(15);
  });

  test('бюджет: 60 к/с по медиане и не больше 1 % кадров дольше 25 мс', () => {
    expect(withinBudget(frameSummary(Array(200).fill(8.3)))).toBe(true);
    expect(withinBudget(frameSummary([...Array(99).fill(8.3), 30]))).toBe(true);
    expect(withinBudget(frameSummary([...Array(98).fill(8.3), 30, 30]))).toBe(false);
    expect(withinBudget(frameSummary(Array(100).fill(20)))).toBe(false);
    expect(withinBudget(frameSummary([]))).toBe(false);
  });
});
