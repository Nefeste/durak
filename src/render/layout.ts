// Раскладка стола (docs/09-game-design.md, «Экран партии»): чистая функция наблюдения места —
// где лежит каждая карта, откуда она прилетает, что подсвечено. Холст (TableCanvas) только рисует
// эти места и плавно переводит карты из старых в новые. Скрытые карты соперников и колоды — без
// своих номеров: ключи `h<место>-<i>` и `t-<i>`; лицо есть только у карт, которые место видит
// (ADR 0005, 0008). Карты, взятые соперником в открытую, лицом — только с «Помощью памяти»
// (`showOpenly`; решение владельца 08.11.2026, docs/09-game-design.md): игрок держит их в памяти,
// как за настоящим столом. Без React — проверяется тестами.
import { rankOf, suitOf } from '../engine';
import type { Card, Observation } from '../engine';

export type HandOrder = 'suit' | 'rank';

export interface Sprite {
  key: string;
  /** Лицо карты; `null` — рубашка. */
  card: Card | null;
  x: number;
  y: number;
  /** Поворот, градусы. */
  rot: number;
  scale: number;
  z: number;
  /** Подсвечено как место, куда можно положить выбранную карту. */
  glow: boolean;
  /** Откуда прилетает, если ключ новый (из колоды, от места соперника). */
  from: { x: number; y: number };
}

export interface Seat {
  seat: number;
  /** Середина веера соперника. */
  x: number;
  y: number;
}

export interface Layout {
  cw: number;
  ch: number;
  sprites: Sprite[];
  /** Места соперников: имена и значки над веером рисует экран. */
  opponents: Seat[];
  talon: { x: number; y: number };
  discard: { x: number; y: number };
  /** Прямоугольник стола — сюда бросают карту перетаскиванием. */
  table: { x: number; y: number; w: number; h: number };
  /** Верх руки: экран ставит подсказку и кнопки над ним. */
  handTop: number;
  /** Сукно: от вееров соперников до кнопок, во всю ширину. */
  felt: { x: number; y: number; w: number; h: number };
  /** Плашки соперников (src/game/SeatPlate.tsx): верх и высота места под них над веером. */
  plate: { top: number; height: number };
}

export interface LayoutOptions {
  width: number;
  height: number;
  order: HandOrder;
  /** Выбранная карта руки: она приподнята. */
  picked: Card | null;
  /** Куда её можно положить: карты атаки на столе. */
  targets: Card[];
  /** Показывать лицом карты, взятые соперником в открытую («Помощь памяти»); по умолчанию — рубашкой. */
  showOpenly?: boolean;
  /** Кто положил карты на стол и кто взял стол — откуда им лететь (`originsOf`). */
  origins?: Origins;
  /** Высота плашки соперника над веером (`plateHeight`); по умолчанию — три строки обычным шрифтом. */
  plate?: number;
}

/** Плашка соперника (docs/13-art.md, §3 «Надписи целиком»): имя — строка 20 точек, остальные строки — по 17, поля 4
 *  и кромка. Каждая надпись — своей строкой, без многоточия; крупный шрифт телефона плашка растит до ×1,3. */
export const PLATE = { name: 20, line: 17, pad: 5, maxScale: 1.3 } as const;

/** Название стола в верхней полосе растёт с шрифтом телефона не больше, чем в ×1,15: так на 360 точках рядом с ним
 *  помещаются «В меню» и «Вышедшие» (13-art.md, §3). */
export const TITLE_SCALE = 1.15;

/** Высота плашки из `lines` строк (имя и строки под ним) при шрифте телефона `fontScale`. */
export function plateHeight(lines: number, fontScale = 1): number {
  const k = Math.min(PLATE.maxScale, Math.max(1, fontScale));
  return Math.ceil((PLATE.name + PLATE.line * Math.max(0, lines - 1)) * k + PLATE.pad * 2);
}

/** Откуда летят новые карты: место, положившее карту на стол, и место, взявшее стол. */
export interface Origins {
  byCard: Map<Card, number>;
  /** Место, которое только что взяло карты со стола: его новые скрытые карты летят со стола. */
  took: number | null;
}

export const noOrigins = (): Origins => ({ byCard: new Map(), took: null });

/**
 * Кто сделал то, что изменилось между двумя наблюдениями (одного и того же места): новая карта стола —
 * от того места, у которого стало меньше карт; если стол опустел, а сброс не вырос, — отбивавшийся взял стол. Только из наблюдений — работает и с ботами, и онлайн, где ходов нет.
 * `byCard` прошлых карт стола сохраняется, пока карта на столе.
 */
