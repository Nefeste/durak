// Позиции для золотых тестов: руки и прикуп записью людей (`'6♠ 7♠'`).
import { cards, limitOf, parseCard, RULES_V1 } from '../../src/engine';
import type { RuleSet, State, Variant } from '../../src/engine';

export interface Pos {
  hands: string[];
  /** Прикуп сверху вниз без козыря; козырь — `trump`. Пустая строка — прикуп пуст. */
  talon?: string;
  trump: string;
  variant?: Variant;
  attacker?: number;
  defender?: number;
  bout?: number;
  rules?: Partial<RuleSet>;
  /** Козырь уже взят из прикупа (прикуп пуст). */
  talonEmpty?: boolean;
}

export function pos(p: Pos): State {
  const rules = { ...RULES_V1, ...p.rules };
  const hands = p.hands.map(cards);
  const seats = hands.length;
  const attacker = p.attacker ?? 0;
  const defender = p.defender ?? (attacker + 1) % seats;
  const trump = parseCard(p.trump);
  const talon = p.talonEmpty ? [] : [...cards(p.talon ?? ''), trump];
  const bout = p.bout ?? 1;
  return {
    rules, variant: p.variant ?? 'podkidnoy', seats, hands, talon, trump,
    table: [], discard: [], openly: hands.map(() => []),
    starter: attacker, attacker, defender, passed: hands.map(() => false),
    boutLimit: limitOf(rules, bout, hands[defender].length), bout, out: [], phase: 'bout', result: null,
  };
}

export const c = parseCard;
export const cs = cards;
