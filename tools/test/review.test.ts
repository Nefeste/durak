// Этап Д: шесть уровней и закрытый седьмой (#15), разбор партии, статистика, история (docs/10-bot.md, «Разбор»;
// docs/09-game-design.md, «Итог партии и разбор», «Статистика»).
import { describe, expect, test } from 'bun:test';
import { dealOf, firstOf, observe, RULES_V1 } from '../../src/engine';
import type { Action, GameRecord, State } from '../../src/engine';
import { chooseAction, gradeOf, levelOf, LEVELS, LOCKED_LEVEL, makeRng, sameAction, thinkSync, TOP, whyOf } from '../../src/bot';
import { reviewGame } from '../../src/game/review';
import { restoreGame } from '../../src/state/saved';
import { normalizeHistory } from '../../src/state/history';
import type { FinishedGame } from '../../src/state/history';
import { computeStats, LEVEL_ELO, START_ELO, trumpsDealt } from '../../src/state/stats';
import { playGame, shuffled } from '../sim/play';
import { c, pos } from './helpers';

/** Партия ботов записью: место 0 — `a`, место 1 — `b`. */
function botGame(seed: number, a = 'amateur', b = 'average'): GameRecord {
  const rng = makeRng(seed);
  const deck = shuffled(rng);
  const { hands, trump } = dealOf(deck, 2);
  const first = firstOf(hands, trump).seat;
  const levels = [a, b] as const;
  const p = playGame(deck, 2, first, 'podkidnoy', (s, seat) => chooseAction(observe(s, seat), levelOf(levels[seat])!, rng));
  return { v: 1, rules: RULES_V1, variant: 'podkidnoy', seats: 2, first, firstWhy: 'lowestTrump', deck,
    actions: p.actions.map((x, i) => ({ ...x, at: 1_000 + i })), result: p.final.result };
}

describe('уровни (#15)', () => {
  test('шесть уровней, седьмой — закрытое место «Нейросеть», сильнейший — «Мастер»', () => {
    expect(LEVELS).toEqual(['novice', 'beginner', 'amateur', 'average', 'experienced', 'master']);
    expect(LOCKED_LEVEL).toBe('neural');
    expect(TOP).toBe('master');
  });
  test('старый «Сильный» читается как «Мастер»: сохранения, история, база сервера', () => {
    expect(levelOf('strong')).toBe('master');
    expect(levelOf('neural')).toBeNull();
    expect(levelOf('nobody')).toBeNull();
    const rec = botGame(3);
    const half = { ...rec, actions: rec.actions.slice(0, 6), result: null };
    expect(restoreGame({ record: half, level: 'strong', history: [] })?.saved.level).toBe('master');
    const h = normalizeHistory([{ record: rec, level: 'strong', at: 1, end: 2, hinted: false, review: null }, { bad: true }]);
    expect(h.map(g => g.level)).toEqual(['master']);
  });
});

