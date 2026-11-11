// Соперники с именами (решение владельца #20, ADR 0011; src/game/rivals.ts): за одним столом имена не повторяются,
// стол с теми же уровнями — те же соперники (сохранённая партия, разбор, история), онлайн их считает каждый телефон из
// того, что сервер и так шлёт, — и у всех за столом они одинаковые. Статистика остаётся по уровням.
import { describe, expect, test } from 'bun:test';
import { LEVELS, LOCKED_LEVEL } from '../../src/bot';
import type { Level } from '../../src/bot';
import { ALL_RIVALS, CAST, CAST_LEVELS, rivalsAt, rivalsOf } from '../../src/game/rivals';
import type { CastLevel } from '../../src/game/rivals';
import { tableRivals } from '../../src/game/seats';
import { T } from '../../src/i18n';
import { NAME_RE, RESERVED_NAMES } from '../../src/state/protocol';
import { restoreGame } from '../../src/state/saved';
import { normalizeHistory } from '../../src/state/history';
import { deckFrom, dealOf, firstOf, rulesWith } from '../../src/engine';
import type { GameRecord } from '../../src/engine';
import type { SeatView, TableView } from '../../src/state/protocol';
import { PORTRAIT } from '../../src/ui/theme';

const ids = (rs: ReturnType<typeof rivalsAt>) => rs.map(r => r?.id ?? null);

describe('состав', () => {
  test('у каждого из шести уровней и у закрытого седьмого — три персонажа своего уровня', () => {
    expect(CAST_LEVELS).toEqual([...LEVELS, LOCKED_LEVEL]);
    for (const l of CAST_LEVELS) {
      expect(CAST[l].length).toBe(3);
      for (const r of CAST[l]) expect(r.level).toBe(l);
    }
    expect(ALL_RIVALS.length).toBe(21);
  });

  test('номера и имена не повторяются; у каждого есть имя и характер', () => {
    expect(new Set(ALL_RIVALS.map(r => r.id)).size).toBe(21);
    const names = ALL_RIVALS.map(r => T.rival[r.id]);
    expect(new Set(names.map(n => n.toLowerCase())).size).toBe(21);
    for (const r of ALL_RIVALS) expect(T.rivals.about[r.id].length).toBeGreaterThan(10);
    expect(Object.keys(T.rival).sort()).toEqual(ALL_RIVALS.map(r => r.id).sort());
  });

  test('имя — короткое, годится и как ник: до семи букв, не запрещённое', () => {
    for (const r of ALL_RIVALS) {
      const name = T.rival[r.id];
      // семь букв жирным шрифтом ×1,3 помещаются на плашке вчетвером на 360 точках (docs/13-art.md, §11)
      expect([...name].length).toBeLessThanOrEqual(7);
      expect(NAME_RE.test(name)).toBe(true);
      expect(RESERVED_NAMES.map(x => x.toLowerCase())).not.toContain(name.toLowerCase());
      // ни слова «бот» в имени: «бот» — отдельная подпись
      expect(/бот/i.test(name)).toBe(false);
    }
  });

  test('имена не совпадают с названиями уровней', () => {
    const levels = new Set(LEVELS.map(l => T.level[l].toLowerCase()));
    for (const r of ALL_RIVALS) expect(levels.has(T.rival[r.id].toLowerCase())).toBe(false);
  });

  // порядок состава решает, кого игрок увидит в сохранённой партии и в разборе старой: он вечный
  test('порядок состава закреплён', () => {
    expect(CAST_LEVELS.map(l => CAST[l].map(r => r.id))).toEqual([
      ['tyoma', 'asya', 'gosha'],
      ['katya', 'kostya', 'nina'],
      ['vera', 'zakhar', 'lida'],
      ['gleb', 'tamara', 'fyodor'],
      ['roman', 'inna', 'savva'],
      ['stepan', 'zinaida', 'efim'],
      ['lev', 'emma', 'mark'],
    ]);
  });

  test('портрет: цвета — из палитры темы, в уровне все три вида разные', () => {
    for (const r of ALL_RIVALS) {
      expect(PORTRAIT.skin[r.look.skin]).toBeDefined();
      expect(PORTRAIT.hair[r.look.hairColor]).toBeDefined();
      expect(PORTRAIT.cloth[r.look.cloth]).toBeDefined();
      if (r.look.trim) expect(PORTRAIT.cloth[r.look.trim]).toBeDefined();
    }
    // силуэт (причёска и детали) у каждого свой — во всём составе, а не только за одним столом
    const shape = (r: typeof ALL_RIVALS[number]) => `${r.look.hair}|${[...r.look.extras].sort().join('+')}`;
    expect(new Set(ALL_RIVALS.map(shape)).size).toBe(21);
    for (const l of CAST_LEVELS) expect(new Set(CAST[l].map(r => r.look.cloth)).size).toBe(3);
  });

  test('золота главной кнопки в палитре портретов нет', async () => {
    const { C } = await import('../../src/ui/theme');
    const all = [PORTRAIT.ground, ...PORTRAIT.skin, ...PORTRAIT.shade, ...Object.values(PORTRAIT.hair), ...Object.values(PORTRAIT.cloth), PORTRAIT.ink, PORTRAIT.metal, PORTRAIT.linen];
    expect(all.map(c => c.toLowerCase())).not.toContain(C.accent.toLowerCase());
  });
});

