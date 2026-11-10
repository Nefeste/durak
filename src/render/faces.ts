// Лица карт, нарисованные кодом (ADR 0010; docs/13-art.md §1): индекс в двух углах русскими буквами (В, Д, К, Т),
// на 6–10 — масти в классической раскладке (`PIPS`), туз — крупная масть в кольце, у В, Д, К — «двуглавая» картинка
// со знаком (перо, цветок, корона) и перевязью с мастями вместо фигуры (`courtArt`). Каждое лицо записывается один раз
// в SkPicture размера карты; холст только ставит картинки на места (дёшево на кадр, docs/specs/2026-11-v1.md,
// «Бюджет»). Рубашка — одна из десяти (backArt.ts).
import { Skia } from '@shopify/react-native-skia';
import type { SkCanvas, SkFont, SkPath, SkPicture } from '@shopify/react-native-skia';
import { DECK_SIZE, rankOf, suitOf } from '../engine';
import type { Card } from '../engine';
import { T } from '../i18n';
import { C, suitColors } from '../ui/theme';
import { makeBack } from './backArt';
import { DEFAULT_BACK } from './backs';
import type { BackId } from './backs';
import { fill, record, rrect, shadow, sheen, stroke, suitPath, widthOf } from './paper';

export { SHADOW_PAD, suitPath } from './paper';

export interface Faces {
  cw: number;
  ch: number;
  face: (c: Card) => SkPicture;
  back: SkPicture;
  /** Рамка подсветки поверх карты. */
  glow: SkPicture;
}

/** Столбцы и ряды поля мастей, доли ширины карты: столбцы ближе к середине, чем в бумажной колоде, — индекс у нас
 *  крупный, и масть поля его не касается (13-art.md §1). */
const COL = 0.15;
const three = [-0.4, 0, 0.4], four = [-0.42, -0.14, 0.14, 0.42];
const cols = (rows: number[]): [number, number][] => rows.flatMap(y => [[-COL, y], [COL, y]] as [number, number][]);
/** Классическая раскладка мастей на 6–10 (достоинства 0–4): [x, y] в долях ширины карты от середины. */
export const PIPS: readonly (readonly [number, number][])[] = [
  cols(three),
  [...cols(three), [0, -0.2]],
  [...cols(three), [0, -0.2], [0, 0.2]],
  [...cols(four), [0, 0]],
  [...cols(four), [0, -0.28], [0, 0.28]],
];

/** Плашка поля мастей — лёгкая заливка цветом масти, та же, что у картинок: масти поля читаются вместе, а масть
 *  индекса (на ярлыке в углу) — отдельно. */
function panel(cv: SkCanvas, cw: number, ch: number, r: number, color: string) {
  const a = cw * 0.33, b = ch * 0.38;
  cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(-a, -b, a * 2, b * 2), r * 0.7, r * 0.7), fill(color, 0.06));
}

/** Масти поля: верхняя половина прямо, нижняя — вверх ногами; карта одинакова с обеих сторон. */
function pips(cv: SkCanvas, cw: number, suit: number, rank: number, color: string) {
  const ink = fill(color), size = cw * (rank >= 3 ? 0.165 : 0.19);
  for (const [x, y] of PIPS[rank]) {
    cv.save();
    cv.translate(x * cw, y * cw);
    if (y > 0) cv.rotate(180, 0, 0);
    cv.drawPath(suitPath(suit, size), ink);
    cv.restore();
  }
}

/** Туз: крупная масть в тонком кольце с ромбиками по четырём сторонам. Угол кольца у индекса уходит под ярлык. */
function aceArt(cv: SkCanvas, cw: number, suit: number, color: string) {
  const ring = cw * 0.37;
  cv.drawCircle(0, 0, ring, stroke(color, Math.max(0.8, cw * 0.012), 0.6));
  cv.drawCircle(0, 0, ring - cw * 0.035, stroke(color, Math.max(0.5, cw * 0.007), 0.35));
  for (const [x, y] of [[0, -ring], [ring, 0], [0, ring], [-ring, 0]]) {
    cv.drawCircle(x, y, cw * 0.05, fill(C.face));
    const d = suitPath(2, cw * 0.075);
    d.offset(x, y);
    cv.drawPath(d, fill(color));
  }
  cv.drawPath(suitPath(suit, cw * 0.48), fill(color));
}