describe('разбор', () => {
  test('пороги: 15 пунктов и больше — ошибка, 5–15 — неточно', () => {
    expect(gradeOf(15)).toBe('error');
    expect(gradeOf(14)).toBe('inaccurate');
    expect(gradeOf(5)).toBe('inaccurate');
    expect(gradeOf(4)).toBe('ok');
  });

  test('«почему» — только при своём условии', () => {
    // отбивается место 0; козырь ♥; на столе 7♠
    const s: State = { ...pos({ hands: ['8♠ 9♥ 6♣', 'Т♠ К♣'], trump: '6♥', attacker: 1, defender: 0, talonEmpty: true }), table: [[c('7♠'), null]] };
    s.hands[1] = s.hands[1].filter(x => x !== c('7♠'));
    const o = observe(s, 0);
    const beatTrump: Action = { type: 'beat', card: c('9♥'), on: c('7♠') };
    const beatPlain: Action = { type: 'beat', card: c('8♠'), on: c('7♠') };
    expect(whyOf(o, beatTrump, beatPlain, false)).toEqual({ kind: 'trumpWasted', card: c('9♥'), on: c('7♠'), plain: c('8♠') });
    expect(whyOf(o, { type: 'take' }, beatPlain, false)).toEqual({ kind: 'tookCouldBeat', card: c('8♠'), on: c('7♠') });
    expect(whyOf(o, beatPlain, beatTrump, false).kind).toBe('better');
    expect(whyOf(o, beatPlain, beatTrump, true).kind).toBe('exactLoses');
    expect(whyOf(o, { type: 'pass' }, { type: 'throwIn', cards: [c('8♠')] }, false)).toEqual({ kind: 'noThrow', cards: [c('8♠')] });
  });

  test('одно и то же действие — с картами в любом порядке', () => {
    expect(sameAction({ type: 'attack', cards: [c('7♠'), c('7♣')] }, { type: 'attack', cards: [c('7♣'), c('7♠')] })).toBe(true);
    expect(sameAction({ type: 'take' }, { type: 'pass' })).toBe(false);
  });

  test('разбор партии: только решения игрока с выбором, главная ошибка — самое большое падение, повторяется', () => {
    const rec = botGame(11, 'novice', 'average');
    const r = thinkSync(reviewGame(rec, 0, 32));
    expect(r.decisions.length).toBeGreaterThan(3);
    for (const d of r.decisions) {
      expect(rec.actions[d.at].seat).toBe(0);
      expect(['ok', 'inaccurate', 'error']).toContain(d.grade);
      expect(d.loss).toBeGreaterThanOrEqual(0);
      if (d.grade === 'ok') expect(sameAction(d.best, d.played)).toBe(true);
    }
    const bad = r.decisions.filter(d => d.grade !== 'ok');
    if (bad.length) expect(r.worst!.loss).toBe(Math.max(...bad.map(d => d.loss)));
    else expect(r.worst).toBeNull();
    // «Новичок» ошибается: разбор это видит
    expect(bad.length).toBeGreaterThan(0);
    expect(thinkSync(reviewGame(rec, 0, 32))).toEqual(r);
  }, 60_000);

  test('концовка вдвоём — точный расчёт: проигрывающий ход при выигрывающем — ошибка', () => {
    const rec = botGame(5, 'novice', 'average');
    const r = thinkSync(reviewGame(rec, 0, 16));
    const exact = r.decisions.filter(d => d.exact);
    for (const d of exact) {
      expect([0, 0.5, 1]).toContain(d.bestChance);
      expect(d.loss).toBe(Math.round((d.bestChance - d.playedChance) * 100));
    }
  }, 60_000);
});

describe('статистика', () => {
  const games = [21, 22, 23, 24].map((seed, i): FinishedGame => ({
    record: botGame(seed, 'average', 'novice'), level: 'novice', at: 100 + i, end: Date.UTC(2026, 10, 9, 10 + i), hinted: i === 3, review: null,
  }));

  test('итоги сходятся с записями', () => {
    const st = computeStats(games, Date.UTC(2026, 10, 9, 20));
    expect(st.total.games).toBe(4);
    const kept = games.filter(g => g.record.result!.fool === 0).length;
    expect(st.total.kept).toBe(kept);
    expect(st.byVariant.podkidnoy.games).toBe(4);
    expect(st.bySeats[2].games).toBe(4);
    expect(st.byLevel.novice!.games).toBe(4);
    // с подсказкой — не в рейтинг тренировок
    expect(st.eloGames).toBe(3);
  });

  test('рейтинг растёт после побед над сильным уровнем', () => {
    const win = games.find(g => g.record.result!.fool === 1)!;
    const st = computeStats([{ ...win, level: 'master', hinted: false }], 0);
    expect(st.elo).toBeGreaterThan(START_ELO);
    expect(LEVEL_ELO.master).toBeGreaterThan(LEVEL_ELO.experienced);
  });

  test('козыри из колоды: раздача и добор, не больше девяти на всех', () => {
    for (const g of games) {
      const t = trumpsDealt(g.record);
      expect(t.length).toBe(2);
      const all = t[0] + t[1];
      expect(all).toBeGreaterThan(0);
      expect(all).toBeLessThanOrEqual(9);
    }
  });

  test('серия сегодня обрывается на «остались с картами»', () => {
    const lose = games.find(g => g.record.result!.fool === 0);
    if (!lose) return;
    const st = computeStats([...games.filter(g => g !== lose), { ...lose, end: Date.UTC(2026, 10, 9, 23) }], Date.UTC(2026, 10, 9, 23, 30));
    expect(st.streakToday).toBe(0);
  });
});

