// Лица и рубашка карт, нарисованные кодом (ADR 0010): индекс в двух углах русскими буквами
// (В, Д, К, Т), масть — путь, нарисованный здесь же, у В, Д, К — «двуглавая» картинка буквой в рамке-картуше
// с мастями (`courtArt`) вместо фигуры. Каждое лицо записывается один раз в SkPicture размера карты; холст
// только ставит картинки на места (дёшево на кадр, docs/specs/2026-11-v1.md, «Бюджет»).
import { PaintStyle, Skia, TileMode } from '@shopify/react-native-skia';
import type { SkCanvas, SkFont, SkPath, SkPicture } from '@shopify/react-native-skia';
import { DECK_SIZE, rankOf, suitOf } from '../engine';
import type { Card } from '../engine';
import { T } from '../i18n';
import { C, suitColors } from '../ui/theme';

/** Путь масти в квадрате 1 × 1 с серединой в (0,0): ♠ ♣ ♦ ♥. */
export function suitPath(suit: number, size: number): SkPath {
  const p = Skia.Path.Make();
  const s = size;
  if (suit === 2) { // ♦
    p.moveTo(0, -0.5 * s); p.lineTo(0.38 * s, 0); p.lineTo(0, 0.5 * s); p.lineTo(-0.38 * s, 0); p.close();
  } else if (suit === 3) { // ♥
    p.moveTo(0, 0.45 * s);
    p.cubicTo(-0.55 * s, 0.05 * s, -0.5 * s, -0.48 * s, -0.12 * s, -0.42 * s);
    p.cubicTo(-0.04 * s, -0.4 * s, 0, -0.32 * s, 0, -0.25 * s);
    p.cubicTo(0, -0.32 * s, 0.04 * s, -0.4 * s, 0.12 * s, -0.42 * s);
    p.cubicTo(0.5 * s, -0.48 * s, 0.55 * s, 0.05 * s, 0, 0.45 * s);
    p.close();
  } else if (suit === 0) { // ♠
    p.moveTo(0, -0.5 * s);
    p.cubicTo(0.2 * s, -0.25 * s, 0.5 * s, -0.08 * s, 0.42 * s, 0.14 * s);
    p.cubicTo(0.36 * s, 0.32 * s, 0.12 * s, 0.32 * s, 0.04 * s, 0.18 * s);
    p.lineTo(0.14 * s, 0.5 * s); p.lineTo(-0.14 * s, 0.5 * s); p.lineTo(-0.04 * s, 0.18 * s);
    p.cubicTo(-0.12 * s, 0.32 * s, -0.36 * s, 0.32 * s, -0.42 * s, 0.14 * s);
    p.cubicTo(-0.5 * s, -0.08 * s, -0.2 * s, -0.25 * s, 0, -0.5 * s);
    p.close();
  } else { // ♣
    const r = 0.21 * s;
    p.addCircle(0, -0.24 * s, r);
    p.addCircle(-0.24 * s, 0.06 * s, r);
    p.addCircle(0.24 * s, 0.06 * s, r);
    p.moveTo(-0.06 * s, 0.05 * s); p.lineTo(0.06 * s, 0.05 * s); p.lineTo(0.15 * s, 0.5 * s); p.lineTo(-0.15 * s, 0.5 * s); p.close();
  }
  return p;
}

export interface Faces {
  cw: number;
  ch: number;
  face: (c: Card) => SkPicture;
  back: SkPicture;
  /** Рамка подсветки поверх карты. */
  glow: SkPicture;
}

function rrect(cv: SkCanvas, w: number, h: number, r: number, color: string, stroke?: number) {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(color));
  paint.setAntiAlias(true);
  if (stroke) { paint.setStyle(PaintStyle.Stroke); paint.setStrokeWidth(stroke); }
  cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(-w / 2, -h / 2, w, h), r, r), paint);
}