/** Знак картинки в квадрате `e × e` с серединой в (0,0): перо (В), цветок (Д), корона (К). Силуэт — цветом масти,
 *  прожилки и камни — цветом лица. Ни лиц, ни оружия (ADR 0010). */
function emblem(cv: SkCanvas, rank: number, e: number, color: string) {
  const ink = fill(color), paper = (w: number) => stroke(C.face, Math.max(0.7, e * w));
  const P = (): SkPath => Skia.Path.Make();
  if (rank === 7) { // корона
    const p = P();
    p.moveTo(-0.44 * e, 0.36 * e); p.lineTo(-0.5 * e, -0.14 * e); p.lineTo(-0.24 * e, 0.08 * e); p.lineTo(0, -0.32 * e);
    p.lineTo(0.24 * e, 0.08 * e); p.lineTo(0.5 * e, -0.14 * e); p.lineTo(0.44 * e, 0.36 * e); p.close();
    cv.drawPath(p, ink);
    for (const [x, y] of [[-0.5, -0.2], [0, -0.39], [0.5, -0.2]]) cv.drawCircle(x * e, y * e, 0.075 * e, ink);
    cv.drawLine(-0.4 * e, 0.2 * e, 0.4 * e, 0.2 * e, paper(0.05));
    cv.drawCircle(0, 0.03 * e, 0.05 * e, fill(C.face));
  } else if (rank === 6) { // цветок
    const stem = stroke(color, Math.max(1, e * 0.07));
    cv.drawLine(0, -0.05 * e, 0, 0.46 * e, stem);
    for (const k of [-1, 1]) {
      const leaf = P();
      leaf.moveTo(0, 0.36 * e); leaf.quadTo(k * 0.36 * e, 0.34 * e, k * 0.4 * e, 0.04 * e); leaf.quadTo(k * 0.08 * e, 0.12 * e, 0, 0.36 * e); leaf.close();
      cv.drawPath(leaf, ink);
    }
    for (let k = 0; k < 5; k++) {
      const t = (k / 5) * Math.PI * 2 - Math.PI / 2;
      cv.drawCircle(Math.cos(t) * 0.17 * e, -0.2 * e + Math.sin(t) * 0.17 * e, 0.14 * e, ink);
    }
    cv.drawCircle(0, -0.2 * e, 0.075 * e, fill(C.face));
  } else { // перо
    const vane = P();
    vane.moveTo(0.36 * e, -0.5 * e);
    vane.cubicTo(0.52 * e, -0.16 * e, 0.2 * e, 0.24 * e, -0.2 * e, 0.3 * e);
    vane.cubicTo(-0.3 * e, 0.02 * e, -0.02 * e, -0.36 * e, 0.36 * e, -0.5 * e);
    vane.close();
    cv.drawPath(vane, ink);
    // очин — ниже опахала; стержень и бородки — цветом лица
    cv.drawLine(-0.18 * e, 0.26 * e, -0.4 * e, 0.5 * e, stroke(color, Math.max(1, e * 0.065)));
    cv.drawLine(0.28 * e, -0.38 * e, -0.18 * e, 0.26 * e, paper(0.04));
    for (const t of [0.3, 0.52, 0.74]) {
      const x = (0.28 - 0.46 * t) * e, y = (-0.38 + 0.64 * t) * e;
      cv.drawLine(x, y, x + 0.2 * e, y - 0.05 * e, paper(0.032));
      cv.drawLine(x, y, x - 0.06 * e, y - 0.17 * e, paper(0.032));
    }
  }
}

/** В, Д, К (ADR 0010, лист стиля 13-art.md §1): фигуры людей нет — «двуглавая» картинка: рамка-картуш с лёгкой заливкой
 *  цветом масти, по середине — перевязь с мастями (у В одна, у Д две, у К три), в верхней половине — знак (`emblem`),
 *  в нижней — он же вверх ногами. Углы рамки у индексов прячутся под «ярлыки» индекса (рисует `makeFaces` поверх). */