describe('кто сидит за столом', () => {
  const all = (n: number, pool: readonly Level[]): Level[][] =>
    n === 0 ? [[]] : all(n - 1, pool).flatMap(rest => pool.map(l => [...rest, l]));

  test('один бот — лицо своего уровня', () => {
    for (const l of LEVELS) expect(ids(rivalsOf([l]))).toEqual([null, CAST[l][0].id]);
  });

  test('три бота одного уровня — весь состав по порядку', () => {
    expect(ids(rivalsOf(['average', 'average', 'average']))).toEqual([null, 'gleb', 'tamara', 'fyodor']);
  });

  test('разные уровни — у каждого лицо своего уровня; повтор уровня — следующий из состава', () => {
    expect(ids(rivalsOf(['novice', 'average', 'master']))).toEqual([null, 'tyoma', 'gleb', 'stepan']);
    expect(ids(rivalsOf(['average', 'novice', 'average']))).toEqual([null, 'gleb', 'tyoma', 'tamara']);
  });

  test('за любым столом на 2–4 места имена не повторяются, а уровень персонажа — уровень бота', () => {
    let tables = 0;
    for (const n of [1, 2, 3]) {
      for (const levels of all(n, LEVELS)) {
        const rs = rivalsOf(levels);
        expect(rs[0]).toBeNull();
        const names = rs.slice(1).map(r => T.rival[r!.id]);
        expect(new Set(names).size).toBe(n);
        rs.slice(1).forEach((r, i) => expect(r!.level).toBe(levels[i]));
        tables++;
      }
    }
    expect(tables).toBe(6 + 36 + 216);
  });

  test('одни и те же уровни — одни и те же соперники, сколько ни считай', () => {
    for (const levels of all(3, LEVELS)) expect(ids(rivalsOf(levels))).toEqual(ids(rivalsOf([...levels])));
  });

  test('закрытый седьмой уровень: свой состав — покажется, когда уровень откроется', () => {
    expect(ids(rivalsAt([null, 'neural', 'neural', 'neural']))).toEqual([null, 'lev', 'emma', 'mark']);
  });
});

