// Соперники-боты с именами и лицами (решение владельца #20, ADR 0011): у каждого уровня — свой состав из трёх
// персонажей, первый — «лицо уровня». Кто сядет за стол, решает только расклад уровней по местам: одинаковый стол —
// одни и те же соперники, поэтому сохранённая партия, разбор старой партии и онлайн-стол (сервер шлёт только уровень
// бота на месте) показывают одни и те же имена без единого нового поля в записи и в протоколе.
// Имена — в словаре (`T.rival`), здесь — только номера персонажей и их вид для портрета (src/game/Portrait.tsx).
// Порядок состава уровня вечный: он решает, кого увидит игрок в сохранённой партии (tools/test/rivals.test.ts).
// Без React — проверяется тестами.
import { LEVELS, LOCKED_LEVEL } from '../bot';
import type { Level } from '../bot';

/** Уровень состава: шесть уровней и закрытое седьмое место (его состав покажется, когда уровень откроется). */
export type CastLevel = Level | typeof LOCKED_LEVEL;

export type RivalId =
  | 'tyoma' | 'asya' | 'gosha'
  | 'katya' | 'kostya' | 'nina'
  | 'vera' | 'zakhar' | 'lida'
  | 'gleb' | 'tamara' | 'fyodor'
  | 'roman' | 'inna' | 'savva'
  | 'stepan' | 'zinaida' | 'efim'
  | 'lev' | 'emma' | 'mark';

/** Причёска — главный силуэт портрета. */
export type Hair = 'short' | 'part' | 'swept' | 'curly' | 'bob' | 'long' | 'bun' | 'tail' | 'pigtails' | 'bald';
/** Одна-две детали поверх: по ним персонажа узнают на плашке в 34 точки. */
export type Extra = 'glasses' | 'specs' | 'moustache' | 'beard' | 'goatee' | 'cap' | 'flatcap' | 'earrings' | 'freckles' | 'headband' | 'collar' | 'shawl';
export type HairColor = 'ink' | 'brown' | 'chestnut' | 'fair' | 'red' | 'grey' | 'white';
export type Cloth = 'wine' | 'teal' | 'slate' | 'moss' | 'plum' | 'rust' | 'sand' | 'night';

/** Вид портрета: цвета — ключи палитры `PORTRAIT` в src/ui/theme.ts. */
export interface Look {
  skin: 0 | 1 | 2;
  hair: Hair;
  hairColor: HairColor;
  cloth: Cloth;
  extras: readonly Extra[];
  /** Цвет кепки, ободка, шали — если не как у одежды. */
  trim?: Cloth;
}

export interface Rival {
  id: RivalId;
  level: CastLevel;
  /** Женское имя: «вышла», а не «вышел». */
  she: boolean;
  look: Look;
}

const r = (id: RivalId, level: CastLevel, she: boolean, look: Look): Rival => ({ id, level, she, look });

