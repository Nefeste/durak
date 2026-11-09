// Свой уровень у каждого бота без сети (docs/09-game-design.md, «Боты за столом»; docs/04-data-model.md, «Телефон»):
// бот на месте N думает своим уровнем; сохранение и история хранят уровни по местам; незаконченная партия прошлой
// версии с одним `level` стирается молча (решение владельца 09.11.2026), законченные — читаются «у всех этот уровень».
import { describe, expect, mock, test } from 'bun:test';
import { apply, dealOf, firstOf, legalActions, newGame, observe, RULES_V1 } from '../../src/engine';
import type { GameRecord } from '../../src/engine';
import { chooseAction, levelsOf, makeRng, oneLevel } from '../../src/bot';
import type { Level } from '../../src/bot';
import { botTurn, levelAt, YOU } from '../../src/game/table';
import { isOldSave, restoreGame } from '../../src/state/saved';
import { normalizeHistory } from '../../src/state/history';
import type { FinishedGame } from '../../src/state/history';
import { computeStats } from '../../src/state/stats';
import { shuffled } from '../sim/play';

/** Партия вчетвером: вы — «Средний», боты — по `levels`; каждый ход бота — через `botTurn`, как на экране. */
function tableGame(seed: number, levels: Level[]): { record: GameRecord; turns: { seat: number; level: Level }[] } {
  const rng = makeRng(seed);
  const deck = shuffled(rng);
  const seats = levels.length + 1;
  const { hands, trump } = dealOf(deck, seats);
  const first = firstOf(hands, trump);
  let s = newGame({ rules: RULES_V1, variant: 'podkidnoy', seats, first: first.seat }, deck);
  const record: GameRecord = { v: 1, rules: RULES_V1, variant: 'podkidnoy', seats, first: first.seat, firstWhy: first.why, deck, actions: [], result: null };
  const turns: { seat: number; level: Level }[] = [];
  for (let k = 0; k < 3000 && s.phase !== 'end'; k++) {
    const t = botTurn(s, levels);
    const seat = t ? t.seat : YOU;
    if (!t && legalActions(s, YOU).length === 0) throw new Error('никто не ходит');
    if (t) turns.push(t);
    const a = chooseAction(observe(s, seat), t ? t.level : 'average', rng);
    s = apply(s, seat, a);
    record.actions.push({ seat, action: a, at: 1_000 + k });
  }
  record.result = s.result;
  return { record, turns };
}

describe('уровень у каждого бота', () => {
  test('бот на месте N думает уровнем N-го бота: каждый ход — своим, все боты ходили', () => {
    const levels: Level[] = ['novice', 'amateur', 'experienced'];
    const { record, turns } = tableGame(7, levels);
    expect(record.result).not.toBeNull();
    for (const t of turns) expect(t.level).toBe(levels[t.seat - 1]);
    expect(new Set(turns.map(t => t.seat))).toEqual(new Set([1, 2, 3]));
    expect(new Set(turns.map(t => t.level))).toEqual(new Set(levels));
  });
  test('места и уровни: место 1 — первый бот; один уровень на всех — `oneLevel`', () => {
    expect(levelAt(['novice', 'master'], 1)).toBe('novice');
    expect(levelAt(['novice', 'master'], 2)).toBe('master');
    expect(oneLevel(['average', 'average'])).toBe('average');
    expect(oneLevel(['average', 'novice'])).toBeNull();
    expect(levelsOf(['strong', 'novice'], 2)).toEqual(['master', 'novice']);
    expect(levelsOf(['novice'], 2)).toBeNull();
    expect(levelsOf(['novice', 'god'], 2)).toBeNull();
    expect(levelsOf('novice', 1)).toBeNull();
  });
});

describe('сохранение партии с разными уровнями', () => {
  const { record } = tableGame(11, ['beginner', 'average']);
  const mid: GameRecord = { ...record, actions: record.actions.slice(0, 10), result: null };
  test('уровни по местам переживают перезапуск', () => {
    const r = restoreGame(JSON.parse(JSON.stringify({ record: mid, levels: ['beginner', 'average'], history: [] })));
    expect(r?.saved.levels).toEqual(['beginner', 'average']);
  });
  test('уровней не столько, сколько ботов, — партии нет', () => {
    expect(restoreGame({ record: mid, levels: ['beginner'], history: [] })).toBeNull();
    expect(restoreGame({ record: mid, levels: ['beginner', 'average', 'novice'], history: [] })).toBeNull();
  });
  test('партия прошлой версии с одним `level` не читается и не роняет игру: её стирают без записи в журнал сбоев', async () => {
    const old = { record: mid, level: 'amateur', history: [] };
    expect(restoreGame(old)).toBeNull();
    expect(isOldSave(old)).toBe(true);
    expect(isOldSave({ record: mid, levels: ['beginner', 'average'], history: [] })).toBe(false);
    expect(isOldSave(null)).toBe(false);
    // хранилище — в памяти: `loadGame` видит старую партию, стирает её и не пишет сбой
    const store = new Map<string, string>([['durak.current', JSON.stringify(old)]]);
    mock.module('@react-native-async-storage/async-storage', () => ({
      default: {
        getItem: async (k: string) => store.get(k) ?? null,
        setItem: async (k: string, v: string) => { store.set(k, v); },
        removeItem: async (k: string) => { store.delete(k); },
      },
    }));
    const { loadGame } = await import('../../src/state/save');
    const { readCrashlog } = await import('../../src/state/crashlog');
    expect(await loadGame()).toBeNull();
    expect(store.has('durak.current')).toBe(false);
    expect(await readCrashlog()).toEqual([]);
    store.set('durak.current', JSON.stringify({ record: mid, levels: ['beginner', 'average'], history: [] }));
    expect((await loadGame())?.saved.levels).toEqual(['beginner', 'average']);
  });
});

describe('история и статистика', () => {
  const mixed = tableGame(13, ['novice', 'master']).record;
  const same = tableGame(17, ['amateur', 'amateur']).record;
  test('запись прошлой версии с одним `level` — этот уровень у всех ботов; новая — по местам', () => {
    const h = normalizeHistory([
      { record: same, level: 'amateur', at: 1, end: 2, hinted: false, review: null },
      { record: mixed, levels: ['novice', 'master'], at: 3, end: 4, hinted: false, review: null },
      { record: mixed, levels: ['novice'], at: 5, end: 6, hinted: false, review: null },
    ]);
    expect(h.map(g => g.levels)).toEqual([['amateur', 'amateur'], ['novice', 'master']]);
  });
  test('стол одного уровня — в строке уровня, разные уровни — отдельной строкой', () => {
    const games: FinishedGame[] = [
      { record: same, levels: ['amateur', 'amateur'], at: 1, end: 2, hinted: false, review: null },
      { record: mixed, levels: ['novice', 'master'], at: 3, end: 4, hinted: false, review: null },
    ];
    const st = computeStats(games, 0);
    expect(st.byLevel.amateur?.games).toBe(1);
    expect(st.byLevel.novice).toBeUndefined();
    expect(st.byLevel.master).toBeUndefined();
    expect(st.mixed.games).toBe(1);
    expect(st.total.games).toBe(2);
  });
});