/** Ширина строки: сумма ширин глифов — measureText в CanvasKit (веб) не реализован. */
function widthOf(font: SkFont, text: string): number {
  return font.getGlyphWidths(font.getGlyphIDs(text)).reduce((a, b) => a + b, 0);
}

function fill(color: string, alpha?: number) {
  const paint = Skia.Paint();
  const c = Skia.Color(color);
  if (alpha !== undefined) c[3] = alpha;
  paint.setColor(c);
  paint.setAntiAlias(true);
  return paint;
}

/** Сколько тень выходит за карту: граница записи картинки. */
export const SHADOW_PAD = 8;

/** Мягкая тень под картой (13-art.md §5): свет сверху — тень смещена вниз, светлее к краям. Стопка скруглённых
 *  прямоугольников убывающей плотности вместо размытия: записывается один раз, на кадр ничего не считается. */
function shadow(cv: SkCanvas, cw: number, ch: number, r: number) {
  const dy = Math.max(2, cw * 0.035);
  for (let i = 0; i < 4; i++) {
    const grow = i * 1.6;
    const p = fill(C.black, 0.11 - i * 0.022);
    cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(-cw / 2 - grow / 2, -ch / 2 - grow / 2 + dy, cw + grow, ch + grow), r + grow / 2, r + grow / 2), p);
  }
}

/** Скос света на бумаге: едва светлее сверху. Статичный, в картинке. */
function sheen(cv: SkCanvas, cw: number, ch: number, r: number) {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  const top = Skia.Color(C.text), bottom = Skia.Color(C.text);
  top[3] = 0.16; bottom[3] = 0;
  p.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: -ch / 2 }, { x: 0, y: ch * 0.1 }, [top, bottom], null, TileMode.Clamp));
  cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(-cw / 2, -ch / 2, cw, ch), r, r), p);
}

/** В, Д, К (ADR 0010, лист стиля 13-art.md): фигуры людей нет — вместо неё «двуглавая» картинка, как у настоящих
 *  фигур, но буквой: рамка-картуш с ромбиками в открытых углах, по середине — перевязь с мастями (у В одна, у Д две, у К три, чтобы
 *  картинки различались не только буквой), на её концах — масть на рамке; буква сверху и та же вверх ногами снизу.
 *  Углы рамки у индексов прячутся под «ярлыки» индекса (рисует `makeFaces` поверх). Всё — путями и шрифтом Onest. */
function courtArt(cv: SkCanvas, cw: number, ch: number, r: number, suit: number, rank: number, label: string, color: string, small: SkFont) {
  const ink = fill(color);
  const line = (w: number) => { const p = fill(color); p.setStyle(PaintStyle.Stroke); p.setStrokeWidth(w); return p; };
  const halo = fill(C.face);
  const a = cw * 0.33, b = ch * 0.38;
  cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(-a, -b, a * 2, b * 2), r * 0.7, r * 0.7), line(1.2));
  // открытые углы рамки (у индексов угол уходит под ярлык) — ромбик масти-орнамента
  for (const [x, y] of [[a, -b], [-a, b]]) {
    const d = suitPath(2, cw * 0.09);
    d.offset(x, y);
    cv.drawCircle(x, y, cw * 0.06, halo);
    cv.drawPath(d, ink);
  }
  // перевязь: линия от рамки до рамки, масти на ней — на кружке цвета лица, линия под ними прерывается
  cv.drawLine(-a, 0, a, 0, line(0.8));
  const n = rank - 4, step = cw * 0.13, size = cw * 0.11;
  const spots: [number, number][] = [[-a, size * 1.05], [a, size * 1.05]];
  for (let k = 0; k < n; k++) spots.push([(k - (n - 1) / 2) * step, size]);
  for (const [x, s] of spots) {
    cv.drawCircle(x, 0, s * 0.62, halo);
    const d = suitPath(suit, s);
    d.offset(x, 0);
    cv.drawPath(d, ink);
  }
  // буква — в верхней половине и та же вверх ногами в нижней; мельче шрифта стола, чтобы не касаться перевязи и рамки
  const k = 0.8, w = widthOf(small, label) * k;
  for (const turn of [0, 180]) {
    cv.save();
    cv.rotate(turn, 0, 0);
    cv.translate(-w / 2, -ch * 0.1);
    cv.scale(k, k);
    cv.drawText(label, 0, 0, ink, small);
    cv.restore();
  }
}

