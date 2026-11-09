// Золотые тесты свода durak-rules-v2 (и «кто успел» — прежнего v1): по тесту на пункт docs/08-rules.md, включая «выборы» сверки.
// Меняется правило — меняются документ, движок и этот файл в одном коммите.
import { describe, expect, test } from 'bun:test';
import { apply, dealOf, firstOf, legalActions, newGame, nextFirst, reasonOf, RULES_V1 } from '../../src/engine';
import type { Action, State } from '../../src/engine';
import { c, cs, pos } from './helpers';

const act = (s: State, seat: number, a: Action) => apply(s, seat, a);
const attack = (s: State, seat: number, x: string) => act(s, seat, { type: 'attack', cards: cs(x) });
const beat = (s: State, seat: number, card: string, on: string) => act(s, seat, { type: 'beat', card: c(card), on: c(on) });
const throwIn = (s: State, seat: number, x: string) => act(s, seat, { type: 'throwIn', cards: cs(x) });
const pass = (s: State, seat: number) => act(s, seat, { type: 'pass' });
const why = (s: State, seat: number, a: Action) => reasonOf(s, seat, a);
const deck = () => Array.from({ length: 36 }, (_, i) => i);

describe('1–2. Колода, раздача и козырь', () => {
  test('36 карт, по шесть каждому по кругу; следующая — козырь, она — последняя карта колоды', () => {
    for (const seats of [2, 3, 4]) {
      const { hands, talon, trump } = dealOf(deck(), seats);
      expect(hands.every(h => h.length === 6)).toBe(true);
      expect(hands[0].slice(0, 2)).toEqual([0, seats]);
      expect(trump).toBe(6 * seats);
      expect(talon[talon.length - 1]).toBe(trump);
      expect(talon.length + 6 * seats).toBe(36);
      expect(talon[0]).toBe(6 * seats + 1);
    }
  });
  test('мест — два, три или четыре; колода — 36 разных карт', () => {
    expect(() => dealOf(deck(), 5)).toThrow();
    expect(() => dealOf(deck(), 1)).toThrow();
    expect(() => dealOf([0, ...deck().slice(1, 35), 0], 2)).toThrow();
  });
  test('п. 2.4 выбор: обмена шестёрки козырей нет — такого действия у движка нет', () => {
    const s = newGame({ rules: RULES_V1, variant: 'perevodnoy', seats: 2, first: 0 }, deck());
    const types = new Set([0, 1].flatMap(seat => legalActions(s, seat).map(a => a.type)));
    expect([...types].every(t => ['attack'].includes(t))).toBe(true);
  });
});

describe('3. Кто ходит первым', () => {
  test('первая партия: младший козырь на руках', () => {
    // козырь — ♥; у места 1 — 7♥, у места 0 — 9♥
    const r = firstOf([cs('9♥ 6♠ 7♠ 8♠ 9♠ 10♠'), cs('7♥ 6♣ 7♣ 8♣ 9♣ 10♣')], c('Т♥'));
    expect(r).toEqual({ seat: 1, card: c('7♥'), why: 'lowestTrump' });
  });
  test('выбор: козырей нет ни у кого — младшая карта, при равенстве младшая масть ♠ ♣ ♦ ♥', () => {
    const r = firstOf([cs('6♣ 7♠ 8♠ 9♠ 10♠ В♠'), cs('6♠ 7♣ 8♣ 9♣ 10♣ В♣')], c('Т♥'));
    expect(r).toEqual({ seat: 1, card: c('6♠'), why: 'lowestCard' });
  });
  test('выбор: следующие партии — «из-под дурака», слева от дурака', () => {
    expect(nextFirst([{ fool: 2, draw: false, order: [] }], 4)).toBe(3);
    expect(nextFirst([{ fool: 3, draw: false, order: [] }], 4)).toBe(0);
  });
  test('после ничьей — слева от дурака партии перед ней; ничья в первой партии — снова младший козырь', () => {
    expect(nextFirst([{ fool: 1, draw: false, order: [] }, { fool: null, draw: true, order: [] }], 3)).toBe(2);
    expect(nextFirst([{ fool: null, draw: true, order: [] }], 3)).toBeNull();
  });
});

