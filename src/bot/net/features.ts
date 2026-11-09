// Признаки наблюдения для сети (docs/specs/2026-11-neural.md, «Вход»). Вход — только наблюдение места (ADR 0005).
// Два шага: `pack` — наблюдение в 64 байта «сырой записи» (её же пишет самоигра для обучения), `encode` — сырая запись
// во вход сети. `encode` повторяет tools/gpu/features.py бит в бит: сверка — tools/gpu/vectors/features.jsonl.gz
// (tools/test/net.test.ts здесь и selftest.py там).
import { DECK_SIZE, RANKS, rankOf, suitOf, throwerSeen } from '../../engine';
import type { Observation } from '../../engine';

/** Версия признаков: меняется вместе с весами — сеть с другой версией не читается. 2 — с очередью атакующих (#57) и
 *  сдавшимися (#58); сеть версии 1 переводится в 2 без изменений оценки (`tools/gpu/upgrade.py`). */
export const FEATURES_VERSION = 2;

/** Где карта для этого места (байты 0…35 сырой записи, по номеру карты). */
export const ZONE = {
  unseen: 0,
  own: 1,
  attackOpen: 2,
  attackCovered: 3,
  defense: 4,
  discard: 5,
  /** Взятые в открытую соперником на 1, 2, 3 места дальше по часовой стрелке: 6, 7, 8. */
  openly1: 6,
  trumpBottom: 9,
  /** Своя карта, которую соперники видели (взята в открытую). */
  ownKnown: 10,
} as const;

export const RAW_SIZE = 64;
/** Смещения скаляров сырой записи. */
export const RAW = {
  seats: 36, variant: 37, order: 38, trumpSuit: 39, talon: 40, bout: 41, limit: 42, giving: 43, table: 44,
  hands: 45, attacker: 49, defender: 50, starter: 51, passed: 52, out: 53, firstTransfer: 54,
  /** Чья очередь подкидывать (`throwerSeen`): 0 — ничья, иначе относительное место + 1. */
  thrower: 55,
  /** Сдавшиеся — биты по относительным местам. */
  resigned: 56,
} as const;

const PLANES = 11;
const CARDS = PLANES * DECK_SIZE;
const PER_SEAT = 17;
const SCALARS = 18;
/** Размер входа сети. */
export const INPUTS = CARDS + SCALARS + 4 * PER_SEAT;

/** Как подкидывают за столом (поле `order` свода — с durak-rules-v2, #57); у записей без поля — «кто успел». */
const queued = (o: Observation): boolean => (o.rules as { order?: string }).order === 'queue';

/** Наблюдение места → 64 байта (57–63 — запас, нули). Места — относительно своего: 0 — своё, 1 — следующее по часовой стрелке. */
export function pack(o: Observation, out: Uint8Array = new Uint8Array(RAW_SIZE)): Uint8Array {
  out.fill(0);
  const rel = (seat: number) => (seat - o.seat + o.seats) % o.seats;
  for (const c of o.hand) out[c] = ZONE.own;
  for (const c of o.openly[o.seat]) out[c] = ZONE.ownKnown;
  for (let seat = 0; seat < o.seats; seat++) {
    if (seat === o.seat) continue;
    for (const c of o.openly[seat]) out[c] = ZONE.openly1 + rel(seat) - 1;
  }
  for (const [a, d] of o.table) {
    out[a] = d === null ? ZONE.attackOpen : ZONE.attackCovered;
    if (d !== null) out[d] = ZONE.defense;
  }
  for (const c of o.discard) out[c] = ZONE.discard;
  if (o.talonSize > 0) out[o.trump] = ZONE.trumpBottom;
  out[RAW.seats] = o.seats;
  out[RAW.variant] = o.variant === 'perevodnoy' ? 1 : 0;
  out[RAW.order] = queued(o) ? 1 : 0;
  out[RAW.trumpSuit] = suitOf(o.trump);
  out[RAW.talon] = o.talonSize;
  out[RAW.bout] = Math.min(255, o.bout);
  out[RAW.limit] = o.boutLimit;
  out[RAW.giving] = o.phase === 'giving' ? 1 : 0;
  out[RAW.table] = o.table.length;
  let passed = 0, gone = 0, quit = 0;
  for (let seat = 0; seat < o.seats; seat++) {
    const r = rel(seat);
    out[RAW.hands + r] = o.handSizes[seat];
    if (o.passed[seat]) passed |= 1 << r;
    if (o.out.includes(seat)) gone |= 1 << r;
    if ((o.resigned ?? []).includes(seat)) quit |= 1 << r;
  }
  out[RAW.attacker] = rel(o.attacker);
  out[RAW.defender] = rel(o.defender);
  out[RAW.starter] = rel(o.starter);
  out[RAW.passed] = passed;
  out[RAW.out] = gone;
  out[RAW.firstTransfer] = o.rules.firstBoutTransfer ? 1 : 0;
  const thrower = throwerSeen(o);
  out[RAW.thrower] = thrower < 0 ? 0 : rel(thrower) + 1;
  out[RAW.resigned] = quit;
  return out;
}

