// из nardy: tools/test/sound.test.ts @ 1d2bdff — свои звуки стола и что их вызывает (src/game/cues.ts).
// Звук стола (src/ui/feedback.ts; docs/09-game-design.md, «Звук»): тасовка, шлепок, «бито» и «беру» —
// записи CC0 по нескольку вариантов, каждый описан в SOURCES.md и подключён в feedback.ts; громкость
// вариантов ровная на слух с телефона, между звуками — как задумано; удар сразу, без тишины; вариант не
// повторяется подряд; проигрыватели заводятся заранее и чинятся после ошибки. Что прозвучит — только из
// наблюдения места: каждая карта на стол — шлепок, конец отбоя — «бито» или «беру», отмена — тишина.
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { apply, deckFrom, dealOf, firstOf, legalActions, newGame, observe, RULES_V1 } from '../../src/engine';
import type { Action, State, Variant } from '../../src/engine';
import { chooseAction, makeRng } from '../../src/bot';
import { cuesOf } from '../../src/game/cues';
import type { Cue } from '../../src/game/cues';
import { pickVariant, strength } from '../../src/ui/variants';
import { RETRY_MS, Voices } from '../../src/ui/voices';

/** WAV: формат и отсчёты (−1…1) — по разделам `fmt ` и `data`. */
function readWav(path: string): { format: number; channels: number; rate: number; bits: number; x: Float32Array } {
  const b = new Uint8Array(readFileSync(path));
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (o: number) => String.fromCharCode(...b.slice(o, o + 4));
  expect(tag(0) + tag(8)).toBe('RIFFWAVE');
  let fmt = { format: 0, channels: 0, rate: 0, bits: 0 }, x = new Float32Array(0);
  for (let o = 12; o + 8 <= b.length;) {
    const id = tag(o), size = v.getUint32(o + 4, true);
    if (id === 'fmt ') fmt = { format: v.getUint16(o + 8, true), channels: v.getUint16(o + 10, true), rate: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
    if (id === 'data') {
      x = new Float32Array(size / 2);
      for (let i = 0; i < x.length; i++) x[i] = v.getInt16(o + 8 + 2 * i, true) / 32768;
    }
    o += 8 + size + (size % 2);
  }
  return { ...fmt, x };
}
const db = (a: number) => 20 * Math.log10(a);

/** Звено второго порядка; коэффициенты — уже поделённые на a0. */
function biquad(x: Float32Array, [b0, b1, b2, a1, a2]: number[]): Float32Array {
  const out = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    out[i] = v;
  }
  return out;
}

/** Динамик телефона (как `PHONE` в tools/sound/recorded.py): Баттерворт 4-го порядка, срез 450 Гц. */
function onPhone(x: Float32Array, rate: number, fc = 450): Float32Array {
  let y = x;
  for (const q of [1 / (2 * Math.cos(Math.PI / 8)), 1 / (2 * Math.cos((3 * Math.PI) / 8))]) {
    const w = (2 * Math.PI * fc) / rate, cw = Math.cos(w), alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
    y = biquad(y, [(1 + cw) / 2 / a0, -(1 + cw) / a0, (1 + cw) / 2 / a0, (-2 * cw) / a0, (1 - alpha) / a0]);
  }
  return y;
}

/** Ухо: полка +4 дБ выше 1,5 кГц (как `ear` в tools/sound/recorded.py; RBJ, high shelf). */
function ear(x: Float32Array, rate: number): Float32Array {
  const g = 10 ** (4 / 40), w = (2 * Math.PI * 1500) / rate, c = Math.cos(w), r = (2 * Math.sqrt(g) * Math.sin(w)) / Math.SQRT2;
  const a0 = g + 1 - (g - 1) * c + r;
  return biquad(x, [
    (g * (g + 1 + (g - 1) * c + r)) / a0, (-2 * g * (g - 1 + (g + 1) * c)) / a0, (g * (g + 1 + (g - 1) * c - r)) / a0,
    (2 * (g - 1 - (g + 1) * c)) / a0, (g + 1 - (g - 1) * c - r) / a0,
  ]);
}

