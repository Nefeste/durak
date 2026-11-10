// Каталог рубашек (docs/09-game-design.md, «Рубашки»; docs/13-art.md §11): десять, три бесплатны всегда. Только
// данные — без Skia: каталог читают права (src/money) и тесты под Bun. Рисунок — backArt.ts, цвета — `BACKS` в
// src/ui/theme.ts. Идентификаторы — навсегда: они в настройках игрока и в товарах RuStore (`theme_<id>`).
export const FREE_BACKS = ['classic', 'indigo', 'pine'] as const;
export const PAID_BACKS = ['weave', 'rays', 'frost', 'scales', 'chevron', 'suits', 'amber'] as const;
export const ALL_BACKS = [...FREE_BACKS, ...PAID_BACKS] as const;

export type FreeBackId = (typeof FREE_BACKS)[number];
export type PaidBackId = (typeof PAID_BACKS)[number];
export type BackId = FreeBackId | PaidBackId;

/** Рубашка по умолчанию — прежняя, «Бордо». */
export const DEFAULT_BACK: BackId = 'classic';

export const isBack = (v: unknown): v is BackId => (ALL_BACKS as readonly unknown[]).includes(v);
export const isPaidBack = (v: unknown): v is PaidBackId => (PAID_BACKS as readonly unknown[]).includes(v);
