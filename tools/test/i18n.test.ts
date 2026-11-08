// из nardy: tools/test/i18n.test.ts @ 1d2bdff (из votchina) — свои исключения: запись карт движка.
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const ROOT = join(import.meta.dir, '../..');
const CYR = /[А-Яа-яЁё]/;
const ALLOWED: Record<string, string[]> = {
  // запись карт для тестов и журнала — данные движка, а не текст интерфейса (docs/04-data-model.md)
  'src/engine/cards.ts': ['В', 'Д', 'К', 'Т'],
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return p.endsWith('i18n') ? [] : files(p);
    return /\.tsx?$/.test(n) ? [p] : [];
  });
}

/** Кириллица в строках кода: литералы, шаблоны и текст разметки; комментарии не в счёт. */
function leaks(path: string): { line: number; text: string }[] {
  const src = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: { line: number; text: string }[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isJsxText(n)) {
      const text = n.text.trim();
      if (CYR.test(text)) out.push({ line: src.getLineAndCharacterOfPosition(n.getStart()).line + 1, text });
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return out;
}

describe('тексты — только в словаре', () => {
  test('в src и App.tsx нет русских строк вне src/i18n', () => {
    const found: string[] = [];
    for (const f of [...files(join(ROOT, 'src')), join(ROOT, 'App.tsx')]) {
      const rel = relative(ROOT, f);
      const ok = new Set(ALLOWED[rel] ?? []);
      for (const l of leaks(f)) if (!ok.has(l.text)) found.push(`${rel}:${l.line}  ${l.text.slice(0, 60)}`);
    }
    if (found.length) console.log(`русских строк вне словаря: ${found.length}\n${found.join('\n')}`);
    expect(found).toEqual([]);
  });
});
