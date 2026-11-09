// Первая партия (docs/09-game-design.md, «Первая партия»): строка над рукой первые три отбоя говорит, что делать
// сейчас, и молчит, когда ход чужой; подсказки гаснут после первой партии; у игроков из прошлых версий — не
// включаются; окно о переводе — один раз.
import { describe, expect, test } from 'bun:test';
import { apply } from '../../src/engine';
import type { State } from '../../src/engine';
import { NEWBIE_BOUTS, newbieDone, newbieTip } from '../../src/game/newbie';
import { botLevels, DEFAULT_SETTINGS, hasNewbie, parseSettings, taughtBefore } from '../../src/state/settings';
import type { Level } from '../../src/bot';
import { T } from '../../src/i18n';
import { c, pos } from './helpers';

const YOU = 0;
const two = (bout: number, attacker = 0, variant: 'podkidnoy' | 'perevodnoy' = 'podkidnoy'): State =>
  pos({ hands: ['6♠ 8♠ Д♠ 7♥ 9♦ 10♣', '7♠ 9♠ К♦ 6♦ 10♦ 8♣'], talon: '6♣ 7♣ В♣', trump: 'Т♥', bout, attacker, variant });

describe('подсказки новичка', () => {
  test('свой ход в пустой стол — «положите любую карту»', () => {
    expect(newbieTip(two(0), YOU)).toBe('attack');
  });
  test('ход соперника — обычная строка', () => {
    expect(newbieTip(two(0, 1), YOU)).toBeNull();
  });
  test('отбиваюсь: есть чем — «бейте», нечем — «Беру»', () => {
    const s = apply(two(0, 1), 1, { type: 'attack', cards: [c('7♠')] });
    expect(newbieTip(s, YOU)).toBe('beat');
    const hard = apply(two(0, 1), 1, { type: 'attack', cards: [c('К♦')] });
    // К♦ бьют Т♦ или козырь; у вас 7♥ — козырь, значит есть чем
    expect(newbieTip(hard, YOU)).toBe('beat');
    const none = pos({ hands: ['6♠ 8♠ 7♠', '7♣ 9♠ К♦'], trump: 'Т♥', bout: 0, attacker: 1, talon: '6♣' });
    expect(newbieTip(apply(none, 1, { type: 'attack', cards: [c('К♦')] }), YOU)).toBe('take');
  });
  test('всё покрыто: ходящему — «Бито», ждём отбоя — молчим', () => {
    let s = apply(two(0), YOU, { type: 'attack', cards: [c('6♠')] });
    expect(newbieTip(s, YOU)).toBeNull();
    s = apply(s, 1, { type: 'beat', card: c('7♠'), on: c('6♠') });
    expect(newbieTip(s, YOU)).toBe('done');
  });
  test('втроём не ходящий атакующий — «Пас»', () => {
    const t = pos({ hands: ['7♣ 8♦ 6♥', '7♠ 9♠ К♦', 'В♠ В♦ Д♦'], trump: 'Т♥', bout: 0, attacker: 1, defender: 2, talon: '6♦' });
    const a = apply(apply(t, 1, { type: 'attack', cards: [c('7♠')] }), 2, { type: 'beat', card: c('В♠'), on: c('7♠') });
    expect(newbieTip(a, YOU)).toBe('throw');
  });
  test('переводной: можно перевести — «бейте, переводите или „Беру“»', () => {
    const s = apply(two(1, 1, 'perevodnoy'), 1, { type: 'attack', cards: [c('9♠')] });
    expect(newbieTip(s, YOU)).toBe('beatOrTransfer');
    // в первом отбое партии переводить нельзя (п. 6.6) — просто «бейте»
    expect(newbieTip(apply(two(0, 1, 'perevodnoy'), 1, { type: 'attack', cards: [c('9♠')] }), YOU)).toBe('beat');
  });
  test('четвёртый отбой и дальше — молчим; учёба кончается', () => {
    expect(newbieTip(two(NEWBIE_BOUTS), YOU)).toBeNull();
    expect(newbieDone(two(NEWBIE_BOUTS - 1))).toBe(false);
    expect(newbieDone(two(NEWBIE_BOUTS))).toBe(true);
  });
  test('строки — в одну строку над рукой и на экране 360 точек (до 40 знаков)', () => {
    for (const t of Object.values(T.game.newbie)) expect(t.length).toBeLessThanOrEqual(40);
  });
});

