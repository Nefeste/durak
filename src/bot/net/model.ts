// Сеть оценки позиции: многослойный перцептрон, ReLU, на выходе — шанс не остаться с картами (docs/specs/2026-11-neural.md,
// «Сеть»). Чистый TypeScript без часов и случайности: одни и те же веса дают одно и то же число в Bun, Node и Hermes.
// Веса — файл `.bin` из tools/gpu/export.py: слова по 4 байта, little-endian —
//   'DKN1', версия признаков, число слоёв L, размеры L + 1, затем на каждый слой W (вход × выход, по входам) и b.
// Первый слой считается только по ненулевым входам: из 482 входов ненулевых около 80 (каждая карта — в одной плоскости).
import { FEATURES_VERSION } from './features';

export interface Net {
  sizes: number[];
  /** По слоям: веса по входам (`w[i * out + j]`) и сдвиги. */
  w: Float32Array[];
  b: Float32Array[];
  /** Рабочие массивы слоёв — чтобы оценка не выделяла память. */
  act: Float64Array[];
}

const MAGIC = 0x314e4b44; // 'DKN1'

/** Веса из файла `.bin`. */
export function netFromBin(bytes: Uint8Array): Net {
  if (bytes.byteLength % 4 !== 0) throw new Error('net: length is not a multiple of 4');
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const words = new Uint32Array(copy.buffer);
  const floats = new Float32Array(copy.buffer);
  if (words[0] !== MAGIC) throw new Error('net: not a DKN1 weights file');
  if (words[1] !== FEATURES_VERSION) throw new Error(`net: features v${words[1]}, expected v${FEATURES_VERSION}`);
  const layers = words[2];
  const sizes: number[] = [];
  for (let i = 0; i <= layers; i++) sizes.push(words[3 + i]);
  let at = 4 + layers;
  const w: Float32Array[] = [], b: Float32Array[] = [];
  for (let l = 0; l < layers; l++) {
    const n = sizes[l] * sizes[l + 1];
    w.push(floats.slice(at, at + n));
    at += n;
    b.push(floats.slice(at, at + sizes[l + 1]));
    at += sizes[l + 1];
  }
  if (at !== floats.length) throw new Error('net: file size does not match layer sizes');
  return { sizes, w, b, act: sizes.slice(1).map(n => new Float64Array(n)) };
}

/** Число на выходе до сигмоиды. */
export function logitOf(net: Net, x: ArrayLike<number>): number {
  let input: ArrayLike<number> = x;
  const L = net.w.length;
  for (let l = 0; l < L; l++) {
    const nIn = net.sizes[l], nOut = net.sizes[l + 1], w = net.w[l], h = net.act[l];
    const b = net.b[l];
    for (let j = 0; j < nOut; j++) h[j] = b[j];
    for (let i = 0; i < nIn; i++) {
      const xi = input[i];
      if (xi === 0) continue;
      const row = i * nOut;
      for (let j = 0; j < nOut; j++) h[j] += xi * w[row + j];
    }
    if (l + 1 < L) for (let j = 0; j < nOut; j++) if (h[j] < 0) h[j] = 0;
    input = h;
  }
  return input[0];
}

/** Шанс не остаться с картами по входу `x` (`features`). */
export const valueOf = (net: Net, x: ArrayLike<number>): number => 1 / (1 + Math.exp(-logitOf(net, x)));

/** Сколько умножений на одну оценку при `nonzero` ненулевых входах — для оценки скорости. */
export const costOf = (net: Net, nonzero: number): number =>
  net.sizes.slice(1).reduce((s, n, l) => s + (l === 0 ? nonzero : net.sizes[l]) * n, 0);
