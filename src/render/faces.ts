// Лица и рубашка карт, нарисованные кодом (ADR 0010): индекс в двух углах русскими буквами
// (В, Д, К, Т), масть — путь, нарисованный здесь же, у В, Д, К — крупная буква с орнаментом
// масти вместо фигуры. Каждое лицо записывается один раз в SkPicture размера карты; холст
// только ставит картинки на места (дёшево на кадр, docs/specs/2026-11-v1.md, «Бюджет»).
import { PaintStyle, Skia } from '@shopify/react-native-skia';
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

function fill(color: string) {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(color));
  paint.setAntiAlias(true);
  return paint;
}

/** Все 36 лиц и рубашка размера `cw × ch`; шрифт индекса — Onest (OFL, `assets/fonts/`). */
export function makeFaces(cw: number, ch: number, font: SkFont, small: SkFont, fourColor: boolean): Faces {
  const r = Math.round(cw * 0.1);
  const colors = suitColors(fourColor);
  const bounds = Skia.XYWHRect(-cw / 2 - 2, -ch / 2 - 2, cw + 4, ch + 4);
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
      rrect(cv, cw, ch, r, C.face);
      rrect(cv, cw, ch, r, C.faceLine, 1);
      const label = T.ranks[rank];
      const ink = fill(color);
      const ix = -cw / 2 + cw * 0.09, iy = -ch / 2 + font.getSize() * 0.95;
      cv.drawText(label, ix, iy, ink, font);
      const pip = suitPath(suit, cw * 0.2);
      pip.offset(ix + widthOf(font, label === '10' ? '1' : label) * 0.35 + cw * 0.06, iy + cw * 0.16);
      cv.drawPath(pip, ink);
      // нижний угол — тот же индекс вверх ногами
      cv.save();
      cv.rotate(180, 0, 0);
      cv.drawText(label, ix, iy, ink, font);
      cv.drawPath(pip, ink);
      cv.restore();
      if (rank >= 5 && rank <= 7) {
        // В, Д, К — крупная буква в рамке-орнаменте масти
        const frame = fill(color);
        frame.setStyle(PaintStyle.Stroke); frame.setStrokeWidth(1.2);
        cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(-cw * 0.28, -ch * 0.3, cw * 0.56, ch * 0.6), r * 0.6, r * 0.6), frame);
        const w = widthOf(small, label);
        cv.drawText(label, -w / 2, small.getSize() * 0.36, ink, small);
        for (const [dx, dy] of [[-0.18, -0.22], [0.18, -0.22], [-0.18, 0.22], [0.18, 0.22]]) {
          const d = suitPath(suit, cw * 0.11);
          d.offset(dx * cw, dy * ch);
          cv.drawPath(d, ink);
        }
      } else {
        const big = suitPath(suit, cw * (rank === 8 ? 0.5 : 0.36));
        cv.drawPath(big, ink);
      }
    }));
  }
  const back = rec(cv => {
    rrect(cv, cw, ch, r, C.back);
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