describe('настройки новичка', () => {
  test('новый игрок — учим и объясняем перевод', () => {
    expect(DEFAULT_SETTINGS.newbie).toBe(true);
    expect(DEFAULT_SETTINGS.transferTold).toBe(false);
    expect(parseSettings(JSON.stringify({ newbie: false, transferTold: true }))).toMatchObject({ newbie: false, transferTold: true });
  });
  test('обновился с версии без подсказок: доигранные партии — не учим; играл переводной — не объясняем', () => {
    expect(hasNewbie(JSON.stringify({ sound: true }))).toBe(false);
    expect(hasNewbie(JSON.stringify({ newbie: true }))).toBe(true);
    expect(hasNewbie(null)).toBe(false);
    const s = parseSettings(null);
    expect(taughtBefore(s, [])).toEqual(s);
    expect(taughtBefore(s, [{ variant: 'podkidnoy' }])).toMatchObject({ newbie: false, transferTold: false });
    expect(taughtBefore(s, [{ variant: 'perevodnoy' }])).toMatchObject({ newbie: false, transferTold: true });
  });
});

describe('стол в меню (спецификация 1.0, §3)', () => {
  test('первый запуск — подкидной вдвоём против «Начинающего»', () => {
    expect(DEFAULT_SETTINGS.choice).toEqual({ variant: 'podkidnoy', bots: 1, level: 'beginner', mixed: false, levels: ['beginner', 'beginner', 'beginner'] });
    expect(parseSettings(null).choice).toEqual(DEFAULT_SETTINGS.choice);
    expect(botLevels(DEFAULT_SETTINGS.choice)).toEqual(['beginner']);
  });
  test('выбор игрока запоминается, мусор — по умолчанию по полю', () => {
    const kept = { variant: 'perevodnoy', bots: 3, level: 'master', mixed: true, levels: ['novice', 'average', 'master'] };
    expect(parseSettings(JSON.stringify({ choice: kept })).choice).toEqual(kept as never);
    expect(parseSettings(JSON.stringify({ choice: { variant: 'x', bots: 9, level: 'god' } })).choice).toEqual(DEFAULT_SETTINGS.choice);
    expect(parseSettings(JSON.stringify({ choice: 'oops' })).choice).toEqual(DEFAULT_SETTINGS.choice);
  });
  test('выбор прошлых версий — один уровень на всех: разные уровни выключены, у каждого бота тот же', () => {
    const old = parseSettings(JSON.stringify({ choice: { variant: 'perevodnoy', bots: 3, level: 'amateur' } })).choice;
    expect(old).toEqual({ variant: 'perevodnoy', bots: 3, level: 'amateur', mixed: false, levels: ['amateur', 'amateur', 'amateur'] });
    expect(botLevels(old)).toEqual(['amateur', 'amateur', 'amateur']);
    // `strong` до 0.5.0 — «Опытный»; битый уровень бота — общий уровень, битый флаг — выключен
    const odd = parseSettings(JSON.stringify({ choice: { bots: 2, level: 'strong', mixed: 'yes', levels: ['novice', 'god'] } })).choice;
    expect(odd).toMatchObject({ level: 'master', mixed: false, levels: ['novice', 'master', 'master'] });
  });
  test('разные уровни: бот N играет свой; один бот — всегда общий уровень', () => {
    const c = { ...DEFAULT_SETTINGS.choice, bots: 2, mixed: true, levels: ['novice', 'average', 'master'] as Level[] };
    expect(botLevels(c)).toEqual(['novice', 'average']);
    expect(botLevels({ ...c, bots: 3 })).toEqual(['novice', 'average', 'master']);
    expect(botLevels({ ...c, bots: 1 })).toEqual(['beginner']);
    expect(botLevels({ ...c, mixed: false })).toEqual(['beginner', 'beginner']);
  });
});
