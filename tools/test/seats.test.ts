// Схема мест стола с друзьями (src/game/seats.ts): «напротив», «слева», «справа» — как соперники над рукой.
import { describe, expect, test } from 'bun:test';
import { placeRows, whereOf } from '../../src/game/seats';

describe('места за столом с друзьями', () => {
  test('вчетвером через одно — напротив, следующее — слева, предпоследнее — справа', () => {
    expect([0, 1, 2, 3].map(s => whereOf(s, 0, 4))).toEqual([null, 'left', 'opposite', 'right']);
    expect([0, 1, 2, 3].map(s => whereOf(s, 2, 4))).toEqual(['opposite', 'right', null, 'left']);
    expect([0, 1, 2].map(s => whereOf(s, 0, 3))).toEqual([null, 'left', 'right']);
    expect([0, 1].map(s => whereOf(s, 1, 2))).toEqual(['opposite', null]);
  });

  test('схема: каждое место один раз, создатель внизу, напротив — наверху', () => {
    for (const n of [2, 3, 4]) {
      for (let host = 0; host < n; host++) {
        const rows = placeRows(host, n);
        expect(rows.flat().sort()).toEqual([...Array(n).keys()]);
        expect(rows[rows.length - 1]).toEqual([host]);
        if (n !== 3) expect(whereOf(rows[0][0], host, n)).toBe('opposite');
        // слева направо — как соперники над рукой: по часовой стрелке от создателя
        for (const row of rows) if (row.length === 2) expect([whereOf(row[0], host, n), whereOf(row[1], host, n)]).toEqual(['left', 'right']);
      }
    }
  });
});