describe('4. Отбой: атака и защита', () => {
  const two = () => pos({ hands: ['6♠ 6♣ 7♦ 9♥ К♠ Т♣', '7♠ 8♠ В♦ 6♥ 10♣ Д♣'], trump: 'Т♥', talon: '8♦ 9♦' });

  test('п. 4.1: ходят одной картой или несколькими одного достоинства; разные достоинства — нельзя', () => {
    expect(why(two(), 0, { type: 'attack', cards: cs('6♠') })).toBeNull();
    expect(why(two(), 0, { type: 'attack', cards: cs('6♠ 6♣') })).toBeNull();
    expect(why(two(), 0, { type: 'attack', cards: cs('6♠ 7♦') })).toBe('mixedRanks');
    expect(why(two(), 1, { type: 'attack', cards: cs('7♠') })).toBe('notYourMove');
  });
  test('п. 4.2: бьёт старшая той же масти или любой козырь; козырь — только старший козырь', () => {
    const s = attack(two(), 0, '6♠');
    expect(why(s, 1, { type: 'beat', card: c('7♠'), on: c('6♠') })).toBeNull();
    expect(why(s, 1, { type: 'beat', card: c('6♥'), on: c('6♠') })).toBeNull();
    expect(why(s, 1, { type: 'beat', card: c('В♦'), on: c('6♠') })).toBe('doesNotBeat');
    const t = attack(pos({ hands: ['9♥ 6♣', '6♥ 10♥ 7♣'], trump: 'Т♥' }), 0, '9♥');
    expect(why(t, 1, { type: 'beat', card: c('6♥'), on: c('9♥') })).toBe('doesNotBeat');
    expect(why(t, 1, { type: 'beat', card: c('10♥'), on: c('9♥') })).toBeNull();
  });
  test('п. 4.2: держать масть не обязательно — козырем можно бить, имея масть', () => {
    const s = attack(two(), 0, '6♠');
    expect(why(s, 1, { type: 'beat', card: c('6♥'), on: c('6♠') })).toBeNull();
  });
  test('п. 4.3: подкидывают достоинства со стола — и атаки, и защиты', () => {
    let s = attack(two(), 0, '6♠');
    s = beat(s, 1, '7♠', '6♠');
    expect(why(s, 0, { type: 'throwIn', cards: cs('6♣') })).toBeNull();
    expect(why(s, 0, { type: 'throwIn', cards: cs('7♦') })).toBeNull();
    expect(why(s, 0, { type: 'throwIn', cards: cs('9♥') })).toBe('rankNotOnTable');
  });
  test('п. 4.3: остальные атакующие вступают, когда покрыта первая карта; ходящий — в любой момент', () => {
    let s = pos({ hands: ['6♠ 6♣ 8♥', '7♠ 8♠ В♦ 10♥', '6♦ 9♣ Д♣'], trump: 'Т♥', talon: '7♦', rules: { order: 'free' } });
    s = attack(s, 0, '6♠');
    expect(why(s, 2, { type: 'throwIn', cards: cs('6♦') })).toBe('waitFirstCover');
    expect(why(s, 0, { type: 'throwIn', cards: cs('6♣') })).toBeNull();
    s = beat(s, 1, '7♠', '6♠');
    expect(why(s, 2, { type: 'throwIn', cards: cs('6♦') })).toBeNull();
  });
  test('п. 4.3 «кто успел»: очереди нет — сосед подкидывает раньше ходящего, если успел', () => {
    let s = pos({ hands: ['6♠ 6♣ 8♥', '7♠ 8♠ В♦ 10♥', '6♦ 9♣ Д♣'], trump: 'Т♥', talon: '7♦', rules: { order: 'free' } });
    s = beat(attack(s, 0, '6♠'), 1, '7♠', '6♠');
    s = throwIn(s, 2, '6♦');
    expect(s.table.map(([a]) => a)).toEqual(cs('6♠ 6♦'));
  });
  test('п. 4.3 очередь: право у ходящего; «пас» передаёт его следующему по часовой стрелке', () => {
    // 4 места: ходит 0, отбивается 1, за ним 2 и 3
    let s = pos({ hands: ['6♠ 6♣ 8♥', '7♠ 8♠ В♦ 10♥', '6♦ 9♣ Д♣', '6♥ 7♣ К♦'], trump: 'Т♥', talon: '7♦ 8♦' });
    s = attack(s, 0, '6♠');
    // до первой покрытой — только ходящий; второй атакующий ждёт очереди
    expect(why(s, 2, { type: 'pass' })).toBe('waitTurn');
    expect(why(s, 0, { type: 'throwIn', cards: cs('6♣') })).toBeNull();
    s = beat(s, 1, '7♠', '6♠');
    // покрыта первая — но право по-прежнему у ходящего
    expect(why(s, 2, { type: 'throwIn', cards: cs('6♦') })).toBe('waitTurn');
    expect(why(s, 3, { type: 'throwIn', cards: cs('6♥') })).toBe('waitTurn');
    expect(legalActions(s, 2)).toEqual([]);
    s = pass(s, 0);
    // право у 2 (слева от отбивающегося), 3 ещё ждёт
    expect(why(s, 3, { type: 'throwIn', cards: cs('6♥') })).toBe('waitTurn');
    expect(why(s, 0, { type: 'throwIn', cards: cs('6♣') })).toBe('alreadyPassed');
    s = pass(s, 2);
    expect(why(s, 3, { type: 'throwIn', cards: cs('6♥') })).toBeNull();
    s = pass(s, 3);
    // все по кругу сказали «пас» — бито, ходит отбивавшийся
    expect(s.table.length).toBe(0);
    expect([s.attacker, s.defender]).toEqual([1, 2]);
  });
  test('п. 4.3 очередь: любая новая карта начинает круг заново — право снова у ходящего', () => {
    let s = pos({ hands: ['6♠ 6♣ 8♥', '7♠ 8♠ В♦ 10♥', '6♦ 9♣ Д♣', '6♥ 7♣ К♦'], trump: 'Т♥', talon: '7♦ 8♦' });
    s = beat(attack(s, 0, '6♠'), 1, '7♠', '6♠');
    s = pass(s, 0);
    s = throwIn(s, 2, '6♦');
    // подкинутая карта стёрла «пасы»: право у ходящего
    expect(s.passed).toEqual([false, false, false, false]);
    expect(why(s, 2, { type: 'pass' })).toBe('waitTurn');
    expect(why(s, 0, { type: 'pass' })).toBeNull();
    // покрытие — тоже новая карта: 7 ♣ у 3 появится в праве только после «паса» 0 и 2
    s = pass(pass(s, 0), 2);
    s = beat(s, 1, 'В♦', '6♦');
    expect(why(s, 3, { type: 'throwIn', cards: cs('7♣') })).toBe('waitTurn');
    expect(why(s, 0, { type: 'pass' })).toBeNull();
  });
  test('п. 4.3 очередь: вдогонку после «беру» — тем же кругом', () => {
    let s = pos({ hands: ['6♠ 6♣ 8♥', '7♠ 8♠ В♦ 10♥', '6♦ 9♣ Д♣'], trump: 'Т♥', talon: '7♦ 8♦' });
    s = throwIn(beat(attack(s, 0, '6♠'), 1, '7♠', '6♠'), 0, '6♣');
    s = act(s, 1, { type: 'take' });
    expect(why(s, 2, { type: 'give', cards: cs('6♦') })).toBe('waitTurn');
    s = pass(s, 0);
    expect(why(s, 2, { type: 'give', cards: cs('6♦') })).toBeNull();
    s = act(s, 2, { type: 'give', cards: cs('6♦') });
    expect(why(s, 0, { type: 'pass' })).toBeNull();
    s = pass(pass(s, 0), 2);
    expect(s.hands[1].length).toBe(3 + 4);
  });
  test('п. 4.3 очередь: атакующий без карт в круг не входит', () => {
    let s = pos({ hands: ['6♠', '7♠ 8♠ В♦ 10♥', '6♦ 9♣ Д♣'], trump: 'Т♥', talon: '', talonEmpty: true });
    s = beat(attack(s, 0, '6♠'), 1, '7♠', '6♠');
    // у ходящего карт нет — право сразу у 2
    expect(why(s, 2, { type: 'throwIn', cards: cs('6♦') })).toBeNull();
  });
  test('п. 6.4 и 4.3 очередь: после перевода круг начинается с переведшего', () => {
    let s = pos({ hands: ['6♠ 8♥ 9♥', '6♣ 8♣ В♦ 10♥', '6♦ 9♣ Д♣ 8♠', '7♣ К♦ Д♠'], trump: 'Т♥', talon: '7♥ 8♦', variant: 'perevodnoy' });
    s = act(attack(s, 0, '6♠'), 1, { type: 'transfer', cards: cs('6♣') });
    expect([s.attacker, s.defender]).toEqual([1, 2]);
    s = beat(s, 2, '8♠', '6♠');
    expect(why(s, 0, { type: 'pass' })).toBe('waitTurn');
    expect(why(s, 3, { type: 'pass' })).toBe('waitTurn');
    s = pass(s, 1);
    expect(why(s, 0, { type: 'pass' })).toBe('waitTurn');
    expect(why(s, 3, { type: 'pass' })).toBeNull();
  });
  test('вдвоём очередь и «кто успел» — одно и то же', () => {
    const base = { hands: ['6♠ 6♣ 9♥', '7♠ 8♦ В♦'], trump: 'Т♥', talon: '7♦ 10♦' };
    for (const order of ['queue', 'free'] as const) {
      let s = pos({ ...base, rules: { order } });
      s = beat(attack(s, 0, '6♠'), 1, '7♠', '6♠');
      expect(legalActions(s, 0).map(a => a.type)).toEqual(['throwIn', 'pass']);
    }
  });
  test('записи durak-rules-v1 без поля `order` играются «кто успел»', () => {
    let s = pos({ hands: ['6♠ 6♣ 8♥', '7♠ 8♠ В♦ 10♥', '6♦ 9♣ Д♣'], trump: 'Т♥', talon: '7♦', rules: { ...RULES_V1, order: undefined } });
    s = beat(attack(s, 0, '6♠'), 1, '7♠', '6♠');
    expect(why(s, 2, { type: 'throwIn', cards: cs('6♦') })).toBeNull();
  });
  test('п. 4.4: в отбое не больше шести карт атаки', () => {
    let s = pos({ hands: ['6♠ 6♣ 6♦ 8♦ 9♦ 8♣ 9♠', '8♠ 9♣ 7♦ 10♦ В♦ 10♣ Д♣ К♣'], trump: 'Т♥', talon: '7♣' });
    expect(s.boutLimit).toBe(6);
    s = attack(s, 0, '6♠ 6♣ 6♦');
    s = beat(s, 1, '8♠', '6♠');
    s = beat(s, 1, '9♣', '6♣');
    s = beat(s, 1, '7♦', '6♦');
    s = throwIn(s, 0, '8♦');
    s = beat(s, 1, '10♦', '8♦');
    s = throwIn(s, 0, '9♦');
    s = beat(s, 1, 'В♦', '9♦');
    s = throwIn(s, 0, '8♣');
    expect(why(s, 0, { type: 'throwIn', cards: cs('9♠') })).toBe('overLimit');
    // шестая покрыта — предел, отбой бито без «паса»
    s = beat(s, 1, '10♣', '8♣');
    expect(s.table.length).toBe(0);
    expect(s.discard.length).toBe(12);
  });
  test('п. 4.4: не больше, чем карт у отбивающегося в начале отбоя', () => {
    let s = pos({ hands: ['6♠ 6♣ 6♦ 7♠', '8♠ 9♣'], trump: 'Т♥', talon: '7♦' });
    expect(s.boutLimit).toBe(2);
    expect(why(s, 0, { type: 'attack', cards: cs('6♠ 6♣ 6♦') })).toBe('overLimit');
    s = attack(s, 0, '6♠ 6♣');
    expect(why(s, 0, { type: 'throwIn', cards: cs('6♦') })).toBe('overLimit');
  });
  test('п. 4.4 выбор: в первом отбое партии — не больше пяти, при любом числе игроков', () => {
    for (const hands of [['6♠ 6♣ 6♦ 6♥ 7♠ 7♣', '8♠ 9♠ 8♣ 9♣ 8♦ 9♦'], ['6♠ 6♣ 6♦ 6♥ 7♠ 7♣', '8♠ 9♠ 8♣ 9♣ 8♦ 9♦', 'В♠ В♣ В♦ Д♠ Д♣ Д♦']]) {
      const s = pos({ hands, trump: 'Т♥', talon: '7♦', bout: 0 });
      expect(s.boutLimit).toBe(5);
    }
  });
  test('п. 4.5: «беру» — только если есть непокрытая; берёт всё, и атаку, и защиту', () => {
    let s = pos({ hands: ['6♠ 6♣ 9♥', '7♠ 8♦ В♦'], trump: 'Т♥', talon: '7♦ 10♦' });
    s = attack(s, 0, '6♠');
    s = beat(s, 1, '7♠', '6♠');
    expect(why(s, 1, { type: 'take' })).toBe('nothingToTake');
    s = throwIn(s, 0, '6♣');
    s = act(s, 1, { type: 'take' });
    expect(s.phase).toBe('giving');
    s = pass(s, 0);
    expect(s.hands[1].sort((a, b) => a - b)).toEqual(cs('6♠ 7♠ 6♣ 8♦ В♦').sort((a, b) => a - b));
    expect(s.openly[1].sort((a, b) => a - b)).toEqual(cs('6♠ 7♠ 6♣').sort((a, b) => a - b));
  });
  test('п. 4.5: вдогонку — те же достоинства и те же пределы', () => {
    let s = pos({ hands: ['6♠ 6♣ 9♥ 6♦', '7♠ 8♦ В♦'], trump: 'Т♥', talon: '7♦ 10♦' });
    s = act(attack(s, 0, '6♠'), 1, { type: 'take' });
    expect(why(s, 0, { type: 'give', cards: cs('9♥') })).toBe('rankNotOnTable');
    expect(why(s, 0, { type: 'throwIn', cards: cs('6♣') })).toBe('notYourMove');
    s = act(s, 0, { type: 'give', cards: cs('6♣') });
    s = act(s, 0, { type: 'give', cards: cs('6♦') });
    // предел — три карты у отбивающегося: третья вдогонку закрыла отбой
    expect(s.phase).toBe('bout');
    expect(s.hands[1].length).toBe(6);
  });
  test('п. 4.6: бито — все покрыты и все атакующие сказали «пас»; карты уходят в сброс', () => {
    let s = pos({ hands: ['6♠ 9♥ В♣', '7♠ 8♦ В♦', '10♠ К♣ Д♦'], trump: 'Т♥', talon: '7♦ 10♦ Д♠' });
    s = beat(attack(s, 0, '6♠'), 1, '7♠', '6♠');
    s = pass(s, 0);
    expect(s.table.length).toBe(1);
    s = pass(s, 2);
    expect(s.table.length).toBe(0);
    expect(s.discard.sort((a, b) => a - b)).toEqual(cs('6♠ 7♠').sort((a, b) => a - b));
  });
  test('п. 4.6: «пас» снимается, когда стол меняется', () => {
    let s = pos({ hands: ['6♠ 7♣ В♣', '7♠ 8♣ В♦', '10♠ К♣ Д♦'], trump: 'Т♥', talon: '7♦ 10♦ Д♠', rules: { order: 'free' } });
    s = attack(s, 0, '6♠');
    s = pass(s, 2);
    s = beat(s, 1, '7♠', '6♠');
    expect(s.passed[2]).toBe(false);
  });
  test('п. 4.6: бито, когда у отбивающегося не осталось карт', () => {
    let s = pos({ hands: ['6♠ 9♥ В♣', '7♠', '10♠'], trump: 'Т♥', talon: '7♦' });
    s = beat(attack(s, 0, '6♠'), 1, '7♠', '6♠');
    expect(s.discard.length).toBe(2);
  });
  test('п. 4.7: после «бито» ходит отбивавшийся; после «беру» — следующий за ним', () => {
    const base = () => pos({ hands: ['6♠ 9♥ В♣', '7♠ 8♦ В♦', '10♠ К♣ Д♦'], trump: 'Т♥', talon: '7♦ 10♦ Д♠ 8♠ 9♠ 10♣ Д♣' });
    let s = pass(pass(beat(attack(base(), 0, '6♠'), 1, '7♠', '6♠'), 0), 2);
    expect([s.attacker, s.defender]).toEqual([1, 2]);
    s = attack(base(), 0, '6♠');
    s = pass(pass(act(s, 1, { type: 'take' }), 0), 2);
    expect([s.attacker, s.defender]).toEqual([2, 0]);
  });
});

