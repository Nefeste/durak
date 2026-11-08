// из nardy: src/state/report.ts @ 1d2bdff (ADR 0001) — вместо партии нард — запись партии «Козыря».
// Отчёт об ошибке: один текст, который игрок видит целиком до отправки. Уходит только его
// руками — письмом или через «Поделиться».
import type { CrashEntry } from './crashlog';

export interface ReportInput {
  what: string;
  version: string; build: number;
  /** «Android 14 · Xiaomi 23053RN02Y» — с телефона; в вебе — браузер */
  device: string;
  lang: string;
  /** экран, с которого открыли отчёт */
  screen: string;
  /** открытая партия: её запись (расстановка и действия) */
  game: string | null;
  log: CrashEntry[] | null;
  labels: { what: string; version: string; device: string; screen: string; game: string; log: string; noLog: string; logUnread: string };
}

/** Предел тела письма: `mailto` длиннее многие почтовые приложения обрезают. */
export const REPORT_MAX = 8000;
/** Сколько последних записей журнала идёт в отчёт. */
export const REPORT_LOG = 10;

const time = (t: number) => new Date(t).toISOString().replace('T', ' ').slice(0, 19);

export function buildReport(r: ReportInput): string {
  const L = r.labels;
  const log = r.log === null ? L.logUnread
    : !r.log.length ? L.noLog
    : r.log.slice(-REPORT_LOG).map(e => `[${time(e.at)} ${e.kind}] ${e.message}`).join('\n\n');
  const text = [
    r.what.trim() ? `${L.what}\n${r.what.trim()}` : '',
    `${L.version}: ${r.version} (${r.build}) · ${r.lang}`,
    `${L.device}: ${r.device}`,
    `${L.screen}: ${r.screen}`,
    r.game ? `${L.game}: ${r.game}` : '',
    `${L.log}:\n${log}`,
  ].filter(Boolean).join('\n\n');
  // обрезается журнал, а не то, что написал игрок: он — в начале
  return text.length > REPORT_MAX ? `${text.slice(0, REPORT_MAX - 1)}…` : text;
}