/** Все 36 лиц и рубашка размера `cw × ch`; шрифт индекса — Onest (OFL, `assets/fonts/`). */
export function makeFaces(cw: number, ch: number, font: SkFont, small: SkFont, fourColor: boolean): Faces {
  const r = Math.round(cw * 0.1);
  const colors = suitColors(fourColor);
  const bounds = Skia.XYWHRect(-cw / 2 - SHADOW_PAD, -ch / 2 - SHADOW_PAD, cw + SHADOW_PAD * 2, ch + SHADOW_PAD * 2);
  const rec = (draw: (cv: SkCanvas) => void): SkPicture => {
    const recorder = Skia.PictureRecorder();
    const cv = recorder.beginRecording(bounds);
    draw(cv);
    return recorder.finishRecordingAsPicture();
  };
  const faces: SkPicture[] = [];
  for (let c = 0; c < DECK_SIZE; c++) {
    const suit = suitOf(c), rank = rankOf(c), color = colors[suit];
    faces.push(rec(cv => {
      shadow(cv, cw, ch, r);
      rrect(cv, cw, ch, r, C.face);
      sheen(cv, cw, ch, r);
      rrect(cv, cw, ch, r, C.faceLine, 1);
      const label = T.ranks[rank];
      const ink = fill(color);
      const ix = -cw / 2 + cw * 0.09, iy = -ch / 2 + font.getSize() * 0.95;
      const pip = suitPath(suit, cw * 0.2);
      pip.offset(ix + widthOf(font, label === '10' ? '1' : label) * 0.35 + cw * 0.06, iy + cw * 0.16);
      const court = rank >= 5 && rank <= 7;
      if (court) courtArt(cv, cw, ch, r, suit, rank, label, color, small);
      // индекс: верхний угол и тот же вверх ногами в нижнем; у картинок под ним — «ярлык» цвета лица поверх рамки
      for (const turn of [0, 180]) {
        cv.save();
        cv.rotate(turn, 0, 0);
        if (court) {
          const b = pip.computeTightBounds();
          const pad = cw * 0.03;
          cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(-cw / 2 + 1, -ch / 2 + 1, b.x + b.width + pad + cw / 2 - 1, b.y + b.height + pad + ch / 2 - 1), r, r), fill(C.face));
        }
        cv.drawText(label, ix, iy, ink, font);
        cv.drawPath(pip, ink);
        cv.restore();
      }
      if (!court) {
        const big = suitPath(suit, cw * (rank === 8 ? 0.5 : 0.36));
        cv.drawPath(big, ink);
      }
    }));
  }
  const back = rec(cv => {
    shadow(cv, cw, ch, r);
    rrect(cv, cw, ch, r, C.back);
    sheen(cv, cw, ch, r);
    rrect(cv, cw - cw * 0.14, ch - cw * 0.14, r * 0.7, C.backLine, 1.2);
    const line = fill(C.backLine);
    line.setAlphaf(0.45);
    // ромбы клеткой — свой орнамент рубашки
    const step = cw * 0.16;
    for (let y = -ch / 2 + cw * 0.16; y < ch / 2 - cw * 0.12; y += step) {
      for (let x = -cw / 2 + cw * 0.16; x < cw / 2 - cw * 0.12; x += step) {
        const d = suitPath(2, step * 0.55);
        d.offset(x + step / 2, y + step / 2);
        cv.drawPath(d, line);
      }
    }
  });
  const glow = rec(cv => rrect(cv, cw + 2, ch + 2, r + 1, C.glow, 3));
  return { cw, ch, face: c => faces[c], back, glow };
}
