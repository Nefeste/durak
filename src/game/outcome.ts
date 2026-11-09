// Итог партии как ряд мест (specs/2026-11-art-premium.md, «Круг 2»): кто вышел по порядку и кто остался с картами —
// для листа итога с ботами и онлайн. Без React — проверяется tools/test/result.test.ts.
import type { Result } from '../engine';

/** Место в ряду итога: номер выхода, имя, своё ли, остался ли с картами. */
export interface ResultPlace { n: number; name: string; sub?: string; you: boolean; fool: boolean }
/** Имя места: своё — «вы»; бот — «Бот N» и уровень второй строкой (в одну строку не помещается). */
export interface Who { name: string; sub?: string }

/** Ряд мест по `Result`: вышедшие по порядку, последним — кто остался с картами; ничья — все вышедшие. Чистая функция. */
export function resultPlaces(r: Result, who: (seat: number) => Who, you: number): ResultPlace[] {
  const out: ResultPlace[] = r.order.map((seat, i) => ({ n: i + 1, ...who(seat), you: seat === you, fool: false }));
  if (!r.draw && r.fool !== null) out.push({ n: out.length + 1, ...who(r.fool), you: r.fool === you, fool: true });
  return out;
}

