// из nardy: tools/test/purity.test.ts @ 1d2bdff — бот не видит колоду: кроме чистоты, ему нельзя импортировать файл колоды движка.
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const ROOT = join(import.meta.dir, '../..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

interface Found { imports: string[]; uses: { what: string; line: number }[] }

/** Откуда файл импортирует и где зовёт `Date`, `Math.random`, `performance`, `crypto`. */
function scan(path: string): Found {
  const src = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const out: Found = { imports: [], uses: [] };
  const line = (n: ts.Node) => src.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const visit = (n: ts.Node) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) out.imports.push(n.moduleSpecifier.text);
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) out.imports.push('import()');
    if (ts.isIdentifier(n) && ['Date', 'performance', 'crypto'].includes(n.text)) out.uses.push({ what: n.text, line: line(n) });
    if (ts.isPropertyAccessExpression(n) && n.getText(src) === 'Math.random') out.uses.push({ what: 'Math.random', line: line(n) });
    ts.forEachChild(n, visit);
  };
  visit(src);
  return out;
}

const rel = (p: string) => relative(ROOT, p);

describe('чистота', () => {
  test('движок: импорты только свои, без React, часов и случайности', () => {
    const bad: string[] = [];
    for (const f of files(join(ROOT, 'src/engine'))) {
      const { imports, uses } = scan(f);
      for (const i of imports) if (!i.startsWith('./') && !i.startsWith('../') ) bad.push(`${rel(f)}: импорт ${i}`);
      for (const i of imports) if (i.startsWith('../') && !join(f, '..', i).startsWith(join(ROOT, 'src/engine'))) bad.push(`${rel(f)}: импорт ${i} из-за пределов движка`);
      for (const u of uses) bad.push(`${rel(f)}:${u.line}: ${u.what}`);
    }
    expect(bad).toEqual([]);
  });


  test('бот: только движок и свои файлы — без колоды, хранилища, React, часов и своей случайности', () => {
    const bad: string[] = [];
    for (const f of files(join(ROOT, 'src/bot'))) {
      const { imports, uses } = scan(f);
      for (const i of imports) {
        const inside = i.startsWith('./') || (i.startsWith('../') && join(f, '..', i).startsWith(join(ROOT, 'src/bot')));
        if (!inside && i !== '../engine') bad.push(`${rel(f)}: импорт ${i}`);
      }
      for (const u of uses) bad.push(`${rel(f)}:${u.line}: ${u.what}`);
      // колода и её построение — не для бота (ADR 0005): ни имён, ни вызовов
      const text = readFileSync(f, 'utf8');
      for (const name of ['deckFrom', 'serverDeck', 'checkDeck', 'dealOf', 'newGame']) if (text.includes(name)) bad.push(`${rel(f)}: ${name}`);
    }
    expect(bad).toEqual([]);
  });

  test('проверка ловит нарушения', () => {
    const tmp = join(ROOT, 'tools/test/fixtures/purity-bad.ts.txt');
    const found = scan(tmp);
    expect(found.imports).toContain('react');
    expect(found.uses.map(u => u.what)).toEqual(['Date', 'Math.random']);
  });
});
