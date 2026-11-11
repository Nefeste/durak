// Бумага карты (13-art.md §5): общее для лиц (faces.ts) и рубашек (backArt.ts) — путь масти, краски, тень под
// картой, скос света, запись картинки размера карты. Всё рисуется один раз в SkPicture.
import { PaintStyle, Skia, StrokeCap, StrokeJoin, TileMode } from '@shopify/react-native-skia';
import type { SkCanvas, SkFont, SkPaint, SkPath, SkPicture } from '@shopify/react-native-skia';
import { C } from '../ui/theme';

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

export function rrect(cv: SkCanvas, w: number, h: number, r: number, color: string, stroke?: number) {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(color));
  paint.setAntiAlias(true);
  if (stroke) { paint.setStyle(PaintStyle.Stroke); paint.setStrokeWidth(stroke); }
  cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(-w / 2, -h / 2, w, h), r, r), paint);
}

/** Ширина строки: сумма ширин глифов — measureText в CanvasKit (веб) не реализован. */
export function widthOf(font: SkFont, text: string): number {
  return font.getGlyphWidths(font.getGlyphIDs(text)).reduce((a, b) => a + b, 0);
}

export function fill(color: string, alpha?: number): SkPaint {
  const paint = Skia.Paint();
  const c = Skia.Color(color);
  if (alpha !== undefined) c[3] = alpha;
  paint.setColor(c);
  paint.setAntiAlias(true);
  return paint;
}

/** Сколько тень выходит за карту: граница записи картинки. */
export const SHADOW_PAD = 10;

/** Мягкая тень под картой (13-art.md §5): свет сверху — тень смещена вниз, светлее к краям. Стопка скруглённых
 *  прямоугольников убывающей плотности вместо размытия: записывается один раз, на кадр ничего не считается. */
export function shadow(cv: SkCanvas, cw: number, ch: number, r: number) {
  const dy = Math.max(3, cw * 0.05);
  for (let i = 0; i < 5; i++) {
    const grow = i * 2;
    const p = fill(C.black, 0.15 - i * 0.027);
    cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(-cw / 2 - grow / 2, -ch / 2 - grow / 2 + dy, cw + grow, ch + grow), r + grow / 2, r + grow / 2), p);
  }
}

/** Скос света на бумаге: едва светлее сверху. Статичный, в картинке. */
export function sheen(cv: SkCanvas, cw: number, ch: number, r: number) {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  const top = Skia.Color(C.text), bottom = Skia.Color(C.text);
  top[3] = 0.16; bottom[3] = 0;
  p.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: -ch / 2 }, { x: 0, y: ch * 0.1 }, [top, bottom], null, TileMode.Clamp));
  cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(-cw / 2, -ch / 2, cw, ch), r, r), p);
}

/** Линия цветом `color` толщиной `w`, с круглыми концами. */
export function stroke(color: string, w: number, alpha?: number): SkPaint {
  const p = fill(color, alpha);
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeWidth(w);
  p.setStrokeCap(StrokeCap.Round);
  p.setStrokeJoin(StrokeJoin.Round);
  return p;
}

/** Записать картинку карты `cw × ch` с серединой в (0,0) и полем под тень. */
export function record(cw: number, ch: number, draw: (cv: SkCanvas) => void): SkPicture {
  const recorder = Skia.PictureRecorder();
  const cv = recorder.beginRecording(Skia.XYWHRect(-cw / 2 - SHADOW_PAD, -ch / 2 - SHADOW_PAD, cw + SHADOW_PAD * 2, ch + SHADOW_PAD * 2));
  draw(cv);
  return recorder.finishRecordingAsPicture();
}