export function originsOf(prev: Observation | null, next: Observation, was: Origins): Origins {
  const onTable = new Set(next.table.flatMap(([a, d]) => (d === null ? [a] : [a, d])));
  const byCard = new Map([...was.byCard].filter(([c]) => onTable.has(c)));
  if (!prev || prev.seats !== next.seats) return { byCard, took: null };
  const had = new Set(prev.table.flatMap(([a, d]) => (d === null ? [a] : [a, d])));
  const fresh = next.table.flatMap(([a, d]) => (d === null ? [a] : [a, d])).filter(c => !had.has(c));
  // у кого убыло карт: столько карт он и положил
  const left = next.handSizes.map((n, seat) => Math.max(0, prev.handSizes[seat] - n));
  for (const c of fresh) {
    // защита — от отбивающегося; атака, подкидывание и перевод — от того, у кого убыло, кроме отбивающегося
    // (после перевода отбивается уже следующий, а карта ушла из руки переведшего)
    const isDefence = next.table.some(([, d]) => d === c);
    let seat = isDefence
      ? (left[next.defender] > 0 ? next.defender : -1)
      : left.findIndex((n, s) => n > 0 && s !== next.defender);
    if (seat < 0) seat = isDefence ? next.defender : next.attacker;
    if (left[seat] > 0) left[seat]--;
    byCard.set(c, seat);
  }
  // стол опустел, а сброс не вырос — карты забрал отбивавшийся
  const took = prev.table.length > 0 && next.table.length === 0 && next.discard.length === prev.discard.length ? prev.defender : null;
  return { byCard, took };
}

/** Порядок руки: «по мастям, козыри справа» или «по старшинству» (козыри всё равно справа). */
export function sortHand(hand: Card[], trumpSuit: number, order: HandOrder): Card[] {
  const key = (c: Card) => {
    const trump = suitOf(c) === trumpSuit ? 1 : 0;
    return order === 'suit'
      ? trump * 1000 + suitOf(c) * 100 + rankOf(c)
      : trump * 1000 + rankOf(c) * 10 + suitOf(c);
  };
  return [...hand].sort((a, b) => key(a) - key(b));
}

/** Высота строки подсказки и ряда кнопок над рукой. */
export const CONTROLS = 100;
/** Зазор от низа ряда кнопок до верха руки. Подсказка и кнопки стоят на нём и растут вверх, на сукно, а не вниз, на
 *  карты руки: длинная подсказка в две строки или крупный шрифт не закрывают руку (13-art.md, §3 «Надписи целиком»). */
export const CONTROLS_GAP = 16;

/** Небольшой постоянный поворот карты в сбросе — по номеру карты, без случайности. */
const tilt = (c: Card) => ((c * 37) % 21) - 10;

