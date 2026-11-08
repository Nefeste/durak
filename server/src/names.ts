// из nardy: server/src/names.ts @ 1d2bdff
// Ник для незнакомых в быстрой игре (docs/specs/2026-10-quick-match.md): корни мата и
// оскорблений — ник с ними показывается как «Соперник». Фильтр грубый и ловит не всё;
// подстраховка — жалобы (две от разных игроков прячут ник). Только на сервере: телефон узнаёт
// итог из `QuickMe.shown`.

const BAD_ROOTS = [
  'хуй', 'хуе', 'хуя', 'хуи', 'пизд', 'ебан', 'ебал', 'ебат', 'ебло', 'ебуч', 'еблан', 'бля', 'сука', 'суки', 'сучк', 'мудак', 'мудил',
  'пидор', 'пидар', 'педик', 'гандон', 'гондон', 'залуп', 'шлюх', 'шалав', 'дроч', 'мраз', 'ублюд', 'долбо', 'говн', 'жопа', 'дерьм',
  'нацист', 'гитлер', 'fuck', 'shit', 'bitch', 'cunt', 'dick', 'nigg', 'fagg', 'whore', 'slut', 'nazi', 'hitler',
];
/** Латиница, похожая на кириллицу: «xyй» — тоже «хуй». */
const LOOKALIKE: Record<string, string> = { a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', y: 'у', k: 'к', m: 'м', t: 'т', b: 'в', h: 'н' };

export function nameIsClean(name: string): boolean {
  const flat = name.toLowerCase().replace(/ё/g, 'е').replace(/[\s_\-0-9]/g, '');
  const cyr = flat.replace(/[aeopcxykmtbh]/g, ch => LOOKALIKE[ch]);
  return !BAD_ROOTS.some(r => flat.includes(r) || cyr.includes(r));
}
