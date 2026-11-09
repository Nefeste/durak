// Сукно стола (13-art.md §5, specs/2026-11-art-premium.md §2 и «Круг 2»): одна лампа над столом — тёплое пятно
// света под ней, спад к углам; у сукна мелкая фактура (зерно и переплетение, шейдер SkSL); вокруг — деревянный борт
// с толщиной: тёмная внешняя кромка, светлая фаска сверху, тень снизу, древесный рисунок, внутренняя тень на сукне.
// Всё это считается ОДИН раз на размер стола: шейдеры рисуются в закадровую поверхность, её снимок (картинка) кладётся
// в SkPicture — на кадр холст ставит одну картинку, как и до фактуры. Шейдер в самой картинке стоил бы на каждый кадр.
import { ClipOp, PaintStyle, Skia, TileMode } from '@shopify/react-native-skia';
import type { SkCanvas, SkPicture, SkRuntimeEffect } from '@shopify/react-native-skia';
import { C } from '../ui/theme';

/** Ширина деревянного борта, dp. */
export const RIM = 14;
/** Плотность закадровой картинки стола: пиксели на dp. */
const DENSITY = 2;

export interface FeltRect { x: number; y: number; w: number; h: number }

const color = (c: string) => Skia.Color(c);
const alpha = (c: string, a: number) => { const k = Skia.Color(c); k[3] = a; return k; };
const rgba = (c: string, a = 1): number[] => { const k = Skia.Color(c); return [k[0], k[1], k[2], a]; };

/**
 * Фактура сукна и дерева одним шейдером (`mode` 0 — сукно, 1 — дерево). Сукно: цвет по расстоянию от лампы
 * (`light` → `base` → `edge`), поверх — зерно двух масштабов и мелкое переплетение, ±4 % яркости. Дерево: волокна —
 * шум, растянутый вдоль борта, ±6 %.
 */
const SKSL = `
uniform float mode;
uniform float4 light;
uniform float4 base;
uniform float4 edge;
uniform float2 lamp;
uniform float radius;

float hash(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(float2 p) {
  float2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + float2(1.0, 0.0)), c = hash(i + float2(0.0, 1.0)), d = hash(i + float2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
half4 main(float2 xy) {
  if (mode > 0.5) {
    float grain = noise(xy * float2(0.18, 2.6)) * 0.6 + noise(xy * float2(0.9, 7.0)) * 0.4;
    float3 wood = base.rgb * (1.0 + (grain - 0.5) * 0.14);
    return half4(half3(wood), 1.0);
  }
  float d = distance(xy, lamp) / radius;
  float3 col = mix(light.rgb, base.rgb, smoothstep(0.0, 0.58, d));
  col = mix(col, edge.rgb, smoothstep(0.58, 1.08, d));
  float g = noise(xy * 1.9) * 0.55 + noise(xy * 5.1) * 0.45;
  float weave = (sin(xy.x * 3.14159) * sin(xy.y * 3.14159)) * 0.5 + 0.5;
  col *= 1.0 + (g - 0.5) * 0.105 + (weave - 0.5) * 0.04;
  return half4(half3(col), 1.0);
}`;

let effect: SkRuntimeEffect | null | undefined;
function textureEffect(): SkRuntimeEffect | null {
  if (effect === undefined) effect = Skia.RuntimeEffect.Make(SKSL);
  return effect;
}

