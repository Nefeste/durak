// «Путь к Мастеру» (docs/specs/2026-11-path.md): порядок, матчи, коллекция, разбор сохранения.
import { describe, expect, test } from 'bun:test';
import { EMPTY_PATH, PATH, PATH_LEN, beatenOf, currentRival, normalizePath, outcomeOf, scoreGame, winsFor, withRival } from '../../src/game/path';
import type { PathLog } from '../../src/game/path';
import { ALL_RIVALS, CAST, CAST_LEVELS, rivalsOf } from '../../src/game/rivals';
import { restoreGame } from '../../src/state/saved';
import { normalizeHistory, rivalsIn } from '../../src/state/history';
import { rulesWith } from '../../src/engine';
import type { Result } from '../../src/engine';

const win: Result = { order: [0], fool: 1, draw: false };
const lose: Result = { order: [1], fool: 0, draw: false };

describe('порядок пути', () => {
  test('21 соперник, каждый один раз, ступени по силе, «лицо уровня» — последним в ступени', () => {
    expect(PATH_LEN).toBe(21);
    expect(new Set(PATH.map(r => r.id)).size).toBe(21);
    expect([...PATH].sort((a, b) => a.id.localeCompare(b.id))).toEqual([...ALL_RIVALS].sort((a, b) => a.id.localeCompare(b.id)));
    CAST_LEVELS.forEach((l, s) => {
      expect(PATH.slice(s * 3, s * 3 + 3).every(r => r.level === l)).toBe(true);
      expect(PATH[s * 3 + 2].id).toBe(CAST[l][0].id);
    });
    expect(PATH[PATH_LEN - 1].id).toBe('lev');
    expect(PATH[PATH_LEN - 1].level).toBe('neural');
  });
  test('первые три ступени — до одной победы, дальше — до двух', () => {
    expect(PATH.map(r => winsFor(r.level))).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
  });
});

describe('матч', () => {
  test('исход: сдался — проигрыш, ничья не считается', () => {
    expect(outcomeOf(win)).toBe('win');
    expect(outcomeOf(lose)).toBe('lose');
    expect(outcomeOf({ order: [0, 1], fool: null, draw: true })).toBe('draw');
    expect(outcomeOf({ order: [1], fool: 0, draw: false, resigned: [0] })).toBe('lose');
  });
  test('матч до одной победы: победа — дальше, коллекция пополняется', () => {
    const s = scoreGame(EMPTY_PATH, 'podkidnoy', PATH[0].id, 'win', 1000);
    expect(s.event).toBe('matchWon');
    expect(s.log.runs.podkidnoy.at).toBe(1);
    expect(s.next?.id).toBe(PATH[1].id);
    expect(s.log.runs.perevodnoy.at).toBe(0);
    expect(beatenOf(s.log).has(PATH[0].id)).toBe(true);
    expect(s.log.rivals[PATH[0].id]).toEqual({ won: 1, lost: 0, beatenAt: 1000 });
  });
  test('проигрыш ничего не отнимает: счёт сбрасывается, соперник тот же', () => {
    let log: PathLog = { ...EMPTY_PATH, runs: { ...EMPTY_PATH.runs, podkidnoy: { at: 9, you: 0, them: 0, doneAt: null } } };
    const r = PATH[9].id;
    let s = scoreGame(log, 'podkidnoy', r, 'win', 1); log = s.log;
    expect([s.event, s.you, s.them]).toEqual(['continue', 1, 0]);
    s = scoreGame(log, 'podkidnoy', r, 'draw', 2); log = s.log;
    expect([s.event, s.you, s.them]).toEqual(['continue', 1, 0]);
    s = scoreGame(log, 'podkidnoy', r, 'lose', 3); log = s.log;
    expect([s.event, s.you, s.them]).toEqual(['continue', 1, 1]);
    s = scoreGame(log, 'podkidnoy', r, 'lose', 4); log = s.log;
    expect(s.event).toBe('matchLost');
    expect(log.runs.podkidnoy).toEqual({ at: 9, you: 0, them: 0, doneAt: null });
    expect(log.rivals[r]).toEqual({ won: 1, lost: 2, beatenAt: null });
    expect(beatenOf(log).size).toBe(0);
  });
  test('весь путь: Лев последним, «путь пройден» с датой', () => {
    let log = EMPTY_PATH;
    for (let i = 0; i < PATH_LEN; i++) {
      const r = currentRival(log.runs.perevodnoy)!;
      for (let w = 0; w < winsFor(r.level); w++) log = scoreGame(log, 'perevodnoy', r.id, 'win', 100 + i).log;
    }
    expect(log.runs.perevodnoy.at).toBe(PATH_LEN);
    expect(log.runs.perevodnoy.doneAt).toBe(100 + PATH_LEN - 1);
    expect(currentRival(log.runs.perevodnoy)).toBeNull();
    expect(beatenOf(log).size).toBe(21);
  });
  test('партия не с текущим соперником путь не двигает', () => {
    const s = scoreGame(EMPTY_PATH, 'podkidnoy', PATH[5].id, 'win', 1);
    expect(s.log.runs.podkidnoy.at).toBe(0);
    expect(s.next?.id).toBe(PATH[0].id);
  });
});

describe('сохранение', () => {
  test('битое и чужое — как с начала, лишнее отрезано', () => {
    expect(normalizePath(null)).toEqual(EMPTY_PATH);
    expect(normalizePath({ runs: { podkidnoy: { at: 99, you: 5 } }, rivals: { lev: { won: -1, beatenAt: 'x' }, nobody: {} } })).toEqual({
      runs: { podkidnoy: { at: 0, you: 0, them: 0, doneAt: null }, perevodnoy: { at: 0, you: 0, them: 0, doneAt: null } },
      rivals: { lev: { won: 0, lost: 0, beatenAt: null } },
    });
    expect(normalizePath({ runs: { perevodnoy: { at: 10, you: 1, them: 1 } } }).runs.perevodnoy).toEqual({ at: 10, you: 1, them: 1, doneAt: null });
    expect(normalizePath({ runs: { perevodnoy: { at: 21 } } }).runs.perevodnoy.doneAt).toBe(1);
  });
  test('за столом матча на месте 1 — соперник матча, не лицо уровня', () => {
    expect(withRival(rivalsOf(['novice']), 'asya')[1]?.id).toBe('asya');
    expect(withRival(rivalsOf(['novice', 'novice']), 'asya')).toEqual(rivalsOf(['novice', 'novice']));
  });
  test('партия матча в истории помнит соперника', () => {
    const record = { v: 1, rules: rulesWith('queue'), variant: 'podkidnoy', seats: 2, deck: [], actions: [], result: win, first: 0, firstWhy: 'lowestTrump' };
    const [g] = normalizeHistory([{ record, levels: ['beginner'], at: 1, end: 2, hinted: false, review: null, rival: 'nina' }]);
    expect(g?.rival).toBe('nina');
    expect(rivalsIn(g!)).toEqual(['nina']);
    const [h] = normalizeHistory([{ record, levels: ['beginner'], at: 1, end: 2, hinted: false, review: null, rival: 'nobody' }]);
    expect(h?.rival).toBeUndefined();
    expect(rivalsIn(h!)).toEqual(['katya']);
  });
  test('сохранённая партия без поля пути читается как раньше', () => {
    expect(restoreGame({})).toBeNull();
  });
});
