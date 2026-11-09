// Стол этапа Б: раскладка (src/render/layout.ts), «бито» само, отмена, вышедшие карты
// (src/game/flow.ts), настройки и сохранение партии (src/state/settings.ts, saved.ts).
import { describe, expect, test } from 'bun:test';
import { apply, deckFrom, dealOf, firstOf, legalActions, newGame, observe, replay, RULES_V1 } from '../../src/engine';
import type { Card, GameRecord, State } from '../../src/engine';
import { chooseAction, makeRng } from '../../src/bot';
import { handCardAt, inTable, layoutTable, noOrigins, originsOf, sortHand, tableCardAt } from '../../src/render/layout';
import { autoPass, canUndo, seenGrid } from '../../src/game/flow';
import { noteOf } from '../../src/game/note';
import { dragPoint, dragStart } from '../../src/render/drag';
import type { Note } from '../../src/game/note';
import { botDelay, DEFAULT_SETTINGS, lessMotionOf, parseSettings } from '../../src/state/settings';
import { restoreGame } from '../../src/state/saved';
import { c, cs, pos } from './helpers';

const SIZE = { width: 412, height: 760 };
const opt = { ...SIZE, order: 'suit' as const, picked: null, targets: [] as Card[] };

/** Случайная партия до конца ботами; позиции по пути. */
function playGame(seed: number, seats: number, variant: 'podkidnoy' | 'perevodnoy'): { record: GameRecord; states: State[] } {
  const deck = deckFrom(new Uint8Array(32).map((_, i) => (seed * 31 + i * 7) & 255));
  const { hands, trump } = dealOf(deck, seats);
  const first = firstOf(hands, trump);
  const record: GameRecord = { v: 1, rules: RULES_V1, variant, seats, first: first.seat, firstWhy: first.why, deck, actions: [], result: null };
  let s = newGame({ rules: RULES_V1, variant, seats, first: first.seat }, deck);
  const rng = makeRng(seed);
  const states = [s];
  for (let k = 0; k < 2000 && s.phase !== 'end'; k++) {
    let moved = false;
    for (let i = 0; i < seats && !moved; i++) {
      const seat = (s.attacker + i) % seats;
      if (legalActions(s, seat).length === 0) continue;
      const a = chooseAction(observe(s, seat), 'average', rng);
      s = apply(s, seat, a);
      record.actions.push({ seat, action: a, at: 0 });
      states.push(s);
      moved = true;
    }
    if (!moved) break;
  }
  record.result = s.result;
  return { record, states };
}