/** Рисует стол в точке (0,0) размера `w × h` dp на холст `cv`: борт, сукно, тени. */
function drawTable(cv: SkCanvas, w: number, h: number, r: number) {
  const fx = textureEffect();
  const lampAt = { x: w / 2, y: h * 0.47 };
  const radius = Math.max(w, h) * 0.78;
  const shader = (mode: number, light: string, base: string, edge: string) => fx?.makeShader([
    mode, ...rgba(light), ...rgba(base), ...rgba(edge), lampAt.x, lampAt.y, radius,
  ]) ?? null;

  // борт: дерево — рисунок волокон, поверх — свет сверху и тень снизу
  const outer = Skia.RRectXY(Skia.XYWHRect(0, 0, w, h), r + RIM, r + RIM);
  const wood = Skia.Paint();
  wood.setAntiAlias(true);
  const woodShader = shader(1, C.wood, C.wood, C.wood);
  if (woodShader) wood.setShader(woodShader); else wood.setColor(color(C.wood));
  cv.drawRRect(outer, wood);
  const shade = Skia.Paint();
  shade.setAntiAlias(true);
  shade.setShader(Skia.Shader.MakeLinearGradient(
    { x: 0, y: 0 }, { x: 0, y: h },
    [alpha(C.woodLight, 0.55), alpha(C.wood, 0), alpha(C.woodDark, 0.6)], [0, 0.45, 1], TileMode.Clamp,
  ));
  cv.drawRRect(outer, shade);
  // внешняя кромка — тёмная линия, борт отделён от комнаты
  const dark = Skia.Paint();
  dark.setAntiAlias(true);
  dark.setStyle(PaintStyle.Stroke);
  dark.setStrokeWidth(1.5);
  dark.setColor(alpha(C.woodDark, 0.9));
  cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(0.75, 0.75, w - 1.5, h - 1.5), r + RIM, r + RIM), dark);
  // фаска: светлая линия по верхней половине внешней кромки — лампа сверху
  const edge = Skia.Paint();
  edge.setAntiAlias(true);
  edge.setStyle(PaintStyle.Stroke);
  edge.setStrokeWidth(1.5);
  edge.setColor(alpha(C.lamp, 0.45));
  cv.save();
  cv.clipRect(Skia.XYWHRect(0, 0, w, h * 0.5), ClipOp.Intersect, true);
  cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(2.2, 2.2, w - 4.4, h - 4.4), r + RIM - 2, r + RIM - 2), edge);
  cv.restore();

  // сукно: свет лампы и фактура
  const inner = Skia.RRectXY(Skia.XYWHRect(RIM, RIM, w - RIM * 2, h - RIM * 2), r, r);
  const felt = Skia.Paint();
  felt.setAntiAlias(true);
  const feltShader = shader(0, C.feltLight, C.felt, C.feltEdge);
  if (feltShader) felt.setShader(feltShader);
  else felt.setShader(Skia.Shader.MakeRadialGradient(lampAt, radius, [color(C.feltLight), color(C.felt), color(C.feltEdge)], [0, 0.58, 1], TileMode.Clamp));
  cv.drawRRect(inner, felt);
  // виньетка по углам
  const vignette = Skia.Paint();
  vignette.setAntiAlias(true);
  vignette.setShader(Skia.Shader.MakeRadialGradient(
    lampAt, Math.hypot(w, h) * 0.6, [alpha(C.bg, 0), alpha(C.bg, 0), alpha(C.bg, 0.38)], [0, 0.66, 1], TileMode.Clamp,
  ));
  cv.drawRRect(inner, vignette);
  // внутренняя тень борта на сукне: шесть линий убывающей плотности — борт стоит над сукном
  for (let i = 0; i < 6; i++) {
    const a = [0.42, 0.3, 0.2, 0.13, 0.08, 0.04][i];
    const sh = Skia.Paint();
    sh.setAntiAlias(true);
    sh.setStyle(PaintStyle.Stroke);
    sh.setStrokeWidth(1);
    sh.setColor(alpha(C.bg, a));
    const inset = RIM + 0.5 + i;
    cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(inset, inset, w - inset * 2, h - inset * 2), Math.max(1, r - i), Math.max(1, r - i)), sh);
  }
  // фаска борта у сукна: светлая линия снизу (свет отражается от сукна), тёмная сверху (тень борта)
  const lip = Skia.Paint();
  lip.setAntiAlias(true);
  lip.setStyle(PaintStyle.Stroke);
  lip.setStrokeWidth(1);
  lip.setColor(alpha(C.woodLight, 0.7));
  cv.save();
  cv.clipRect(Skia.XYWHRect(0, h * 0.5, w, h * 0.5), ClipOp.Intersect, true);
  cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(RIM - 1, RIM - 1, w - RIM * 2 + 2, h - RIM * 2 + 2), r + 1, r + 1), lip);
  cv.restore();
}

/** Картинка стола для прямоугольника `f` (внешний край — край борта), скругление сукна `r`: снимок закадровой
 *  поверхности, нарисованный один раз; если поверхность недоступна — те же слои без фактуры прямо в картинку. */
export function makeFelt(f: FeltRect, r: number): SkPicture {
  const recorder = Skia.PictureRecorder();
  const cv = recorder.beginRecording(Skia.XYWHRect(f.x - 2, f.y - 2, f.w + 4, f.h + 4));
  const w = Math.max(1, Math.round(f.w)), h = Math.max(1, Math.round(f.h));
  const surface = Skia.Surface.MakeOffscreen(w * DENSITY, h * DENSITY);
  if (surface) {
    const sc = surface.getCanvas();
    sc.scale(DENSITY, DENSITY);
    drawTable(sc, w, h, r);
    surface.flush();
    const snap = surface.makeImageSnapshot();
    const img = snap.makeNonTextureImage() ?? snap;
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    cv.drawImageRect(img, Skia.XYWHRect(0, 0, w * DENSITY, h * DENSITY), Skia.XYWHRect(f.x, f.y, f.w, f.h), paint);
  } else {
    cv.save();
    cv.translate(f.x, f.y);
    drawTable(cv, w, h, r);
    cv.restore();
  }
  return recorder.finishRecordingAsPicture();
}