describe('5. Добор', () => {
  test('ходивший, остальные по часовой стрелке, последним — отбивавшийся; козырь — последним', () => {
    let s = pos({ hands: ['6♠ 9♥ В♣', '7♠ 8♦ В♦', '10♠ К♣ Д♦'], trump: 'Т♥', talon: '7♦ 10♦ Д♠ 8♠ 9♠ 10♣ Д♣' });
    s = beat(attack(s, 0, '6♠'), 1, '7♠', '6♠');
    s = pass(pass(s, 0), 2);
    // место 0: 2 карты → +4 (7♦ 10♦ Д♠ 8♠); место 2: 3 → +3 (9♠ 10♣ Д♣); место 1: 2 → +1 (Т♥)
    expect(s.hands[0].slice(-4)).toEqual(cs('7♦ 10♦ Д♠ 8♠'));
    expect(s.hands[2].slice(-3)).toEqual(cs('9♠ 10♣ Д♣'));
    expect(s.hands[1].slice(-1)).toEqual(cs('Т♥'));
    expect(s.talon.length).toBe(0);
  });
});

describe('6. Перевод', () => {
  const t = () => pos({ hands: ['6♠ 6♣ 9♥', '6♦ 8♦ 6♥ В♦', '10♠ К♣ Д♦ Т♦'], trump: 'Т♥', talon: '7♦ 10♦', variant: 'perevodnoy' });
  test('п. 6.1: пока ничего не покрыто — картой того же достоинства; ходящий и отбивающийся сдвигаются', () => {
    const s = act(attack(t(), 0, '6♠'), 1, { type: 'transfer', cards: cs('6♦') });
    expect([s.attacker, s.defender]).toEqual([1, 2]);
    expect(s.table.map(([a]) => a)).toEqual(cs('6♠ 6♦'));
  });
  test('п. 6.2: переводить можно несколькими картами сразу', () => {
    const s = act(attack(t(), 0, '6♠'), 1, { type: 'transfer', cards: cs('6♦ 6♥') });
    expect(s.table.length).toBe(3);
  });
  test('п. 6.3: нельзя, если у нового отбивающегося меньше карт, чем станет атаки', () => {
    const s = attack(pos({ hands: ['6♠ 6♣ 9♥', '6♦ 6♥ В♦', '10♠'], trump: 'Т♥', talon: '7♦', variant: 'perevodnoy' }), 0, '6♠');
    expect(why(s, 1, { type: 'transfer', cards: cs('6♦') })).toBe('transferTooMany');
  });
  test('п. 6.4: переводят дальше; вдвоём атака возвращается к начавшему', () => {
    let s = pos({ hands: ['6♠ 6♣ 9♥ Д♠', '6♦ 8♦ К♦ В♦'], trump: 'Т♥', talon: '7♦ 10♦', variant: 'perevodnoy' });
    s = act(attack(s, 0, '6♠'), 1, { type: 'transfer', cards: cs('6♦') });
    expect([s.attacker, s.defender]).toEqual([1, 0]);
    s = act(s, 0, { type: 'transfer', cards: cs('6♣') });
    expect([s.attacker, s.defender]).toEqual([0, 1]);
  });
  test('п. 6.5: после первой покрытой переводить нельзя', () => {
    let s = attack(t(), 0, '6♠ 6♣');
    s = beat(s, 1, '6♥', '6♠');
    expect(why(s, 1, { type: 'transfer', cards: cs('6♦') })).toBe('transferAfterCover');
  });
  test('п. 6.6 выбор: в первом отбое партии переводить нельзя; настройка свода открывает', () => {
    const first = pos({ hands: ['6♠ 6♣ 9♥', '6♦ 8♦ 6♥ В♦', '10♠ К♣ Д♦ Т♦'], trump: 'Т♥', talon: '7♦', variant: 'perevodnoy', bout: 0 });
    expect(why(attack(first, 0, '6♠'), 1, { type: 'transfer', cards: cs('6♦') })).toBe('noTransferFirstBout');
    const open = pos({ hands: ['6♠ 6♣ 9♥', '6♦ 8♦ 6♥ В♦', '10♠ К♣ Д♦ Т♦'], trump: 'Т♥', talon: '7♦', variant: 'perevodnoy', bout: 0, rules: { firstBoutTransfer: true } });
    expect(why(attack(open, 0, '6♠'), 1, { type: 'transfer', cards: cs('6♦') })).toBeNull();
  });
  test('пп. 6.7–6.8 выбор: «проездного» нет — козырь другого достоинства не переводит', () => {
    const s = attack(t(), 0, '6♠');
    expect(why(s, 1, { type: 'transfer', cards: cs('В♦') })).toBe('transferRank');
  });
  test('п. 6.3: перевести некому — у остальных нет карт', () => {
    let s = pos({ hands: ['6♠', '', '6♣ 9♥', ''], trump: 'Т♥', talonEmpty: true, variant: 'perevodnoy', attacker: 0, defender: 2 });
    s.out = [1, 3];
    s = attack(s, 0, '6♠');
    expect(why(s, 2, { type: 'transfer', cards: cs('6♣') })).toBe('transferTooMany');
  });
  test('подкидной стол не переводит', () => {
    const s = attack(pos({ hands: ['6♠ 9♥', '6♦ 8♦'], trump: 'Т♥', talon: '7♦' }), 0, '6♠');
    expect(why(s, 1, { type: 'transfer', cards: cs('6♦') })).toBe('noTransferVariant');
  });
  test('п. 6.9: добор после перевода — начавший отбой первым, отбивавшийся последним', () => {
    let s = act(attack(t(), 0, '6♠'), 1, { type: 'transfer', cards: cs('6♦') });
    s = act(s, 2, { type: 'take' });
    s = pass(pass(s, 1), 0);
    // начавший — место 0 (2 карты) добирает первым и забирает вся колода с козырем
    expect(s.hands[0].slice(-3)).toEqual(cs('7♦ 10♦ Т♥'));
  });
  test('п. 6.9: если атака обошла стол, начавший отбивался и добирает последним', () => {
    let s = pos({ hands: ['6♠ 6♣ 9♥ Д♠', '6♦ 8♦ К♦ В♦'], trump: 'Т♥', talon: '7♦ 10♦ 8♠', variant: 'perevodnoy' });
    s = act(attack(s, 0, '6♠'), 1, { type: 'transfer', cards: cs('6♦') });
    s = act(s, 0, { type: 'take' });
    s = pass(s, 1);
    // место 1 (3 карты) добирает первым: 7♦ 10♦ 8♠; отбивавшийся 0 — последним, ему остался козырь
    expect(s.hands[1].slice(-3)).toEqual(cs('7♦ 10♦ 8♠'));
    expect(s.hands[0].slice(-1)).toEqual(cs('Т♥'));
  });
});