export function layoutTable(o: Observation, opt: LayoutOptions): Layout {
  const { width: W, height: H } = opt;
  const cw = Math.round(Math.min(W / 6, 78, H / 9));
  const ch = Math.round((cw * 88) / 63);
  const m = Math.round(cw * 0.25);
  const sprites: Sprite[] = [];
  let z = 0;
  const trumpSuit = suitOf(o.trump);

  // соперники: по часовой стрелке от вас — слева направо по верху
  const others = Array.from({ length: o.seats - 1 }, (_, i) => (o.seat + 1 + i) % o.seats);
  // место под плашку (имя, уровень, число карт, роль) над веером соперника: плашка кончается у верха веера
  const plateH = opt.plate ?? 66;
  const plateTop = Math.max(0, m - 8);
  const oppY = Math.round(ch * 0.55 * 0.5 + plateTop + plateH);
  const opponents: Seat[] = others.map((seat, i) => ({ seat, x: Math.round((W * (2 * i + 1)) / (2 * others.length)), y: oppY }));
  const oppScale = 0.55;
  for (const p of opponents) {
    const openly = opt.showOpenly ? o.openly[p.seat] : [];
    const hidden = Math.max(0, o.handSizes[p.seat] - openly.length);
    const n = hidden + openly.length;
    const step = Math.min(cw * oppScale * 0.32, (W / others.length - cw * oppScale - m) / Math.max(1, n - 1));
    const x0 = p.x - (step * (n - 1)) / 2;
    const all: (Card | null)[] = [...Array(hidden).fill(null), ...sortHand(openly, trumpSuit, 'suit')];
    all.forEach((c, i) => {
      sprites.push({
        key: c === null ? `h${p.seat}-${i}` : `c${c}`, card: c,
        x: x0 + i * step, y: p.y, rot: (i - (n - 1) / 2) * 3, scale: oppScale, z: z++, glow: false,
        from: { x: 0, y: 0 },
      });
    });
  }
  // новая скрытая карта соперника — из колоды, а если он только что взял стол — со стола (ниже)
  const fanEnd = z;

  // середина стола — между веерами соперников и строкой подсказки с кнопками над рукой
  const handY = Math.round(H - ch * 0.62);
  const top = oppY + (ch * oppScale) / 2 + m;
  const bottom = handY - ch / 2 - CONTROLS;
  const midY = Math.round((top + bottom) / 2);
  // колода слева: открытый козырь поперёк под стопкой рубашек

  const talon = { x: Math.round(m + ch / 2), y: midY };
  if (o.talonSize > 0) {
    sprites.push({ key: `c${o.trump}`, card: o.trump, x: talon.x + cw * 0.35, y: talon.y, rot: 90, scale: 1, z: z++, glow: false, from: talon });
    const backs = o.talonSize - 1;
    for (let i = 0; i < backs; i++) {
      sprites.push({ key: `t-${i}`, card: null, x: talon.x - cw * 0.1 - Math.min(i, 6) * 0.6, y: talon.y - Math.min(i, 6) * 0.6, rot: 0, scale: 1, z: z++, glow: false, from: talon });
    }
  }

  // сброс справа: рубашками, вразброс
  const discard = { x: Math.round(W - m - cw / 2), y: midY };
  for (const c of o.discard) {
    sprites.push({ key: `c${c}`, card: null, x: discard.x, y: discard.y, rot: tilt(c), scale: 1, z: z++, glow: false, from: discard });
  }

  // стол: пары «атака — защита» в два ряда по три
  const tx = Math.round(talon.x + ch / 2 + m), tw = Math.round(discard.x - cw / 2 - m - tx);
  const pairW = cw * 1.35, pairH = Math.min(ch * 1.3, (bottom - top) / 2);
  const tableBox = { x: tx, y: Math.round(midY - pairH), w: tw, h: Math.round(pairH * 2) };
  const n = o.table.length;
  const perRow = n <= 3 ? Math.max(1, n) : 3;
  const rows = Math.ceil(n / perRow) || 1;
  const mine = { x: W / 2, y: handY };
  const seatPoint = (seat: number) => (seat === o.seat ? mine : opponents.find(p => p.seat === seat) ?? mine);
  const origin = (c: Card, fallback: number) => seatPoint(opt.origins?.byCard.get(c) ?? fallback);
  const middle = { x: tx + tw / 2, y: midY };
  for (let i = 0; i < fanEnd; i++) {
    const sp = sprites[i];
    if (!sp.key.startsWith('h')) continue;
    const seat = Number(sp.key.slice(1, sp.key.indexOf('-')));
    sp.from = opt.origins?.took === seat ? middle : talon;
  }
  o.table.forEach(([a, d], i) => {
    const row = Math.floor(i / perRow), col = i % perRow;
    const inRow = Math.min(perRow, n - row * perRow);
    const x = tx + tw / 2 + (col - (inRow - 1) / 2) * Math.min(pairW, tw / perRow) - cw * 0.08;
    const y = midY + (row - (rows - 1) / 2) * pairH * 0.92 - ch * 0.08;
    sprites.push({ key: `c${a}`, card: a, x, y, rot: -3, scale: 1, z: z++, glow: opt.targets.includes(a), from: origin(a, o.attacker) });
    if (d !== null) {
      sprites.push({ key: `c${d}`, card: d, x: x + cw * 0.2, y: y + ch * 0.22, rot: 6, scale: 1, z: z++, glow: false, from: origin(d, o.defender) });
    }
  });

  // рука снизу веером; выбранная карта приподнята
  const hand = sortHand(o.hand, trumpSuit, opt.order);
  const hn = hand.length;
  const span = W - 2 * m - cw;
  const step = hn > 1 ? Math.min(cw * 0.72, span / (hn - 1)) : 0;
  const x0 = W / 2 - (step * (hn - 1)) / 2;
  hand.forEach((c, i) => {
    const t = hn > 1 ? i / (hn - 1) - 0.5 : 0;
    sprites.push({
      key: `c${c}`, card: c, x: x0 + i * step, y: handY + t * t * ch * 0.25 - (opt.picked === c ? ch * 0.22 : 0),
      rot: t * 10, scale: 1, z: z++, glow: false, from: talon,
    });
  });

  return {
    cw, ch, sprites, opponents, talon, discard, table: tableBox,
    handTop: Math.round(handY - ch * 0.75),
    felt: { x: Math.round(m / 2), y: Math.round(top - m / 2), w: Math.round(W - m), h: Math.round(bottom - top + m) },
    plate: { top: plateTop, height: plateH },
  };
}

/** Какая карта руки под точкой: верхняя из перекрывающихся (рука рисуется слева направо). */
export function handCardAt(l: Layout, x: number, y: number, hand: Card[]): Card | null {
  for (let i = l.sprites.length - 1; i >= 0; i--) {
    const s = l.sprites[i];
    if (s.card === null || !hand.includes(s.card) || !s.key.startsWith('c')) continue;
    if (Math.abs(x - s.x) <= l.cw / 2 && Math.abs(y - s.y) <= l.ch / 2) return s.card;
  }
  return null;
}

/** Какая карта атаки на столе под точкой (для «бить на …» перетаскиванием). */
export function tableCardAt(l: Layout, x: number, y: number, table: [Card, Card | null][]): Card | null {
  const attack = new Set(table.map(([a]) => a));
  let best: Card | null = null, dist = Infinity;
  for (const s of l.sprites) {
    if (s.card === null || !attack.has(s.card)) continue;
    const d = Math.hypot(x - s.x, y - s.y);
    if (d < dist && Math.abs(x - s.x) <= l.cw * 0.8 && Math.abs(y - s.y) <= l.ch * 0.8) { best = s.card; dist = d; }
  }
  return best;
}

export const inTable = (l: Layout, x: number, y: number): boolean =>
  x >= l.table.x && x <= l.table.x + l.table.w && y >= l.table.y && y <= l.table.y + l.table.h;

