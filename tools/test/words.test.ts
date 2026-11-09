// Главная ошибка на листе итога (аудит 09.11.2026, находка 3): строчной становится только первая буква совета, индекс
// карты остаётся как есть — «ходите В♠ В♣», а не «ходите в♠ в♣» (валет — «В», 13-art.md, ADR 0010).
import { describe, expect, test } from 'bun:test';
import { cards } from '../../src/engine';
import type { Decision } from '../../src/bot';
import { worstText } from '../../src/game/words';

const decision = (played: string, best: string): Decision => ({
  at: 3, bout: 1, played: { type: 'attack', cards: cards(played) }, best: { type: 'attack', cards: cards(best) },
  grade: 'error', exact: false, bestChance: 0.7, playedChance: 0.4, loss: 30, why: { kind: 'better' } as Decision['why'],
});

describe('worstText', () => {
  test('валет и дама в совете — заглавными, «лучше» и «ходите» — строчными', () => {
    expect(worstText(decision('8♦', 'В♠ В♣'))).toBe('Главная ошибка — 2-й отбой: Ходите 8♦; лучше: ходите В♠ В♣');
    expect(worstText(decision('7♥', 'Д♠'))).toContain('лучше: ходите Д♠');
  });
});
