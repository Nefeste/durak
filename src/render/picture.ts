// Раскладка картинки из карт (CardPicture.tsx): где лежит каждая карта. Чистые функции — без Skia, их проверяет
// tools/test/picture.test.ts.
import type { Card } from '../engine';

/** Одно место картинки. */
export type Slot =
  | { kind: 'card'; card: Card; glow?: boolean }
  /** карта атаки, на ней — карта защиты со сдвигом, как на столе; `over: null` — не покрыта */
  | { kind: 'pair'; attack: Card; over: Card | null; glow?: boolean }
  /** колода рубашкой поверх открытого козыря, как у стола слева */
  | { kind: 'talon'; trump: Card }
  /** сброс — стопка рубашкой */
  | { kind: 'discard' }
  /** веер карт внахлёст: рука или порядок старшинства */
  | { kind: 'fan'; cards: Card[] };

export interface PictureSpec { slots: Slot[]; labels?: string[] }

/** Ширина места в долях ширины карты. */
function slotWidth(s: Slot, fan: number): number {
  switch (s.kind) {
    case 'pair': return 1.25;
    case 'talon': return 1.75;
    case 'fan': return 1 + (s.cards.length - 1) * fan;
    default: return 1;
  }
}

/** Карта картинки: по ширине экрана, но не крупнее карты стола и не мельче, чем читается индекс. */
function cardWidth(width: number, slots: Slot[]): { cw: number; fan: number } {
  const fan = 0.42;
  const units = slots.reduce((a, s) => a + slotWidth(s, fan), 0) + (slots.length - 1) * 0.35 + 0.6;
  return { cw: Math.max(34, Math.min(58, Math.floor(width / units))), fan };
}

export interface Placed { key: string; card: Card | null; x: number; y: number; rot: number; glow: boolean }

/** Где лежит каждая карта: середины мест — по ширине, все места по середине высоты. Чистая функция (тест). */
export function placePicture(slots: Slot[], width: number): { cw: number; ch: number; height: number; cards: Placed[]; mids: number[] } {
  const { cw, fan } = cardWidth(width, slots);
  const ch = Math.round((cw * 88) / 63);
  // свободное место — между местами, чтобы подписям под ними было где встать; но не дальше полутора карт
  const sum = slots.reduce((a, s) => a + slotWidth(s, fan) * cw, 0);
  const gap = slots.length > 1 ? Math.max(cw * 0.35, Math.min(cw * 1.6, (width * 0.9 - sum) / (slots.length - 1))) : 0;
  const total = sum + (slots.length - 1) * gap;
  const height = Math.round(ch * 1.5);
  const y = height / 2;
  let x = (width - total) / 2;
  const cards: Placed[] = [];
  const mids: number[] = [];
  slots.forEach((s, i) => {
    const w = slotWidth(s, fan) * cw;
    const left = x;
    mids.push(left + w / 2);
    const k = `${i}-`;
    switch (s.kind) {
      case 'card':
        cards.push({ key: `${k}c`, card: s.card, x: left + cw / 2, y, rot: 0, glow: !!s.glow });
        break;
      case 'pair':
        cards.push({ key: `${k}a`, card: s.attack, x: left + cw / 2, y: y - ch * 0.1, rot: 0, glow: !!s.glow && s.over === null });
        if (s.over !== null) cards.push({ key: `${k}d`, card: s.over, x: left + cw * 0.75, y: y + ch * 0.12, rot: 6, glow: !!s.glow });
        break;
      case 'talon':
        // козырь поперёк, колода сверху со сдвигом вправо — козырь виден наполовину (как layout.ts)
        cards.push({ key: `${k}t`, card: s.trump, x: left + cw * 0.5 + ch * 0.5 - cw * 0.15, y, rot: 90, glow: false });
        for (let n = 0; n < 3; n++) cards.push({ key: `${k}b${n}`, card: null, x: left + cw / 2 - n * 1.2, y: y - n * 1.2, rot: 0, glow: false });
        break;
      case 'discard':
        for (let n = 0; n < 4; n++) cards.push({ key: `${k}s${n}`, card: null, x: left + cw / 2 + (n % 2 ? 2 : -2), y: y - n * 1.5, rot: n % 2 ? 8 : -6, glow: false });
        break;
      case 'fan':
        s.cards.forEach((c, n) => cards.push({ key: `${k}f${n}`, card: c, x: left + cw / 2 + n * cw * fan, y, rot: 0, glow: false }));
        break;
    }
    x += w + gap;
  });
  return { cw, ch, height, cards, mids };
}

