// из nardy: src/state/protocol.ts @ 1d2bdff — версии, коды, ключ, ник, ошибки; столы, вид места и
// события — свои (docs/03-server-api.md): 2–4 места, сервер отдаёт вид места, случайность — колода.
// Общий файл телефона и сервера: без React и без часов.
import type { Action, Card, Observation, Result, RuleSet, ThrowOrder, Variant } from '../engine';
import type { Level } from '../bot';
import { HOLD } from '../game/hold';

export const PROTOCOL = '1.1.0';
/** Самая старая версия игры, с которой сервер говорит; старше — `426 upgrade`. */
export const MIN_APP = '0.2.0';

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}
export const isVersion = (v: unknown): v is string => typeof v === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(v);

/** Буквы кода стола и тега: без похожих `0/O`, `1/I`. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const isCode = (c: unknown): c is string => typeof c === 'string' && /^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}$/.test(c);

/** Ключ устройства: 32 байта в base64url без выравнивания. */
export const isKey = (k: unknown): k is string => typeof k === 'string' && /^[A-Za-z0-9_-]{43}$/.test(k);

/** Зерно телефона — 16 байт hex; зерно сервера — 32 байта hex (колода `durak-deck-v1`). */
export const isSeed = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{32}$/.test(s);
export const isCommit = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);

/** Ник: 2–16 знаков — буквы, цифры, пробел, `-`, `_`. */
export const NAME_RE = /^[\p{L}\p{N} _-]{2,16}$/u;
export const RESERVED_NAMES = ['Игрок', 'Player', 'Бот'];
export function nameProblem(name: unknown): 'bad-name' | 'no-name' | null {
  if (typeof name !== 'string' || !NAME_RE.test(name) || name !== name.trim() || / {2}/.test(name)) return 'bad-name';
  return RESERVED_NAMES.some(r => r.toLowerCase() === name.toLowerCase()) ? 'no-name' : null;
}

/** Числа онлайна — docs/09-game-design.md, «Онлайн» и «Темп». */
export const ONLINE = {
  /** Время на действие. */
  actionMs: 20_000,
  /** Запас на партию: тратится, когда время действия кончилось. */
  bankMs: 60_000,
  /** Три раза подряд решили часы — быстрая игра проиграна, за стол с друзьями садится бот. */
  strikes: 3,
  /** Нет связи столько — за место играет бот «играет бот за Имя» (стол с друзьями). */
  offlineMs: 30_000,
  /** Пауза перед «бито» само, когда подкинуть нечего: и онлайн столько же. */
  autoPassMs: 1500,
  /** Пауза бота перед действием. */
  botMs: 900,
  /** Отбой кончился картой — стол виден столько, прежде чем карты уйдут (src/game/hold.ts); боты ждут её. */
  holdMs: HOLD.ms,
  /** Быстрая игра: через столько без соперника — предложение сыграть с ботом. */
  quickBotOfferMs: 60_000,
  /** Сколько секунд ждут «Реванш» остальные. */
  rematchMs: 120_000,
} as const;

/** Уровень бота, который садится за отключившегося (docs/09-game-design.md, «Стол с друзьями»). */
export type BotLevel = Level;

export type TableKind = 'friend' | 'quick';
export type TableStatus = 'waiting' | 'playing' | 'finished' | 'cancelled';

export interface SeatView {
  /** Ник; у бота — пусто (экран пишет имя уровня). */
  name: string;
  tag: string | null;
  /** Бот на месте: уровень; `null` — человек. */
  bot: Level | null;
  /** За человека сейчас играет бот (нет связи или часы): «играет бот за Имя». */
  botFor: boolean;
  online: boolean;
  /** Карт в руке (из наблюдения). */
  cards: number;
  out: boolean;
  rating?: number;
}

export interface ProofView {
  /** Отпечаток, показанный до раздачи. */
  commit: string;
  /** Зерно сервера, раскрытое после партии. */
  seed: string;
  /** Зёрна мест по порядку мест. */
  seeds: string[];
  deck: Card[];
  first: number;
  actions: { seat: number; action: Action }[];
  algo: 'durak-deck-v1';
}