/** Состав по уровням. Первый — лицо уровня: с одним ботом такого уровня за столом сидит он. */
export const CAST: Record<CastLevel, readonly [Rival, Rival, Rival]> = {
  novice: [
    r('tyoma', 'novice', false, { skin: 0, hair: 'short', hairColor: 'chestnut', cloth: 'rust', extras: ['cap'], trim: 'teal' }),
    r('asya', 'novice', true, { skin: 0, hair: 'pigtails', hairColor: 'fair', cloth: 'plum', extras: [] }),
    r('gosha', 'novice', false, { skin: 1, hair: 'curly', hairColor: 'ink', cloth: 'moss', extras: [] }),
  ],
  beginner: [
    r('katya', 'beginner', true, { skin: 0, hair: 'tail', hairColor: 'chestnut', cloth: 'wine', extras: [] }),
    r('kostya', 'beginner', false, { skin: 0, hair: 'short', hairColor: 'red', cloth: 'slate', extras: ['freckles'] }),
    r('nina', 'beginner', true, { skin: 1, hair: 'bob', hairColor: 'ink', cloth: 'sand', extras: ['earrings'] }),
  ],
  amateur: [
    r('vera', 'amateur', true, { skin: 0, hair: 'bob', hairColor: 'brown', cloth: 'teal', extras: ['glasses'] }),
    r('zakhar', 'amateur', false, { skin: 1, hair: 'short', hairColor: 'ink', cloth: 'moss', extras: ['beard'] }),
    r('lida', 'amateur', true, { skin: 0, hair: 'long', hairColor: 'fair', cloth: 'rust', extras: ['headband'], trim: 'wine' }),
  ],
  average: [
    r('gleb', 'average', false, { skin: 0, hair: 'part', hairColor: 'chestnut', cloth: 'slate', extras: ['moustache', 'collar'] }),
    r('tamara', 'average', true, { skin: 1, hair: 'bun', hairColor: 'ink', cloth: 'wine', extras: ['earrings'] }),
    r('fyodor', 'average', false, { skin: 0, hair: 'short', hairColor: 'fair', cloth: 'sand', extras: ['specs'] }),
  ],
  experienced: [
    r('roman', 'experienced', false, { skin: 1, hair: 'swept', hairColor: 'ink', cloth: 'plum', extras: ['goatee', 'collar'] }),
    r('inna', 'experienced', true, { skin: 0, hair: 'long', hairColor: 'red', cloth: 'teal', extras: [] }),
    r('savva', 'experienced', false, { skin: 2, hair: 'bald', hairColor: 'brown', cloth: 'rust', extras: ['beard'] }),
  ],
  master: [
    r('stepan', 'master', false, { skin: 1, hair: 'short', hairColor: 'grey', cloth: 'slate', extras: ['flatcap', 'moustache'], trim: 'moss' }),
    r('zinaida', 'master', true, { skin: 0, hair: 'bun', hairColor: 'white', cloth: 'wine', extras: ['glasses', 'shawl'], trim: 'sand' }),
    r('efim', 'master', false, { skin: 0, hair: 'bald', hairColor: 'white', cloth: 'moss', extras: ['beard', 'specs'] }),
  ],
  neural: [
    r('lev', 'neural', false, { skin: 0, hair: 'swept', hairColor: 'fair', cloth: 'night', extras: ['collar'] }),
    r('emma', 'neural', true, { skin: 1, hair: 'tail', hairColor: 'ink', cloth: 'sand', extras: ['earrings'] }),
    r('mark', 'neural', false, { skin: 2, hair: 'part', hairColor: 'ink', cloth: 'slate', extras: ['specs'] }),
  ],
};

/** Все уровни состава по порядку силы. */
export const CAST_LEVELS: CastLevel[] = [...LEVELS, LOCKED_LEVEL];
/** Все персонажи по порядку: уровни по силе, в уровне — по порядку состава. */
export const ALL_RIVALS: Rival[] = CAST_LEVELS.flatMap(l => [...CAST[l]]);

/**
 * Кто сидит на местах ботов. `bots` — уровень бота на каждом месте стола (`null` — человек или пусто), `from` — место,
 * от которого идёт счёт по часовой стрелке: без сети — ваше (0), онлайн — место создателя стола (оно одно для всех
 * за столом, поэтому все видят одни и те же имена). Бот получает первого персонажа своего уровня, которого за этим
 * столом ещё нет: один «Средний» — всегда лицо уровня, три «Средних» — весь состав, без повторов.
 */
export function rivalsAt(bots: readonly (CastLevel | null | undefined)[], from = 0): (Rival | null)[] {
  const n = bots.length;
  const out: (Rival | null)[] = Array(n).fill(null);
  const used = new Map<CastLevel, number>();
  for (let k = 1; k <= n; k++) {
    const seat = (((from + k) % n) + n) % n;
    const level = bots[seat];
    if (!level) continue;
    const i = used.get(level) ?? 0;
    used.set(level, i + 1);
    const cast = CAST[level];
    out[seat] = cast[i % cast.length];
  }
  return out;
}

/** Стол с ботами без сети: вы — на месте 0, боты — на местах 1 … `levels.length` (уровни по местам). */
export function rivalsOf(levels: readonly CastLevel[]): (Rival | null)[] {
  return rivalsAt([null, ...levels], 0);
}