describe('раскладка стола', () => {
  test('каждая видимая карта — один раз, лица только у того, что видит место (ADR 0005)', () => {
    for (const seats of [2, 3, 4]) {
      const { states } = playGame(seats * 11, seats, seats === 3 ? 'perevodnoy' : 'podkidnoy');
      for (const s of states) {
        const o = observe(s, 0);
        const l = layoutTable(o, { ...opt, showOpenly: true });
        const keys = l.sprites.map(x => x.key);
        expect(new Set(keys).size).toBe(keys.length);
        const faces = l.sprites.filter(x => x.card !== null).map(x => x.card as Card);
        const visible = new Set<Card>([...o.hand, ...o.table.flat().filter((x): x is Card => x !== null), ...o.openly.flat()]);
        if (o.talonSize > 0) visible.add(o.trump);
        for (const f of faces) expect(visible.has(f)).toBe(true);
        // все карты стола на столе: рука + соперники + колода + стол + сброс = 36
        const table = o.table.reduce((n, [, d]) => n + 1 + (d === null ? 0 : 1), 0);
        expect(l.sprites.length).toBe(o.handSizes.reduce((a, b) => a + b, 0) + o.talonSize + table + o.discard.length);
        for (const x of l.sprites) {
          expect(x.x).toBeGreaterThanOrEqual(0);
          expect(x.x).toBeLessThanOrEqual(SIZE.width);
          expect(x.y).toBeGreaterThanOrEqual(0);
          expect(x.y).toBeLessThanOrEqual(SIZE.height);
        }
      }
    }
  });
  test('без «Помощи памяти» у соперников ни одной карты лицом — и взятые в открытую рубашкой (решение владельца 08.11.2026)', () => {
    let openlySeen = 0;
    for (const seats of [2, 3, 4]) {
      const { states } = playGame(seats * 13, seats, seats === 2 ? 'perevodnoy' : 'podkidnoy');
      for (const s of states) {
        const o = observe(s, 0);
        openlySeen += o.openly.reduce((n, cs, seat) => n + (seat === 0 ? 0 : cs.length), 0);
        const l = layoutTable(o, opt);
        const own = new Set<Card>([...o.hand, ...o.table.flat().filter((x): x is Card => x !== null)]);
        if (o.talonSize > 0) own.add(o.trump);
        for (const x of l.sprites) {
          if (x.card !== null) expect(own.has(x.card)).toBe(true);
          if (/^h\d/.test(x.key)) expect(x.card).toBeNull();
        }
        // а карт у соперника столько же, сколько у него в руке
        for (const p of l.opponents) expect(l.sprites.filter(x => x.key.startsWith(`h${p.seat}-`)).length).toBe(o.handSizes[p.seat]);
      }
    }
    expect(openlySeen).toBeGreaterThan(0); // проверка не пустая: в этих партиях брали в открытую
  });
  test('карта летит на стол от того, кто её положил, взятое — со стола, добор — из колоды (решение владельца 08.11.2026)', () => {
    let checked = 0, took = 0;
    for (const seats of [2, 3, 4]) {
      for (const variant of ['podkidnoy', 'perevodnoy'] as const) {
        for (let g = 0; g < 4; g++) {
          const { record, states } = playGame(seats * 17 + g * 5 + (variant === 'perevodnoy' ? 1 : 0), seats, variant);
          let origins = noOrigins();
          for (let i = 1; i < states.length; i++) {
            const { seat, action } = record.actions[i - 1];
            const prev = observe(states[i - 1], 0), next = observe(states[i], 0);
            origins = originsOf(prev, next, origins);
            const played = action.type === 'beat' ? [action.card] : action.type === 'take' || action.type === 'pass' ? [] : action.cards;
            const l = layoutTable(next, { ...opt, origins });
            const at = (k: number) => (k === 0 ? { x: SIZE.width / 2 } : l.opponents.find(p => p.seat === k) ?? { x: -1 });
            for (const c of played) {
              if (!next.table.flat().includes(c)) continue; // отбой закрылся этим же действием
              expect(origins.byCard.get(c)).toBe(seat);
              const sp = l.sprites.find(x => x.key === `c${c}`);
              expect(sp?.from.x).toBe(at(seat).x);
              checked++;
            }
            if (origins.took !== null && origins.took !== 0) {
              const fresh = l.sprites.filter(x => x.key.startsWith(`h${origins.took}-`));
              expect(fresh.every(x => x.from.y !== 0)).toBe(true);
              took++;
            }
            // ни одна карта не летит из угла экрана
            for (const x of l.sprites) expect(x.from.x > 0 && x.from.y > 0).toBe(true);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
    expect(took).toBeGreaterThan(0);
  });
  test('ключи скрытых карт не выдают их номера', () => {
    const s = pos({ hands: ['6♠ 7♠ 8♠ 9♠ 10♠ В♠', '6♥ 7♥ 8♥ 9♥ 10♥ В♥'], trump: 'Т♦', talon: '6♦ 7♦' });
    const l = layoutTable(observe(s, 0), opt);
    for (const x of l.sprites.filter(x => x.card === null)) expect(x.key).toMatch(/^(h\d-\d+|t-\d+|c\d+)$/);
    for (const card of cs('6♥ 7♥ 8♥ 9♥ 10♥ В♥')) expect(l.sprites.some(x => x.key === `c${card}`)).toBe(false);
  });
  test('рука: козыри справа, по мастям или по старшинству', () => {
    const hand = cs('Т♠ 6♥ 7♠ 6♦ К♥');
    expect(sortHand(hand, 3, 'suit')).toEqual(cs('7♠ Т♠ 6♦ 6♥ К♥'));
    expect(sortHand(hand, 3, 'rank')).toEqual(cs('6♦ 7♠ Т♠ 6♥ К♥'));
  });
  test('касание и бросок: карта руки под пальцем, карта атаки, стол', () => {
    const s = pos({ hands: ['6♠ 7♠ 8♠ 9♠ 10♠ В♠', '6♥ 7♥ 8♥ 9♥ 10♥ В♥'], trump: 'Т♦', talon: '6♦ 7♦', attacker: 1, defender: 0 });
    const t = apply(s, 1, { type: 'attack', cards: [c('6♥')] });
    const o = observe(t, 0);
    const l = layoutTable(o, { ...opt, picked: c('6♠'), targets: [c('6♥')] });
    const mine = l.sprites.filter(x => x.card !== null && o.hand.includes(x.card));
    const last = mine[mine.length - 1];
    expect(handCardAt(l, last.x, last.y, o.hand)).toBe(last.card);
    const att = l.sprites.find(x => x.key === `c${c('6♥')}`)!;
    expect(att.glow).toBe(true);
    expect(tableCardAt(l, att.x, att.y, o.table)).toBe(c('6♥'));
    expect(inTable(l, att.x, att.y)).toBe(true);
    expect(inTable(l, last.x, last.y)).toBe(false);
  });
});

/** Прямоугольник карты с поворотом и масштабом — по осям экрана (с запасом на поворот). */
function boxOf(s: { x: number; y: number; rot: number; scale: number }, cw: number, ch: number) {
  const r = (s.rot * Math.PI) / 180, co = Math.abs(Math.cos(r)), si = Math.abs(Math.sin(r));
  const hw = (s.scale * (cw * co + ch * si)) / 2, hh = (s.scale * (cw * si + ch * co)) / 2;
  return { l: s.x - hw, r: s.x + hw, t: s.y - hh, b: s.y + hh };
}
type Box = ReturnType<typeof boxOf>;
const meets = (a: Box, b: Box) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;

describe('перетаскивание (игра владельца 09.11.2026)', () => {
  test('точка на столе — по экранным координатам: вид под пальцем её не сдвигает', () => {
    const d = dragStart({ locationX: 120, locationY: 700, pageX: 128, pageY: 760 });
    // палец над кнопкой «Бито»: на Android locationX/Y здесь — от кнопки (малые), pageX/Y — те же экранные
    const over = { locationX: 12, locationY: 9, pageX: 170, pageY: 690 };
    expect(dragPoint(d, over)).toEqual({ dx: 42, dy: -70, x: 162, y: 630 });
    expect(dragPoint(d, { pageX: 128, pageY: 760 })).toEqual({ dx: 0, dy: 0, x: 120, y: 700 });
  });
});

describe('колода и сброс в углах сукна (игра владельца 09.11.2026)', () => {
  // экраны 360 × 740 и 412 × 915 без отступа и с кнопками телефона снизу (48): высота стола — экран без полос (64)
  const screens = [[360, 740 - 64], [360, 740 - 64 - 48], [412, 915 - 64], [412, 915 - 64 - 48]];
  for (const [width, height] of screens) {
    for (const seats of [2, 3, 4]) {
      test(`${width} × ${height}, мест ${seats}: до шести пар не задевают колоду с козырем, сброс и друг друга`, () => {
        const hands = ['6♠ 7♠ 8♠ 9♠', '6♥ 7♥', '6♣ 7♣', '6♦ 7♦'].slice(0, seats);
        const o0 = observe(pos({ hands, trump: 'Т♦', talon: '10♦ В♦ Д♦ К♦' }), 0);
        const free = Array.from({ length: 36 }, (_, k) => k).filter(k => !o0.hand.includes(k) && k !== o0.trump);
        for (let n = 1; n <= 6; n++) {
          const table: [Card, Card | null][] = Array.from({ length: n }, (_, i) => [free[2 * i], free[2 * i + 1]]);
          const discard = free.slice(12, 20);
          const o = { ...o0, table, discard, talonSize: 10 };
          const l = layoutTable(o, { ...opt, width, height });
          const corner = l.sprites.filter(x => x.key.startsWith('t-') || x.key === `c${o.trump}` || discard.includes(x.card ?? -1) || (x.card === null && x.key.startsWith('c')));
          const pairs = table.map(([a, d]) => [a, d!].map(k => l.sprites.find(x => x.key === `c${k}`)!));
          const felt = { l: l.table.x, r: l.table.x + l.table.w, t: l.table.y, b: l.table.y + l.table.h };
          for (const [i, pair] of pairs.entries()) {
            for (const card of pair) {
              const b = boxOf(card, l.cw, l.ch);
              expect(b.l >= felt.l && b.r <= felt.r && b.t >= felt.t && b.b <= felt.b).toBe(true);
              for (const k of corner) expect(meets(b, boxOf(k, l.cw, l.ch))).toBe(false);
              for (const [j, other] of pairs.entries()) if (j !== i) for (const q of other) expect(meets(b, boxOf(q, l.cw, l.ch))).toBe(false);
            }
          }
          // угловые стопки — внутри борта, капсула «колода N» (96 dp) — между колодой и сбросом
          for (const k of corner) {
            const b = boxOf(k, l.cw, l.ch);
            expect(b.l >= felt.l && b.r <= felt.r && b.t >= felt.t).toBe(true);
          }
          expect(l.talonLabel.x + 96).toBeLessThan(l.discard.x - l.cw * 0.6);
          // карты стола читаются: не меньше 0,85 обычной, а в самом тесном случае (360 dp, кнопки телефона, вчетвером,
          // два ряда пар) — 0,65; до трёх пар — всегда в полный размер
          const least = Math.min(...pairs.flat().map(x => x.scale));
          expect(least).toBeGreaterThanOrEqual(n <= 3 ? 1 : height + 64 + 48 === 740 ? 0.65 : 0.85);
        }
      });
    }
  }
});

describe('ход партии на экране', () => {
  test('строка «Подсказки» гаснет со следующим действием за столом — своим, соперника и отменой (игра владельца 09.11.2026)', () => {
    const { record } = playGame(5, 2, 'podkidnoy');
    const at = (n: number): GameRecord => ({ ...record, actions: record.actions.slice(0, n) });
    const asked = at(3);
    const n: Note<GameRecord> = { text: 'Подсказка: Беру', at: asked };
    expect(noteOf(n, asked)).toBe('Подсказка: Беру');
    expect(noteOf(n, at(4))).toBeNull(); // любое действие — новая запись
    expect(noteOf(n, at(3))).toBeNull(); // и отмена до той же длины — тоже новая запись
    expect(noteOf(null, asked)).toBeNull();
    // онлайн метка — номер хода «партия:ход»
    expect(noteOf({ text: 'так нельзя', at: '1:7' }, '1:8')).toBeNull();
  });
  test('«бито» само: всё покрыто, а подкинуть нечего', () => {
    const s = pos({ hands: ['6♠ 7♣', '7♠ 8♥'], trump: 'Т♦', talon: '6♦' });
    const a = apply(s, 0, { type: 'attack', cards: [c('6♠')] });
    expect(autoPass(a, 0)).toBe(false);
    const b = apply(a, 1, { type: 'beat', card: c('7♠'), on: c('6♠') });
    // 7♣ подкинуть можно — по достоинству 7, значит не само
    expect(autoPass(b, 0)).toBe(false);
    const s2 = pos({ hands: ['6♠ 9♣', '7♠ 8♥'], trump: 'Т♦', talon: '6♦' });
    const b2 = apply(apply(s2, 0, { type: 'attack', cards: [c('6♠')] }), 1, { type: 'beat', card: c('7♠'), on: c('6♠') });
    expect(autoPass(b2, 0)).toBe(true);
  });
  test('отмена — только своё последнее действие до ответа бота', () => {
    const { record } = playGame(5, 2, 'podkidnoy');
    const mine = record.actions.findIndex(a => a.seat === 0);
    const cut: GameRecord = { ...record, actions: record.actions.slice(0, mine + 1), result: null };
    expect(canUndo(cut, 0)).toBe(true);
    const after: GameRecord = { ...record, actions: record.actions.slice(0, mine + 2), result: null };
    if (after.actions[after.actions.length - 1].seat !== 0) expect(canUndo(after, 0)).toBe(false);
    expect(canUndo({ ...cut, actions: [] }, 0)).toBe(false);
  });
  test('вышедшие карты: сброс и взятые в открытую, без своих', () => {
    const { states } = playGame(9, 3, 'podkidnoy');
    for (const s of states) {
      const o = observe(s, 0);
      const g = seenGrid(o);
      const n = g.flat().filter(x => x === 'discard').length;
      expect(n).toBe(o.discard.length);
      for (const card of o.hand) expect(g[Math.floor(card / 9)][card % 9]).not.toBe('openly');
    }
  });
});

describe('настройки', () => {
  test('мусор и пусто — по умолчанию, «Меньше движения» — как в системе, пока не выбрано', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{oops')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[1,2]')).toEqual(DEFAULT_SETTINGS);
    const s = parseSettings(JSON.stringify({ sound: false, botSpeed: 'warp', handOrder: 'rank', fourColor: true }));
    expect(s).toEqual({ ...DEFAULT_SETTINGS, sound: false, handOrder: 'rank', fourColor: true });
    expect(lessMotionOf(s, true)).toBe(true);
    expect(DEFAULT_SETTINGS.memoryAid).toBe(false);
    // до 0.5.1 «Помощь памяти» звалась seenCards — выбор игрока сохраняется
    expect(parseSettings(JSON.stringify({ seenCards: true })).memoryAid).toBe(true);
    expect(parseSettings(JSON.stringify({ memoryAid: false, seenCards: true })).memoryAid).toBe(false);
    expect(lessMotionOf({ ...s, lessMotion: false }, true)).toBe(false);
  });
  test('пауза бота: «Обычно» 0,5–0,9 с, «Быстро» 0,2–0,4 с', () => {
    expect(botDelay('normal', 0)).toBe(500);
    expect(botDelay('normal', 1)).toBe(900);
    expect(botDelay('fast', 0.5)).toBe(300);
  });
});

describe('сохранение партии', () => {
  const { record } = playGame(3, 3, 'perevodnoy');
  const mid: GameRecord = { ...record, actions: record.actions.slice(0, Math.floor(record.actions.length / 2)), result: null };
  test('восстановление — переигрывание той же записи', () => {
    const r = restoreGame(JSON.parse(JSON.stringify({ record: mid, levels: ['amateur', 'amateur'], history: [] })));
    expect(r).not.toBeNull();
    expect(r!.state).toEqual(replay(mid));
  });
  test('битая, чужая или законченная запись — нет партии, без исключения', () => {
    expect(restoreGame(null)).toBeNull();
    expect(restoreGame('мусор')).toBeNull();
    expect(restoreGame({ record: { ...mid, v: 2 }, levels: ['amateur', 'amateur'], history: [] })).toBeNull();
    expect(restoreGame({ record: { ...mid, rules: { ...RULES_V1, id: 'other' } }, levels: ['amateur', 'amateur'], history: [] })).toBeNull();
    expect(restoreGame({ record: mid, levels: ['amateur', 'grandmaster'], history: [] })).toBeNull();
    const bad = { ...mid, actions: [...mid.actions, { seat: 0, action: { type: 'take' }, at: 0 }, { seat: 0, action: { type: 'take' }, at: 0 }] };
    expect(restoreGame({ record: bad, levels: ['amateur', 'amateur'], history: [] })).toBeNull();
    expect(restoreGame({ record, levels: ['amateur', 'amateur'], history: [] })).toBeNull();
  });
});