export interface GameView {
  no: number;
  commit: string;
  /** Номер следующего действия партии. */
  n: number;
  /** Наблюдение места `you` — то же, что видит бот (ADR 0005, 0008). */
  view: Observation | null;
  /** Последнее действие кончило отбой картой: стол этого места в миг, когда она легла (`heldView`), — телефон
   *  показывает его паузой перед «бито» и «беру». После партии — стол последнего отбоя. Иначе `null`; у сервера до
   *  0.8.0 поля нет. */
  held?: Observation | null;
  /** Кто сейчас должен действовать и до какого времени (мс), запас каждого места. */
  waiting: number[];
  deadline: number | null;
  banks: number[];
  result: Result | null;
  proof: ProofView | null;
  /** Отпечаток зерна следующей партии — после конца этой. */
  nextCommit: string | null;
  /** Кто нажал «Реванш». */
  rematch: boolean[];
}

export interface TableView {
  id: string;
  kind: TableKind;
  code: string | null;
  status: TableStatus;
  variant: Variant;
  /** Версия свода стола: «кто успел» — `durak-rules-v1`, «по очереди» — `durak-rules-v2` (ADR 0013). */
  rules: RuleSet['id'];
  /** «Подкидывать» (docs/08-rules.md, п. 4.3). У сервера до очереди поля нет — тогда «кто успел». */
  order?: ThrowOrder;
  host: number;
  /** Уровень ботов на свободные места; `null` — не сажать. */
  bots: Level | null;
  seats: (SeatView | null)[];
  you: number;
  /** Растёт с каждым изменением стола: опрос `?since=` и WebSocket. */
  version: number;
  game: GameView | null;
}

export interface CodeInfo {
  id: string;
  host: string;
  variant: Variant;
  seats: number;
  /** «Подкидывать»; у сервера до очереди поля нет — «кто успел». */
  order?: ThrowOrder;
  taken: number;
  status: TableStatus;
  commit: string;
  /** Вы уже за этим столом. */
  mine: boolean;
  /** Кто где сидит — выбрать место (с 1.1.0 протокола): человек (`name`, `host` — создатель, `you` — вы), бот стола
   *  (`bot` — уровень; на его место можно сесть до начала, бот уйдёт) или `null` — свободно. */
  places?: (CodePlace | null)[];
}

export interface CodePlace { name: string; bot: Level | null; host: boolean; you: boolean }

export interface QuickMe { rating: number; provisional: boolean; games: number }

/** Сколько сейчас ищут быструю игру и сколько её столов играет — как в «Нардах»; у сервера до 0.11.0 этого нет. */
export interface QuickCounts { searching: number; playing: number }

export type QuickView =
  | { status: 'idle'; me: QuickMe; counts?: QuickCounts }
  | { status: 'searching'; since: number; offerBot: boolean; me: QuickMe; counts?: QuickCounts }
  | { status: 'matched'; table: string };

/** Готовые фразы (docs/09-game-design.md, «Фразы»); свободного текста нет. */
export const CHAT = ['hello', 'goodGame', 'wow', 'thanks', 'again', 'smile', 'sad', 'think', 'clap', 'cool', 'fire'] as const;
export type ChatKey = (typeof CHAT)[number];
export const isChat = (m: unknown): m is ChatKey => typeof m === 'string' && (CHAT as readonly string[]).includes(m);

/** Сообщения WebSocket. Каждое `state` собрано для места соединения (ADR 0008). */
export type ClientMessage = { t: 'hello'; key: string; v: string; table: string } | { t: 'ping' };
export type ServerMessage =
  | { t: 'state'; table: TableView }
  | { t: 'say'; seat: number; msg: ChatKey }
  | { t: 'pong'; now: number }
  | { t: 'error'; code: ErrorCode; need?: string };

export const ERRORS = {
  'bad-body': 400,
  'bad-name': 400,
  'no-name': 400,
  'bad-seed': 400,
  'bad-code': 400,
  'bad-variant': 400,
  'bad-seats': 400,
  'bad-level': 400,
  'bad-action': 400,
  'bad-seat': 400,
  illegal: 400,
  'no-key': 401,
  'no-profile': 401,
  'not-at-table': 403,
  'not-host': 403,
  'not-your-turn': 409,
  'no-table': 404,
  'no-route': 404,
  full: 409,
  'seat-taken': 409,
  'not-enough': 409,
  stale: 409,
  'commit-changed': 409,
  'not-waiting': 409,
  'not-playing': 409,
  'not-finished': 409,
  'already-searching': 409,
  upgrade: 426,
  'too-fast': 429,
  server: 500,
} as const;
export type ErrorCode = keyof typeof ERRORS;
