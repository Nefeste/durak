// Вшить сеть «Мастера» в приложение (docs/specs/2026-11-neural.md, «Как сеть попадает в игру»; по образцу
// tools/train/export.ts «Нард»): веса `<снимок>.bin` строкой base64 и паспорт — в src/bot/net/weights.ts. Руками этот
// модуль не правят: только этот генератор. Перед записью — проверка: sha256 файла совпадает с паспортом `<снимок>.json`,
// веса читаются `netFromBin`, признаки той же версии, что у приложения.
//
//   bun tools/gpu/embed.ts tools/gpu/nets/2026-11-12-main/last
//
// Арена приёмки (2 000 партий на соперника, на новом зерне) — из `accept.json` рядом со снимком, если он есть: часовая
// арена обучения в `<снимок>.json` — 400 партий, для паспорта игры её мало.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { FEATURES_VERSION } from '../../src/bot/net/features';
import { netFromBin } from '../../src/bot/net/model';

export const OUT = 'src/bot/net/weights.ts';

interface Passport { sizes: number[]; features: number; sha256: string; bytes: number; games: number; hours: number; rounds: number }
export interface Accept { date: string; vs: { who: string; games: number; share: number; ci: number; elo: number }[] }

/** Текст модуля весов по снимку: тот же вход — тот же текст (тест сверяет вшитое с файлом). */
export function moduleOf(prefix: string): string {
  const bin = readFileSync(`${prefix}.bin`);
  const p = JSON.parse(readFileSync(`${prefix}.json`, 'utf8')) as Passport;
  const sha = createHash('sha256').update(bin).digest('hex');
  if (sha !== p.sha256) throw new Error(`${prefix}.bin: sha256 ${sha}, а в паспорте ${p.sha256}`);
  if (p.features !== FEATURES_VERSION) throw new Error(`снимок с признаками v${p.features}, приложение — v${FEATURES_VERSION}`);
  const net = netFromBin(new Uint8Array(bin));
  if (net.sizes.join() !== p.sizes.join()) throw new Error(`размеры слоёв ${net.sizes} не как в паспорте ${p.sizes}`);
  const acceptFile = join(dirname(prefix), 'accept.json');
  const accept = existsSync(acceptFile) ? (JSON.parse(readFileSync(acceptFile, 'utf8')) as Accept) : null;
  const source = prefix.replace(/\\/g, '/');
  const data = bin.toString('base64');
  const lines = data.match(/.{1,120}/g) ?? [];
  const arena = accept
    ? `  /** Арена приёмки ${accept.date}: доля партий, где сеть не осталась с картами (ничья — половина), ±95 %, Эло. */
  arena: [
${accept.vs.map(v => `    { vs: '${v.who}', games: ${v.games}, share: ${v.share}, ci: ${v.ci}, elo: ${v.elo} },`).join('\n')}
  ],
` : '  arena: [],\n';
  return `// Сгенерировано tools/gpu/embed.ts из ${source} — не править руками.
// Сеть ${p.sizes.join(' × ')}, ${p.games} партий обучения, ${p.hours} ч${accept ? `; против «Опытного» ${accept.vs[0].share}` : ''}.

export interface Weights {
  source: string;
  /** sha256 файла весов \`.bin\` — тест сверяет его с раскодированной строкой и с файлом. */
  sha256: string;
  bytes: number;
  sizes: readonly number[];
  features: number;
  games: number;
  hours: number;
  rounds: number;
  arena: readonly { vs: string; games: number; share: number; ci: number; elo: number }[];
  /** Файл \`.bin\` целиком, base64. */
  data: string;
}

export const MASTER_WEIGHTS: Weights = {
  source: '${source}.bin',
  sha256: '${p.sha256}',
  bytes: ${bin.length},
  sizes: [${p.sizes.join(', ')}],
  features: ${p.features},
  games: ${p.games},
  hours: ${p.hours},
  rounds: ${p.rounds},
${arena}  // куски массивом, а не через «+»: тысячи сложений подряд — слишком глубокое дерево для парсеров
  data: [
${lines.map(l => `    '${l}',`).join('\n')}
  ].join(''),
};
`;
}

if (import.meta.main) {
  const prefix = (process.argv[2] ?? '').replace(/\.bin$/, '');
  if (!prefix) {
    console.error('usage: bun tools/gpu/embed.ts tools/gpu/nets/<дата>/last');
    process.exit(2);
  }
  const text = moduleOf(prefix);
  writeFileSync(OUT, text);
  console.log(`${OUT}: ${prefix}.bin, ${text.length} знаков`);
}