/** Громкость на слух с телефона, дБ (как `heard` в tools/sound/recorded.py): динамик, ухо, «Fast» 125 мс. */
function heard(x: Float32Array, rate: number): number {
  const p = ear(onPhone(x, rate), rate), a = Math.exp(-1 / (0.125 * rate));
  let e = 0, best = 0;
  for (const v of p) {
    e = a * e + (1 - a) * v * v;
    best = Math.max(best, e);
  }
  return 10 * Math.log10(best + 1e-20);
}

/** Записи: сколько вариантов, предел длины (с) и громкость на слух относительно тасовки (дБ). */
const RECORDED = { shuffle: [3, 1.25, 0], slap: [6, 0.25, -2.5], swish: [4, 0.5, -2.5], take: [3, 0.45, -5] } as const;
type Id = keyof typeof RECORDED;
const FEEDBACK = readFileSync('src/ui/feedback.ts', 'utf8');
const SOURCES = readFileSync('assets/sounds/SOURCES.md', 'utf8');
const level = (cue: Id, k: number) => {
  const w = readWav(`assets/sounds/${cue}-${k}.wav`);
  return heard(w.x, w.rate);
};

describe('записи: тасовка, шлепок, «бито», «беру»', () => {
  for (const [cue, [count, limit]] of Object.entries(RECORDED)) {
    test(`${cue}: ${count} вариантов — WAV 16 бит моно 44,1 кГц, короткие, пик −3 дБ, удар сразу, на слух ровно`, () => {
      const heardDb: number[] = [];
      for (let k = 1; k <= count; k++) {
        const w = readWav(`assets/sounds/${cue}-${k}.wav`);
        expect([w.format, w.channels, w.rate, w.bits]).toEqual([1, 1, 44100, 16]);
        expect(w.x.length / w.rate).toBeLessThanOrEqual(limit);
        let peak = 0, first = -1;
        for (let i = 0; i < w.x.length; i++) peak = Math.max(peak, Math.abs(w.x[i]));
        for (let i = 0; i < w.x.length && first < 0; i++) if (Math.abs(w.x[i]) > peak * 0.03) first = i;
        expect(db(peak)).toBeLessThanOrEqual(-2.9);
        expect(db(peak)).toBeGreaterThan(-15);
        // звук начинается с удара, без тишины: карта легла — и звук вместе с ней
        expect(first / w.rate).toBeLessThan(0.01);
        heardDb.push(heard(w.x, w.rate));
        // карта на маленьком динамике не глохнет: стук шашки «Нард» 0.10.0 был басовым и терял на телефоне
        // 8–13 дБ; бумага и картон звучат выше — здесь теряется не больше 7
        let all = 0, phone = 0;
        const p = onPhone(w.x, w.rate);
        for (let i = 0; i < w.x.length; i++) { all += w.x[i] ** 2; phone += p[i] ** 2; }
        expect(10 * Math.log10(phone / all)).toBeGreaterThan(-7);
      }
      expect(Math.max(...heardDb) - Math.min(...heardDb)).toBeLessThanOrEqual(0.3);
    });
  }

  test('на слух с телефона: тасовка — как кубики «Нард», шлепок и «бито» на 2,5 дБ тише, «беру» — на 5', () => {
    const avg = (cue: Id) => Array.from({ length: RECORDED[cue][0] }, (_, i) => level(cue, i + 1)).reduce((s, v, _, a) => s + v / a.length, 0);
    const shuffle = avg('shuffle');
    expect(shuffle).toBeGreaterThan(-21);
    expect(shuffle).toBeLessThan(-19);
    for (const cue of ['slap', 'swish', 'take'] as const) expect(Math.abs(avg(cue) - shuffle - RECORDED[cue][2])).toBeLessThanOrEqual(0.3);
  });

  test('каждый файл подключён в feedback.ts и описан в SOURCES.md; лицензия — CC0, отпечаток полный', () => {
    const files = readdirSync('assets/sounds').filter(f => f.endsWith('.wav'));
    expect(files.length).toBe(Object.values(RECORDED).reduce((s, [n]) => s + n, 0));
    for (const f of files) expect(FEEDBACK).toContain(`assets/sounds/${f}`);
    for (const f of files) expect(SOURCES).toMatch(new RegExp(`\\| \`${f.replace('.', '\\.')}\` \\| \\[`));
    const sources = SOURCES.split('## Исходники')[1].split('\n').filter(l => l.startsWith('| ['));
    expect(sources.length).toBeGreaterThan(0);
    for (const l of sources) expect(l).toMatch(/\]\(https:\/\/opengameart\.org\/content\/[^)]+\) \| [^|]+ \| CC0 1\.0 \| `[0-9a-f]{64}` \|/);
    // паспорт картинок и звуков ссылается на SOURCES.md
    expect(readFileSync('assets/LICENSES.md', 'utf8')).toContain('assets/sounds/SOURCES.md');
  });
});

