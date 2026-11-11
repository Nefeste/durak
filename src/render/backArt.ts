// Рубашки, нарисованные кодом (ADR 0010; docs/13-art.md §11): десять узоров — только геометрия, без букв, лиц и
// чужих колод. У каждой: основа, скос света, рамка в 7 % ширины от края, узор внутри рамки. Узор одинаков в обе
// стороны (поворот на 180° ничего не меняет): по рубашке не узнать, как карта повёрнута. Цвета — `BACKS` в theme.ts;
// каталог — backs.ts. Картинка записывается один раз, как лица (faces.ts).
import { ClipOp, Skia } from '@shopify/react-native-skia';
import type { SkCanvas, SkPicture } from '@shopify/react-native-skia';
import { BACKS } from '../ui/theme';
import type { BackId } from './backs';
import { fill, record, rrect, shadow, sheen, stroke, suitPath } from './paper';

interface Ink { line: string; mark: string }
/** Узор в рамке: середина карты — (0,0), `u` — ширина карты, `hw`, `hh` — половины поля узора. */
type Pattern = (cv: SkCanvas, u: number, hw: number, hh: number, ink: Ink) => void;

/** Узор, у которого есть «верх»: рисуется в верхней половине, нижняя — она же, повёрнутая на 180°. */
const twoWay = (half: Pattern): Pattern => (cv, u, hw, hh, ink) => {
  for (const turn of [0, 180]) {
    cv.save();
    cv.rotate(turn, 0, 0);
    cv.clipRect(Skia.XYWHRect(-hw - 1, -hh - 1, hw * 2 + 2, hh + 1), ClipOp.Intersect, true);
    half(cv, u, hw, hh, ink);
    cv.restore();
  }
};

/** Узлы клетки с шагом `sx × sy`, симметрично от середины; `stagger` — нечётные ряды сдвинуты на полшага. */
function grid(hw: number, hh: number, sx: number, sy: number, stagger: boolean, at: (x: number, y: number, i: number, j: number) => void) {
  const nj = Math.ceil(hh / sy) + 1, ni = Math.ceil(hw / sx) + 1;
  for (let j = -nj; j <= nj; j++) {
    const shift = stagger && j % 2 !== 0 ? sx / 2 : 0;
    for (let i = -ni; i <= ni; i++) at(i * sx + shift, j * sy, i, j);
  }
}

