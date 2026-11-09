// Сукно стола (13-art.md §5, specs/2026-11-art-premium.md §2): одна лампа над столом — радиальное пятно света
// под ней, темнее к кромке, виньетка в углах; вокруг — узкий деревянный борт (свет сверху, тень снизу) и линия тени
// на сукне у борта. Всё записывается один раз в SkPicture на размер стола: на кадр холст ставит картинку.
import { ClipOp, PaintStyle, Skia, TileMode } from '@shopify/react-native-skia';
import type { SkPicture } from '@shopify/react-native-skia';
import { C } from '../ui/theme';

/** Ширина деревянного борта, dp. */
export const RIM = 6;

export interface FeltRect { x: number; y: number; w: number; h: number }

const color = (c: string) => Skia.Color(c);
const alpha = (c: string, a: number) => { const k = Skia.Color(c); k[3] = a; return k; };

/** Картинка сукна с бортом для прямоугольника `f` (внешний край — край борта), скругление сукна `r`. */
export function makeFelt(f: FeltRect, r: number): SkPicture {
  const recorder = Skia.PictureRecorder();
  const cv = recorder.beginRecording(Skia.XYWHRect(f.x - 2, f.y - 2, f.w + 4, f.h + 4));
  const outer = Skia.RRectXY(Skia.XYWHRect(f.x, f.y, f.w, f.h), r + RIM, r + RIM);
  const inner = Skia.RRectXY(Skia.XYWHRect(f.x + RIM, f.y + RIM, f.w - RIM * 2, f.h - RIM * 2), r, r);

  // борт: дерево, светлее сверху и темнее снизу — свет идёт сверху
  const wood = Skia.Paint();
  wood.setAntiAlias(true);
  wood.setShader(Skia.Shader.MakeLinearGradient(
    { x: f.x, y: f.y }, { x: f.x, y: f.y + f.h },
    [color(C.woodLight), color(C.wood), color(C.woodDark)], [0, 0.45, 1], TileMode.Clamp,
  ));
  cv.drawRRect(outer, wood);
  // блик по верхней кромке борта
  const edge = Skia.Paint();
  edge.setAntiAlias(true);
  edge.setStyle(PaintStyle.Stroke);
  edge.setStrokeWidth(1);
  edge.setColor(alpha(C.lamp, 0.35));
  cv.save();
  cv.clipRect(Skia.XYWHRect(f.x, f.y, f.w, f.h * 0.5), ClipOp.Intersect, true);
  cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1), r + RIM, r + RIM), edge);
  cv.restore();

  // сукно: пятно света под лампой, к кромке темнее
  const lampAt = { x: f.x + f.w / 2, y: f.y + f.h * 0.5 };
  const felt = Skia.Paint();
  felt.setAntiAlias(true);
  felt.setShader(Skia.Shader.MakeRadialGradient(
    lampAt, Math.max(f.w, f.h) * 0.9,
    [color(C.feltLight), color(C.felt), color(C.feltEdge)], [0, 0.6, 1], TileMode.Clamp,
  ));
  cv.drawRRect(inner, felt);
  // виньетка по углам — ещё одно пятно, тёмное к краю
  const vignette = Skia.Paint();
  vignette.setAntiAlias(true);
  vignette.setShader(Skia.Shader.MakeRadialGradient(
    lampAt, Math.hypot(f.w, f.h) * 0.58,
    [alpha(C.bg, 0), alpha(C.bg, 0), alpha(C.bg, 0.3)], [0, 0.7, 1], TileMode.Clamp,
  ));
  cv.drawRRect(inner, vignette);
  // тень борта на сукне: две линии убывающей плотности внутри кромки
  for (const [inset, a] of [[0.5, 0.45], [1.5, 0.2], [2.5, 0.08]] as const) {
    const sh = Skia.Paint();
    sh.setAntiAlias(true);
    sh.setStyle(PaintStyle.Stroke);
    sh.setStrokeWidth(1);
    sh.setColor(alpha(C.bg, a));
    cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(f.x + RIM + inset, f.y + RIM + inset, f.w - RIM * 2 - inset * 2, f.h - RIM * 2 - inset * 2), r - inset, r - inset), sh);
  }
  return recorder.finishRecordingAsPicture();
}