function courtArt(cv: SkCanvas, cw: number, ch: number, r: number, suit: number, rank: number, color: string) {
  const ink = fill(color), halo = fill(C.face);
  const a = cw * 0.33, b = ch * 0.38;
  const frame = Skia.RRectXY(Skia.XYWHRect(-a, -b, a * 2, b * 2), r * 0.7, r * 0.7);
  cv.drawRRect(frame, fill(color, 0.07));
  cv.drawRRect(frame, stroke(color, Math.max(1, cw * 0.018)));
  // открытые углы рамки (у индексов угол уходит под ярлык) — ромбик
  for (const [x, y] of [[a, -b], [-a, b]]) {
    const d = suitPath(2, cw * 0.09);
    d.offset(x, y);
    cv.drawCircle(x, y, cw * 0.06, halo);
    cv.drawPath(d, ink);
  }
  // перевязь: линия от рамки до рамки, масти на ней — на кружке цвета лица, линия под ними прерывается
  cv.drawLine(-a, 0, a, 0, stroke(color, Math.max(0.7, cw * 0.012)));
  const n = rank - 4, step = cw * 0.13, size = cw * 0.11;
  const spots: [number, number][] = [[-a, size * 1.05], [a, size * 1.05]];
  for (let k = 0; k < n; k++) spots.push([(k - (n - 1) / 2) * step, size]);
  for (const [x, s] of spots) {
    cv.drawCircle(x, 0, s * 0.62, halo);
    const d = suitPath(suit, s);
    d.offset(x, 0);
    cv.drawPath(d, ink);
  }
  for (const turn of [0, 180]) {
    cv.save();
    cv.rotate(turn, 0, 0);
    cv.translate(cw * 0.05, -cw * 0.29);
    emblem(cv, rank, cw * 0.34, color);
    cv.restore();
  }
}

/** Все 36 лиц и рубашка `back` размера `cw × ch`; шрифт индекса — Onest (OFL, `assets/fonts/`). */
export function makeFaces(cw: number, ch: number, font: SkFont, fourColor: boolean, back: BackId = DEFAULT_BACK): Faces {
  const r = Math.round(cw * 0.1);
  const colors = suitColors(fourColor);
  const rec = (draw: (cv: SkCanvas) => void): SkPicture => record(cw, ch, draw);
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
      // масть индекса — мельче мастей поля и вплотную под достоинством: читается как индекс, а не как масть поля
      const pip = suitPath(suit, cw * 0.17);
      pip.offset(ix + widthOf(font, label === '10' ? '1' : label) * 0.35 + cw * 0.05, iy + cw * 0.135);
      const court = rank >= 5 && rank <= 7, ace = rank === 8;
      if (court) courtArt(cv, cw, ch, r, suit, rank, color);
      else if (ace) aceArt(cv, cw, suit, color);
      else panel(cv, cw, ch, r, color);
      // под индексом — «ярлык» цвета лица поверх рамки, кольца и плашки: индекс всегда читается целиком
      const tab = pip.computeTightBounds(), pad = cw * 0.03;
      for (const turn of [0, 180]) {
        cv.save();
        cv.rotate(turn, 0, 0);
        cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(-cw / 2 + 1, -ch / 2 + 1, tab.x + tab.width + pad + cw / 2 - 1, tab.y + tab.height + pad + ch / 2 - 1), r, r), fill(C.face));
        cv.restore();
      }
      // масти поля — поверх ярлыка: он их не обрезает
      if (!court && !ace) pips(cv, cw, suit, rank, color);
      // индекс: верхний угол и тот же вверх ногами в нижнем
      for (const turn of [0, 180]) {
        cv.save();
        cv.rotate(turn, 0, 0);
        cv.drawText(label, ix, iy, ink, font);
        cv.drawPath(pip, ink);
        cv.restore();
      }
    }));
  }
  const glow = rec(cv => rrect(cv, cw + 2, ch + 2, r + 1, C.glow, 3));
  return { cw, ch, face: c => faces[c], back: makeBack(cw, ch, back), glow };
}