const PATTERNS: Record<BackId, Pattern> = {
  // ромбы клеткой — прежняя рубашка
  classic: (cv, u, hw, hh, ink) => {
    const p = fill(ink.line, 0.45), step = u * 0.16;
    grid(hw, hh, step, step, false, (x, y) => {
      const d = suitPath(2, step * 0.55);
      d.offset(x, y);
      cv.drawPath(d, p);
    });
  },
  // косая сетка с точкой в каждом узле
  indigo: (cv, u, hw, hh, ink) => {
    const line = stroke(ink.line, Math.max(0.7, u * 0.011), 0.38), dot = fill(ink.mark, 0.9);
    const step = u * 0.2, far = hw + hh;
    for (let k = -12; k <= 12; k++) {
      cv.drawLine(k * step - far, -far, k * step + far, far, line);
      cv.drawLine(k * step + far, -far, k * step - far, far, line);
    }
    grid(hw, hh, step, step / 2, true, (x, y) => cv.drawCircle(x, y, u * 0.022, dot));
  },
  // «ёлочка»: ряды уголков, к середине карты остриём
  pine: twoWay((cv, u, hw, hh, ink) => {
    const p = stroke(ink.line, Math.max(0.9, u * 0.018), 0.7);
    const sx = u * 0.19, sy = u * 0.1, a = u * 0.075, b = u * 0.035;
    grid(hw, hh, sx, sy, true, (x, y) => {
      if (y > -sy * 0.2) return;
      const v = Skia.Path.Make();
      v.moveTo(x - a, y - b); v.lineTo(x, y + b); v.lineTo(x + a, y - b);
      cv.drawPath(v, p);
    });
  }),
  // плетение: пары коротких штрихов то вдоль, то поперёк
  weave: (cv, u, hw, hh, ink) => {
    const p = stroke(ink.line, Math.max(1, u * 0.02), 0.62);
    const g = u * 0.19, len = u * 0.062, gap = u * 0.034;
    grid(hw, hh, g, g, false, (x, y, i, j) => {
      const along = (((i + j) % 2) + 2) % 2 === 0;
      for (const s of [-gap, gap]) {
        if (along) cv.drawLine(x - len, y + s, x + len, y + s, p);
        else cv.drawLine(x + s, y - len, x + s, y + len, p);
      }
    });
  },
  // лучи от круглого медальона в середине
  rays: (cv, u, hw, hh, ink) => {
    const far = Math.hypot(hw, hh), n = 28;
    for (let k = 0; k < n; k++) {
      const t = (k / n) * Math.PI * 2 + Math.PI / n;
      const p = stroke(ink.line, Math.max(0.8, u * (k % 2 ? 0.012 : 0.018)), k % 2 ? 0.32 : 0.6);
      cv.drawLine(Math.cos(t) * u * 0.19, Math.sin(t) * u * 0.19, Math.cos(t) * far, Math.sin(t) * far, p);
    }
    cv.drawCircle(0, 0, u * 0.15, stroke(ink.line, Math.max(1, u * 0.018), 0.85));
    cv.drawCircle(0, 0, u * 0.1, stroke(ink.line, Math.max(0.7, u * 0.01), 0.5));
    const d = suitPath(2, u * 0.11);
    cv.drawPath(d, fill(ink.mark, 0.9));
  },
  // шестилучевые звёздочки вразбежку
  frost: (cv, u, hw, hh, ink) => {
    const p = stroke(ink.line, Math.max(0.8, u * 0.014), 0.7), r = u * 0.062;
    grid(hw, hh, u * 0.21, u * 0.18, true, (x, y) => {
      for (const deg of [90, 30, 150]) {
        const t = (deg * Math.PI) / 180;
        cv.drawLine(x - Math.cos(t) * r, y - Math.sin(t) * r, x + Math.cos(t) * r, y + Math.sin(t) * r, p);
      }
    });
  },
  // ряды полукругов внахлёст, как чешуя; к середине карты — выпуклой стороной
  scales: twoWay((cv, u, hw, hh, ink) => {
    const p = stroke(ink.line, Math.max(0.9, u * 0.015), 0.6), r = u * 0.1;
    grid(hw, hh, r * 2, r, true, (x, y) => {
      if (y > -r * 0.4) return;
      cv.drawArc(Skia.XYWHRect(x - r, y - r, r * 2, r * 2), 0, 180, false, p);
    });
  }),
  // зигзаги во всю ширину, через один толще; сверху и снизу — остриём к середине
  chevron: twoWay((cv, u, hw, hh, ink) => {
    const amp = u * 0.085, per = u * 0.24, sy = u * 0.135;
    const rows = Math.ceil(hh / sy) + 1, n = Math.ceil(hw / per) + 1;
    for (let j = 0; j <= rows; j++) {
      const y = -sy * 0.55 - j * sy;
      const z = Skia.Path.Make();
      z.moveTo(-n * per, y - amp / 2);
      for (let i = -n; i < n; i++) { z.lineTo(i * per + per / 2, y + amp / 2); z.lineTo((i + 1) * per, y - amp / 2); }
      cv.drawPath(z, j % 2 ? stroke(ink.line, Math.max(0.8, u * 0.012), 0.42) : stroke(ink.line, Math.max(1.4, u * 0.028), 0.72));
    }
  }),
  // четыре масти мелко, клеткой: красные и чёрные через одну
  suits: twoWay((cv, u, hw, hh, ink) => {
    const red = fill(ink.line, 0.9), black = fill(ink.mark, 0.85), s = u * 0.19;
    grid(hw, hh, s, s, false, (x, y, i, j) => {
      const yy = y - s / 2;
      if (yy > -s * 0.2) return;
      const suit = (((i + 2 * j) % 4) + 4) % 4;
      const d = suitPath(suit, u * 0.105);
      d.offset(x + s / 2, yy);
      cv.drawPath(d, suit >= 2 ? red : black);
    });
  }),
  // вложенные ромбы от середины
  amber: (cv, u, hw, hh, ink) => {
    const k = hh / hw;
    for (let n = 1; n <= 9; n++) {
      const a = n * u * 0.085, d = Skia.Path.Make();
      d.moveTo(0, -a * k); d.lineTo(a, 0); d.lineTo(0, a * k); d.lineTo(-a, 0); d.close();
      cv.drawPath(d, stroke(ink.line, Math.max(0.8, u * (n % 2 ? 0.02 : 0.011)), n % 2 ? 0.62 : 0.4));
    }
    cv.drawPath(suitPath(2, u * 0.1), fill(ink.mark, 0.85));
  },
};

/** Рубашка `id` размера `cw × ch` с тенью карты — картинка с серединой в (0,0). */
export function makeBack(cw: number, ch: number, id: BackId): SkPicture {
  const r = Math.round(cw * 0.1), c = BACKS[id];
  return record(cw, ch, cv => {
    shadow(cv, cw, ch, r);
    rrect(cv, cw, ch, r, c.base);
    sheen(cv, cw, ch, r);
    const m = cw * 0.07;
    // узор — внутри рамки, с зазором от неё
    const hw = cw / 2 - m - cw * 0.035, hh = ch / 2 - m - cw * 0.035;
    cv.save();
    cv.clipRRect(Skia.RRectXY(Skia.XYWHRect(-hw, -hh, hw * 2, hh * 2), r * 0.5, r * 0.5), ClipOp.Intersect, true);
    PATTERNS[id](cv, cw, hw, hh, { line: c.line, mark: c.mark });
    cv.restore();
    rrect(cv, cw - m * 2, ch - m * 2, r * 0.7, c.line, Math.max(1, cw * 0.018));
  });
}
