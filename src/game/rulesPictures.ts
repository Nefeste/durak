// Картинки экрана «Правила» (docs/09-game-design.md, «Первая партия»): какие карты где лежат. Текст разделов и
// подписи — в src/i18n (T.rules), правила — только в docs/08-rules.md; здесь только примеры к ним. Козырь в
// примерах — червы.
import { cardOf } from '../engine';
import type { Slot } from '../render/picture';
import type { RulesSection } from '../i18n';

const S = 0, CL = 1, D = 2, H = 3; // ♠ ♣ ♦ ♥ — порядок движка
const R6 = 0, R7 = 1, R8 = 2, R9 = 3, R10 = 4, J = 5, Q = 6, K = 7, A = 8;
const c = cardOf;

/** Карты примеров по разделам; подписи мест — `T.rules.pictures[раздел]`, по одной на место. */
export const RULES_PICTURES: Partial<Record<RulesSection, Slot[]>> = {
  goal: [{ kind: 'fan', cards: [R6, R7, R8, R9, R10, J, Q, K, A].map(r => c(H, r)) }],
  deal: [{ kind: 'talon', trump: c(H, K) }, { kind: 'fan', cards: [c(S, R6), c(S, Q), c(CL, R9), c(D, R7), c(D, A), c(H, R8)] }],
  beat: [
    { kind: 'pair', attack: c(S, R8), over: c(S, Q) },
    { kind: 'pair', attack: c(D, A), over: c(H, R7) },
    { kind: 'pair', attack: c(H, R10), over: c(H, J) },
  ],
  throw: [{ kind: 'pair', attack: c(CL, R7), over: c(CL, R9) }, { kind: 'card', card: c(D, R7), glow: true }, { kind: 'card', card: c(S, R9), glow: true }],
  take: [{ kind: 'pair', attack: c(D, R8), over: c(D, Q) }, { kind: 'pair', attack: c(S, K), over: null, glow: true }],
  done: [{ kind: 'pair', attack: c(CL, R6), over: c(CL, R10) }, { kind: 'pair', attack: c(S, R6), over: c(H, R6) }, { kind: 'discard' }],
  draw: [{ kind: 'talon', trump: c(H, K) }, { kind: 'fan', cards: [c(S, R7), c(S, K), c(CL, J), c(D, R9), c(D, R10), c(H, Q)] }],
  transfer: [{ kind: 'card', card: c(S, R10) }, { kind: 'card', card: c(D, R10), glow: true }],
  end: [{ kind: 'discard' }, { kind: 'fan', cards: [c(CL, R8), c(S, A)] }],
};