describe('выбор варианта', () => {
  test('не тот же, что только что; все остальные выпадают; один вариант — всегда он', () => {
    let seed = 1;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    for (const n of [2, 3, 4, 6]) {
      const seen = new Map<number, number>();
      let last: number | undefined;
      for (let i = 0; i < 3000; i++) {
        const k = pickVariant(n, last, rnd);
        expect(k).toBeGreaterThanOrEqual(0);
        expect(k).toBeLessThan(n);
        expect(k).not.toBe(last);
        seen.set(k, (seen.get(k) ?? 0) + 1);
        last = k;
      }
      expect(seen.size).toBe(n);
      for (const c of seen.values()) expect(c).toBeGreaterThan(3000 / n / 2);
    }
    expect(pickVariant(1, 0)).toBe(0);
    expect([strength(() => 0), strength(() => 0.9999999)].map(v => Math.round(v * 100) / 100)).toEqual([0.85, 1]);
  });
});

describe('проигрыватели: заранее и с починкой (src/ui/voices.ts)', () => {
  type V = 'slap' | 'take';
  function fake(broken: (k: number) => boolean = () => false) {
    const log: string[] = [];
    const notes: string[] = [];
    const fails = new Map<string, (why: unknown) => void>();
    let t = 0;
    const voices = new Voices<V>({ slap: 2, take: 1 }, (id, k, fail) => {
      if (broken(k)) { log.push(`fail ${id}-${k}`); return null; }
      log.push(`make ${id}-${k}`);
      fails.set(`${id}-${k}`, fail);
      return { play: () => { log.push(`play ${id}-${k}`); }, reload: () => { log.push(`reload ${id}-${k}`); } };
    }, (key, why) => notes.push(`${key}: ${String(why)}`), () => t);
    return { voices, log, notes, fails, wait: (ms: number) => { t += ms; } };
  }

  test('заводятся заранее, по одному за шаг; ошибка Android — файл открывается заново, в журнал один раз', () => {
    const { voices, log, notes, fails } = fake();
    const steps: (() => void)[] = [];
    voices.warm(['slap', 'take'], next => steps.push(next));
    expect(log).toEqual([]);
    while (steps.length) steps.shift()!();
    expect(log).toEqual(['make slap-0', 'make slap-1', 'make take-0']);
    fails.get('take-0')!('AudioTrack init failed');
    fails.get('take-0')!('AudioTrack init failed');
    voices.play('take', 0, 1);
    expect(log.slice(3)).toEqual(['reload take-0', 'play take-0']);
    expect(notes).toEqual(['take-1: AudioTrack init failed']);
  });

  test('не создался — новая попытка через RETRY_MS, а не молчание до перезапуска', () => {
    let down = true;
    const { voices, log, wait } = fake(() => down);
    expect(voices.play('slap', 1, 1)).toBe(false);
    down = false;
    wait(RETRY_MS);
    expect(voices.play('slap', 1, 1)).toBe(true);
    expect(log).toEqual(['fail slap-1', 'make slap-1', 'play slap-1']);
  });

  test('экраны стола заводят звуки и зовут отклик; ошибка проигрывателя слышна игре', () => {
    expect(FEEDBACK).toContain("addListener('playbackStatusUpdate'");
    expect(FEEDBACK).toContain('p.replace(file)');
    // стол партии слушает то, что показан игроку: во время паузы перед «бито» — стол паузы (src/game/hold.ts)
    for (const f of ['src/game/GameScreen.tsx', 'src/game/OnlineGameScreen.tsx', 'src/game/PuzzleScreen.tsx']) {
      expect(readFileSync(f, 'utf8')).toMatch(/useTableCues\((view|shown), /);
    }
    // «Меньше движения» звук не выключает: отклик читает только «Звук» и «Вибрацию»
    expect(FEEDBACK).not.toContain('lessMotion');
  });
});

/** Партия ботами до конца: позиции и действия по пути. */
function playGame(seed: number, seats: number, variant: Variant): { states: State[]; moves: { seat: number; a: Action }[] } {
  const deck = deckFrom(new Uint8Array(32).map((_, i) => (seed * 31 + i * 7) & 255));
  const { hands, trump } = dealOf(deck, seats);
  let s = newGame({ rules: RULES_V1, variant, seats, first: firstOf(hands, trump).seat }, deck);
  const rng = makeRng(seed);
  const states = [s], moves: { seat: number; a: Action }[] = [];
  for (let k = 0; k < 2000 && s.phase !== 'end'; k++) {
    let moved = false;
    for (let i = 0; i < seats && !moved; i++) {
      const seat = (s.attacker + i) % seats;
      if (legalActions(s, seat).length === 0) continue;
      const a = chooseAction(observe(s, seat), 'average', rng);
      s = apply(s, seat, a);
      states.push(s);
      moves.push({ seat, a });
      moved = true;
    }
    if (!moved) break;
  }
  return { states, moves };
}

describe('что звучит (src/game/cues.ts)', () => {
  test('раздача — тасовка; продолженная партия — без неё', () => {
    const { states } = playGame(3, 2, 'podkidnoy');
    expect(cuesOf(null, observe(states[0], 0))).toEqual([{ what: 'shuffle', mine: false }]);
    expect(cuesOf(null, observe(states[5], 0))).toEqual([]);
  });

  test('каждая карта на стол — шлепок, конец отбоя — «бито» или «беру», остальное — тишина; у всех мест одно', () => {
    let slaps = 0, swishes = 0, takes = 0;
    for (const [seed, seats, variant] of [[1, 2, 'podkidnoy'], [2, 3, 'perevodnoy'], [5, 4, 'podkidnoy'], [8, 4, 'perevodnoy'], [13, 3, 'podkidnoy']] as const) {
      const { states, moves } = playGame(seed, seats, variant);
      for (let i = 1; i < states.length; i++) {
        const before = states[i - 1], after = states[i], { seat, a } = moves[i - 1];
        const cardsDown = ['attack', 'throwIn', 'give', 'beat', 'transfer'].includes(a.type);
        const boutOver = before.table.length > 0 && after.table.length === 0;
        const end: Cue['what'] | null = boutOver ? (after.discard.length > before.discard.length ? 'swish' : 'take') : null;
        const want: Cue['what'][] = [...(cardsDown ? ['slap' as const] : []), ...(end ? [end] : [])];
        for (let o = 0; o < seats; o++) {
          const got = cuesOf(observe(before, o), observe(after, o));
          expect(got.map(c => c.what)).toEqual(want);
          if (cardsDown) expect(got[0].mine).toBe(seat === o);
          if (end === 'take') expect(got[got.length - 1].mine).toBe(before.defender === o);
        }
        if (cardsDown) slaps++;
        if (end === 'swish') swishes++;
        if (end === 'take') takes++;
      }
    }
    expect(slaps).toBeGreaterThan(50);
    expect(swishes).toBeGreaterThan(5);
    expect(takes).toBeGreaterThan(2);
  });

  test('отмена своего хода — тишина, хотя стол снова как при раздаче', () => {
    const { states } = playGame(3, 2, 'podkidnoy');
    expect(cuesOf(observe(states[1], 0), observe(states[0], 0))).toEqual([]);
    expect(cuesOf(observe(states[1], 1), observe(states[0], 1))).toEqual([]);
  });
});
