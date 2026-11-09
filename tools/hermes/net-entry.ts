// Вход сборки для Hermes (tools/hermes/net.ts): сколько стоит одна оценка сети и одно решение бота на сети на позициях
// из партий «Среднего». Веса — случайные (время от значений не зависит), размеры — из NET_SIZES.
import { apply, newGame, observe, RULES_V1 } from '../../src/engine';
import { chooseAction, isEndgame, makeRng, thinkSync } from '../../src/bot';
import { features, INPUTS, NET_PARAMS, netThink, valueOf } from '../../src/bot/net';
import type { Net } from '../../src/bot/net';
import { actorOf } from '../../src/bot/sim';

declare const print: (s: string) => void;
const arg = (globalThis as { NET_SIZES?: string }).NET_SIZES ?? '256,128;128,64';
const deckOf = (rng: { int(n: number): number }) => {
  const d = Array.from({ length: 36 }, (_, i) => i);
  for (let i = 35; i > 0; i--) { const j = rng.int(i + 1); const t = d[i]; d[i] = d[j]; d[j] = t; }
  return d;
};
const rng = makeRng(42);
const positions: ReturnType<typeof observe>[] = [];
for (let g = 0; g < 4; g++) {
  let s = newGame({ rules: RULES_V1, variant: g % 2 ? 'perevodnoy' : 'podkidnoy', seats: 2, first: 0 }, deckOf(rng));
  let n = 0;
  while (s.phase !== 'end') {
    const who = actorOf(s);
    const o = observe(s, who);
    if (n++ % 3 === 0 && !isEndgame(o)) positions.push(o);
    s = apply(s, who, chooseAction(o, 'average', rng));
  }
}
function randomNet(hidden: number[]): Net {
  const sizes = [INPUTS, ...hidden, 1];
  const r = makeRng(7);
  const w = sizes.slice(1).map((n, l) => Float32Array.from({ length: sizes[l] * n }, () => (r.next() - 0.5) * 0.2));
  const b = sizes.slice(1).map(n => new Float32Array(n));
  return { sizes, w, b, act: sizes.slice(1).map(n => new Float64Array(n)) };
}
for (const spec of arg.split(';')) {
  const net = randomNet(spec.split(',').map(Number));
  const x = features(positions[0]);
  let t = Date.now(), acc = 0;
  const reps = 300;
  for (let i = 0; i < reps; i++) acc += valueOf(net, x);
  const each = (Date.now() - t) / reps;
  const times: number[] = [];
  for (const o of positions.slice(0, 12)) {
    t = Date.now();
    thinkSync(netThink(o, net, NET_PARAMS, makeRng(1)));
    times.push(Date.now() - t);
  }
  times.sort((a, b) => a - b);
  print(`сеть ${spec}: оценка ${each.toFixed(2)} мс; решение (${NET_PARAMS.samples} раскладов, ${NET_PARAMS.horizon}): медиана ${times[times.length >> 1]} мс, наибольшее ${times[times.length - 1]} мс, позиций ${times.length}${acc > 0 ? '' : ' '}`);
}
print('OK');