const HAND_STEPS = [1, 2, 3, 4, 6, 8, 12];
const TALON_STEPS = [1, 3, 6, 12, 18];

/** Сырая запись → вход сети. Плоскости по 36 карт: 0 — своя рука, 1 — своя, которую видели соперники, 2 — атака
 *  непокрытая, 3 — атака покрытая, 4 — защита, 5 — сброс, 6–8 — взятые в открытую соперниками 1–3, 9 — открытый козырь
 *  под колодой, 10 — невидимая. Дальше — 18 общих чисел и по 17 на каждое из четырёх мест. Масти — от козыря: козырь — 0, остальные по возрастанию номера — 1, 2, 3
 *  (так сеть не учит одно и то же четыре раза). */
export function encode(raw: Uint8Array, out: Float32Array = new Float32Array(INPUTS)): Float32Array {
  out.fill(0);
  const ts = raw[RAW.trumpSuit];
  const map = [0, 0, 0, 0];
  for (let s = 0, k = 1; s < 4; s++) map[s] = s === ts ? 0 : k++;
  const known = [0, 0, 0, 0];
  for (let c = 0; c < DECK_SIZE; c++) {
    const i = map[suitOf(c)] * RANKS + rankOf(c);
    const z = raw[c];
    const plane = z === ZONE.unseen ? 10 : z === ZONE.own || z === ZONE.ownKnown ? 0 : z;
    out[plane * DECK_SIZE + i] = 1;
    if (z === ZONE.ownKnown) out[DECK_SIZE + i] = 1;
    if (z >= ZONE.openly1 && z < ZONE.trumpBottom) known[z - ZONE.openly1 + 1]++;
  }
  const S = CARDS;
  const seats = raw[RAW.seats];
  out[S + seats - 2] = 1;
  out[S + 3] = raw[RAW.variant];
  out[S + 4] = raw[RAW.order];
  out[S + 5] = raw[RAW.giving];
  out[S + 6] = raw[RAW.bout] === 0 ? 1 : 0;
  out[S + 7] = raw[RAW.firstTransfer];
  const t = raw[RAW.talon];
  out[S + 8] = t === 0 ? 1 : 0;
  for (let k = 0; k < TALON_STEPS.length; k++) out[S + 9 + k] = t >= TALON_STEPS[k] ? 1 : 0;
  out[S + 14] = t / 24;
  const limit = raw[RAW.limit], table = raw[RAW.table];
  out[S + 15] = limit / 6;
  out[S + 16] = table / 6;
  out[S + 17] = Math.max(0, limit - table) / 6;
  for (let r = 0; r < 4; r++) {
    const o = S + SCALARS + r * PER_SEAT;
    if (r >= seats) continue;
    const n = raw[RAW.hands + r];
    out[o] = 1;
    for (let k = 0; k < HAND_STEPS.length; k++) out[o + 1 + k] = n >= HAND_STEPS[k] ? 1 : 0;
    out[o + 8] = n / 12;
    out[o + 9] = r === 0 ? 0 : Math.max(0, n - known[r]) / 12;
    out[o + 10] = raw[RAW.attacker] === r ? 1 : 0;
    out[o + 11] = raw[RAW.defender] === r ? 1 : 0;
    out[o + 12] = raw[RAW.starter] === r ? 1 : 0;
    out[o + 13] = (raw[RAW.passed] >> r) & 1;
    out[o + 14] = (raw[RAW.out] >> r) & 1;
    out[o + 15] = raw[RAW.thrower] === r + 1 ? 1 : 0;
    out[o + 16] = (raw[RAW.resigned] >> r) & 1;
  }
  return out;
}

/** Наблюдение → вход сети. */
export const features = (o: Observation, out?: Float32Array): Float32Array => encode(pack(o), out);
