// Закрепить выпущенные задачи дня: отпечаток каждой — в tools/test/fixtures/puzzles.json. Тест падает, если
// выпущенная задача изменилась или пропала (номера вечные, docs/10-bot.md, «Задача дня»). Запускается перед выпуском;
// закреплённые не переписываются — только добавляются новые.
//   bun tools/puzzles/pin.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PUZZLES } from '../../src/game/puzzleSet';

const FILE = join(import.meta.dir, '../test/fixtures/puzzles.json');
export const printOf = (p: unknown) => createHash('sha256').update(JSON.stringify(p)).digest('hex').slice(0, 16);
const old: { id: number; sha: string }[] = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : [];
const have = new Set(old.map(x => x.id));
const all = [...old, ...PUZZLES.filter(p => !have.has(p.id)).map(p => ({ id: p.id, sha: printOf(p) }))];
writeFileSync(FILE, JSON.stringify(all, null, 0).replace(/},{/g, '},\n{') + '\n');
console.log(`закреплено задач: ${all.length}`);
