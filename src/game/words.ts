// Действие словами — для подсказки, разбора и задачи дня (тексты — src/i18n).
import { nameOf } from '../engine';
import type { Action, Card } from '../engine';
import type { Decision } from '../bot';
import { T } from '../i18n';

const list = (cs: Card[]) => cs.map(nameOf).join(' ');

/** `done` — всё покрыто: «пас» ходящего здесь значит «бито». */
export function actionText(a: Action, done = false): string {
  switch (a.type) {
    case 'attack': return T.game.adviceAttack(list(a.cards));
    case 'throwIn':
    case 'give': return T.game.adviceThrow(list(a.cards));
    case 'beat': return T.game.adviceBeat(nameOf(a.on), nameOf(a.card));
    case 'transfer': return T.game.adviceTransfer(list(a.cards));
    case 'take': return T.game.adviceTake;
    case 'pass': return done ? T.game.adviceDone : T.game.advicePass;
  }
}

/** Строка «почему» решения разбора. */
export function whyText(d: Decision): string {
  const w = d.why;
  switch (w.kind) {
    case 'exactLoses': return T.review.why.exactLoses;
    case 'trumpWasted': return T.review.why.trumpWasted(nameOf(w.card), nameOf(w.on), nameOf(w.plain));
    case 'tookCouldBeat': return T.review.why.tookCouldBeat(nameOf(w.card), nameOf(w.on));
    case 'transferToFewer': return T.review.why.transferToFewer;
    case 'noThrow': return T.review.why.noThrow(list(w.cards));
    case 'better': return T.review.why.better(actionText(d.best), d.bestChance, d.playedChance);
  }
}

/** Главная ошибка одной строкой — для экрана итога. */
export function worstText(d: Decision): string {
  return T.result.worst(d.bout, d.why.kind === 'better' ? `${actionText(d.played)}; ${T.review.best(actionText(d.best)).toLowerCase()}` : whyText(d));
}
