// Ряд мест на листе итога (specs/2026-11-art-premium.md, «Круг 2»): вышедшие по порядку, последним — кто остался с
// картами; ничья — только вышедшие; своё место помечено.
import { describe, expect, test } from 'bun:test';
import { resultPlaces } from '../../src/game/outcome';

const who = (seat: number) => (seat === 0 ? { name: 'вы' } : { name: `Бот ${seat}`, sub: 'Средний' });

describe('resultPlaces', () => {
  test('вчетвером: три вышедших и остался с картами', () => {
    const p = resultPlaces({ fool: 2, draw: false, order: [1, 0, 3] }, who, 0);
    expect(p.map(x => [x.n, x.name, x.sub, x.you, x.fool])).toEqual([[1, 'Бот 1', 'Средний', false, false], [2, 'вы', undefined, true, false], [3, 'Бот 3', 'Средний', false, false], [4, 'Бот 2', 'Средний', false, true]]);
  });
  test('вдвоём: вы остались с картами', () => {
    expect(resultPlaces({ fool: 0, draw: false, order: [1] }, who, 0)).toEqual([{ n: 1, name: 'Бот 1', sub: 'Средний', you: false, fool: false }, { n: 2, name: 'вы', you: true, fool: true }]);
  });
  test('ничья: плашки «с картами» нет', () => {
    expect(resultPlaces({ fool: null, draw: true, order: [0, 1] }, who, 0).some(x => x.fool)).toBe(false);
  });
});
