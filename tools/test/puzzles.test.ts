// Задачи дня (docs/10-bot.md, «Задача дня»): набор собран точным расчётом, номера вечные, выпущенные не меняются.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { apply, legalActions } from '../../src/engine';
import { solver } from '../../src/bot/endgame';
import { actorOf } from '../../src/bot/sim';
import { sameAction } from '../../src/bot';
import { PUZZLES } from '../../src/game/puzzleSet';
import { answerOf, dayNumber, puzzleFor, replyOf, START_DAY, stateOf, valueAfter } from '../../src/game/puzzle';

const pinned: { id: number; sha: string }[] = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures/puzzles.json'), 'utf8'));
const printOf = (p: unknown) => createHash('sha256').update(JSON.stringify(p)).digest('hex').slice(0, 16);

describe('набор задач дня', () => {
  test('к 1.0 — 400 задач, номера по порядку с 1', () => {
    expect(PUZZLES.length).toBeGreaterThanOrEqual(400);
    PUZZLES.forEach((p, i) => expect(p.id).toBe(i + 1));
  });

  test('выпущенные задачи не меняются и не пропадают', () => {
    expect(pinned.length).toBeGreaterThan(0);
    for (const { id, sha } of pinned) expect(printOf(PUZZLES[id - 1])).toBe(sha);
  });

  test('позиция цела: 36 карт, колода пуста, двое, ходит игрок, ответ законен и спасает', () => {
    for (const p of PUZZLES) {
      const s = stateOf(p);
      const all = [...s.hands.flat(), ...s.table.flatMap(([a, d]) => (d === null ? [a] : [a, d])), ...s.discard];
      expect(new Set(all).size).toBe(36);
      expect(all.length).toBe(36);
      expect(actorOf(s)).toBe(p.you);
      expect(legalActions(s, p.you).some(a => sameAction(a, p.answer))).toBe(true);
      expect(p.plies).toBeGreaterThanOrEqual(3);
    }
  });

  test('у каждой десятой — ровно одно спасающее первое действие (точный расчёт)', () => {
    for (const p of PUZZLES.filter((_, i) => i % 10 === 0)) {
      const s = stateOf(p);
      const sv = solver(p.you, 400_000);
      const wins = legalActions(s, p.you).filter(a => sv.value(apply(s, p.you, a)) === 1);
      expect(wins.length).toBe(1);
      expect(sameAction(wins[0], p.answer)).toBe(true);
      expect(valueAfter(p, s, p.answer)).toBe(1);
    }
  }, 120_000);
});

// «Ответ» в любой момент (игра владельца 10.11.2026: ответ был только к первому ходу, после него — ни хода, ни ответа)
describe('ответ по ходу задачи', () => {
  test('в начале — ответ набора; по ответам против лучшей защиты игрок выходит, ответ есть на каждом своём ходе', () => {
    for (const p of PUZZLES.filter((_, i) => i % 25 === 0)) {
      let s = stateOf(p);
      expect(sameAction(answerOf(p, s)!, p.answer)).toBe(true);
      for (let step = 0; s.phase !== 'end' && step < 200; step++) {
        const who = actorOf(s);
        if (who === p.you) {
          const a = answerOf(p, s);
          expect(a).not.toBeNull();
          s = apply(s, p.you, a!);
        } else s = apply(s, who, replyOf(p, s, who, legalActions(s, who)));
      }
      expect(s.phase).toBe('end');
      expect(s.result!.draw || s.result!.fool !== p.you).toBe(true);
    }
  }, 120_000);

  test('после неверного первого хода спасения нет — ответа нет', () => {
    const p = PUZZLES[0];
    const s = stateOf(p);
    const wrong = legalActions(s, p.you).find(a => !sameAction(a, p.answer))!;
    let t = apply(s, p.you, wrong);
    while (t.phase !== 'end' && actorOf(t) !== p.you) { const w = actorOf(t); t = apply(t, w, replyOf(p, t, w, legalActions(t, w))); }
    if (t.phase !== 'end') expect(answerOf(p, t)).toBeNull();
  });
});

describe('день', () => {
  test('счёт дней — с первого дня набора по местной дате, задачи по кругу', () => {
    expect(dayNumber(START_DAY)).toBe(1);
    expect(dayNumber('2026-11-10')).toBe(2);
    expect(dayNumber('2026-12-31')).toBe(53);
    expect(dayNumber('2026-01-01')).toBe(1);
    expect(puzzleFor(PUZZLES, 1).id).toBe(1);
    expect(puzzleFor(PUZZLES, PUZZLES.length + 1).id).toBe(1);
  });
});