describe('7. Конец партии', () => {
  test('п. 7.1: пока в колоде есть карты, без карт не выходят — добирают', () => {
    let s = pos({ hands: ['6♠', '7♠ 8♦'], trump: 'Т♥', talon: '7♦ 10♦' });
    // у ходившего карт не осталось — «паса» ждать не от кого, отбой бито сразу
    s = beat(attack(s, 0, '6♠'), 1, '7♠', '6♠');
    expect(s.out).toEqual([]);
    expect(s.hands[0].length).toBeGreaterThan(0);
  });
  test('п. 7.3 выбор: отбившийся последней картой выходит; ходит следующий с картами', () => {
    let s = pos({ hands: ['6♠ 9♥', '7♠', '10♠ 8♣'], trump: 'Т♥', talonEmpty: true });
    s = beat(attack(s, 0, '6♠'), 1, '7♠', '6♠');
    expect(s.out).toEqual([1]);
    expect([s.attacker, s.defender]).toEqual([2, 0]);
  });
  test('п. 7.4: кончилось, когда карты остались у одного — он дурак', () => {
    let s = pos({ hands: ['6♠', '7♠ 8♦'], trump: 'Т♥', talonEmpty: true });
    s = beat(attack(s, 0, '6♠'), 1, '7♠', '6♠');
    expect(s.phase).toBe('end');
    expect(s.result).toEqual({ fool: 1, draw: false, order: [0] });
  });
  test('п. 7.5 выбор: никого с картами — ничья', () => {
    let s = pos({ hands: ['6♠', '7♠'], trump: 'Т♥', talonEmpty: true });
    s = beat(attack(s, 0, '6♠'), 1, '7♠', '6♠');
    expect(s.result).toEqual({ fool: null, draw: true, order: [0, 1] });
  });
  test('п. 7.2: ход пропускает вышедших', () => {
    let s = pos({ hands: ['6♠ 9♥', '7♠ 8♣', '10♠ 8♦'], trump: 'Т♥', talonEmpty: true, attacker: 2, defender: 0 });
    s.out = [];
    s = attack(s, 2, '10♠');
    s = act(s, 0, { type: 'take' });
    s = pass(pass(s, 2), 1);
    expect([s.attacker, s.defender]).toEqual([1, 2]);
  });
});
