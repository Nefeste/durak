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
    case 'resign': return T.game.adviceResign;
  }
}

/** Строка «почему» решения разбора; `done` — как у `actionText`. */
export function whyText(d: Decision, done = false): string {
  const w = d.why;
  switch (w.kind) {
    case 'exactLoses': return T.review.why.exactLoses;
    case 'trumpWasted': return T.review.why.trumpWasted(nameOf(w.card), nameOf(w.on), nameOf(w.plain));
    case 'tookCouldBeat': return T.review.why.tookCouldBeat(nameOf(w.card), nameOf(w.on));
    case 'transferToFewer': return T.review.why.transferToFewer;
    case 'noThrow': return T.review.why.noThrow(list(w.cards));
    case 'better': return T.review.why.better(actionText(d.best, done), d.bestChance, d.playedChance);
  }
}

/** Первая буква строчной, остальное как есть: «В♠» в середине строки остаётся валетом, а не «в♠». */
const lower1 = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Главная ошибка одной строкой — для экрана итога. */
export function worstText(d: Decision): string {
  return T.result.worst(d.bout, d.why.kind === 'better' ? `${actionText(d.played)}; ${lower1(T.review.best(lower1(actionText(d.best))))}` : whyText(d));
}
