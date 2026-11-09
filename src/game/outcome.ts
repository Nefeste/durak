// Итог партии как ряд мест (specs/2026-11-art-premium.md, «Круг 2»): кто вышел по порядку и кто остался с картами —
// для листа итога с ботами и онлайн. Без React — проверяется tools/test/result.test.ts.
import { placesOf } from '../engine';
import type { Result } from '../engine';

/** Место в ряду итога: номер выхода, имя, своё ли, остался ли с картами (сдавшийся — тоже, docs/08-rules.md, п. 8.5). */
export interface ResultPlace { n: number; name: string; sub?: string; you: boolean; fool: boolean; resigned?: boolean }
/** Имя места: своё — «вы»; бот — «Бот N» и уровень второй строкой (в одну строку не помещается). */
export interface Who { name: string; sub?: string }

/** Ряд мест по `Result`: вышедшие по порядку, затем кто остался с картами, затем сдавшиеся (кто сдался раньше —
 *  ниже); ничья — все вышедшие. Чистая функция. */
export function resultPlaces(r: Result, who: (seat: number) => Who, you: number): ResultPlace[] {
  const resigned = r.resigned ?? [];
  return placesOf(r).map((seat, i) => {
    const gave = resigned.includes(seat);
    const lost = gave || (!r.draw && r.fool === seat);
    return { n: i + 1, ...who(seat), you: seat === you, fool: lost, ...(gave ? { resigned: true } : {}) };
  });
}