describe('сохранение и история', () => {
  const record = (seats: number): GameRecord => {
    const deck = deckFrom(new Uint8Array(32).fill(7));
    const { hands, trump } = dealOf(deck, seats);
    const first = firstOf(hands, trump);
    return { v: 1, rules: rulesWith('queue'), variant: 'podkidnoy', seats, deck, actions: [], result: null, first: first.seat, firstWhy: first.why };
  };

  test('партия после перезапуска — с теми же соперниками: имена считаются из уровней сохранения', () => {
    const levels: Level[] = ['average', 'average', 'novice'];
    const before = ids(rivalsOf(levels));
    // хранилище — строка: в сохранении нет ни имён, ни номеров персонажей, только уровни по местам
    const raw = JSON.parse(JSON.stringify({ record: record(4), levels, history: [] }));
    expect(JSON.stringify(raw)).not.toContain('gleb');
    const r = restoreGame(raw);
    expect(r).not.toBeNull();
    expect(ids(rivalsOf(r!.saved.levels))).toEqual(before);
    expect(before).toEqual([null, 'gleb', 'tamara', 'tyoma']);
  });

  test('старая запись истории с одним `level` и с уровнем `strong` — тоже с именами', () => {
    const done = { ...record(3), result: { fool: 1, draw: false, order: [0, 2] } };
    const [g] = normalizeHistory([{ record: done, level: 'strong', at: 1, end: 2, hinted: false, review: null }]);
    expect(g.levels).toEqual(['master', 'master']);
    expect(ids(rivalsOf(g.levels))).toEqual([null, 'stepan', 'zinaida']);
  });
});

describe('онлайн', () => {
  const seat = (bot: Level | null, name = ''): SeatView => ({ name, tag: null, bot, botFor: false, online: true, cards: 6, out: false });
  const table = (seats: (SeatView | null)[], host: number): Pick<TableView, 'seats' | 'host'> => ({ seats, host });

  test('сервер шлёт только уровень бота на месте — имён и номеров персонажей в виде стола нет', () => {
    const t = table([seat(null, 'Маша'), seat('average'), seat('average'), seat('beginner')], 0);
    expect(JSON.stringify(t)).not.toMatch(/gleb|tamara|katya/);
    expect(ids(tableRivals(t))).toEqual([null, 'gleb', 'tamara', 'katya']);
  });

  test('у всех за столом имена одни и те же: счёт — от места создателя, а не от своего', () => {
    // создатель — на месте 2; места 0 и 3 — боты одного уровня, место 1 — второй человек
    const seats = [seat('amateur'), seat(null, 'Петя'), seat(null, 'Маша'), seat('amateur')];
    const seen = [1, 2].map(() => ids(tableRivals(table(seats, 2))));
    expect(seen[0]).toEqual(seen[1]);
    // по часовой стрелке от создателя: место 3 — первое, место 0 — второе
    expect(seen[0]).toEqual(['zakhar', null, null, 'vera']);
  });

  test('места без бота — без персонажа: человек, свободное место, стол без создателя', () => {
    expect(ids(tableRivals(table([seat(null, 'Маша'), null, seat('master')], 0)))).toEqual([null, null, 'stepan']);
    expect(ids(tableRivals(table([seat(null, 'Маша'), seat('master')], -1)))).toEqual([null, 'stepan']);
  });

  test('имена не повторяются за любым столом на 2–4 места с любым местом создателя', () => {
    const pool: (CastLevel | null)[] = [null, ...LEVELS];
    for (const n of [2, 3, 4]) {
      const fill = (k: number): (CastLevel | null)[][] => (k === 0 ? [[]] : fill(k - 1).flatMap(rest => pool.map(l => [...rest, l])));
      for (const bots of fill(n)) {
        for (let host = 0; host < n; host++) {
          if (bots[host]) continue;
          const names = rivalsAt(bots, host).filter(r => r).map(r => r!.id);
          expect(new Set(names).size).toBe(names.length);
          expect(names.length).toBe(bots.filter(b => b).length);
        }
      }
    }
  });

  test('ушёл бот с места (на него сел человек) — остальные боты остаются со своими уровнями и без повторов', () => {
    const before = rivalsAt([null, 'average', 'average', 'average'], 0);
    const after = rivalsAt([null, null, 'average', 'average'], 0);
    expect(ids(before)).toEqual([null, 'gleb', 'tamara', 'fyodor']);
    expect(ids(after)).toEqual([null, null, 'gleb', 'tamara']);
  });
});
