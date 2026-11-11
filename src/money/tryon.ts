// Примерка платной рубашки на одну партию — награда за рекламу по желанию (docs/09-game-design.md, «Рубашки»;
// решение владельца #59, вариант 1). Чистые правила — какая рубашка на столе и когда примерка кончается — и её
// хранение (`durak.tryon`): партия, продолженная после перезапуска, остаётся в примеренной рубашке.
import { DEFAULT_BACK, isPaidBack } from '../render/backs';
import type { BackId, PaidBackId } from '../render/backs';
import { KEYS, loadJson, saveJson } from '../state/storage';

export interface TryOn {
  back: PaidBackId;
  /** Партия, на которую надета: `null` — ждёт первую партию, в которую войдёт игрок. */
  game: string | null;
  /** Эта партия кончилась: рубашка остаётся на её итоге, а примерить можно уже другую. */
  over: boolean;
}

/** Примерка ждёт партию или идёт — вторую взять нельзя. */
export const tryOnPending = (t: TryOn | null): boolean => t !== null && !t.over;

/**
 * Какая рубашка на картах. `game` — партия, чей стол рисуется (нет — меню, правила, разбор, задача дня: там всегда
 * выбранная). Примерка — на своей партии и на той, что её ещё только получит. Иначе — выбранная в настройках, если
 * она бесплатна или куплена; некупленная (возврат покупки, чужие настройки) — рубашка по умолчанию.
 */
export function backShown(chosen: BackId, owns: (id: BackId) => boolean, t: TryOn | null, game?: string): BackId {
  if (t && game !== undefined && (t.game === game || (t.game === null && !t.over))) return t.back;
  return owns(chosen) ? chosen : DEFAULT_BACK;
}

/** В партии `game` сделан первый ход (или она продолжена): ждавшая примерка надевается на неё; примерка другой партии
 *  кончается. Стол без единого хода примерку не тратит. */
export function wearAt(t: TryOn | null, game: string): TryOn | null {
  if (!t) return null;
  if (t.game === null) return t.over ? null : { ...t, game };
  return t.game === game ? t : null;
}

/** Партия кончилась: надетая на неё примерка остаётся до ухода с итога, но следующую уже можно взять. */
export const afterTryGame = (t: TryOn | null): TryOn | null => (t && t.game !== null && !t.over ? { ...t, over: true } : t);

export function normalizeTryOn(raw: unknown): TryOn | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (!isPaidBack(r.back)) return null;
  return { back: r.back, game: typeof r.game === 'string' ? r.game : null, over: r.over === true };
}

let tryOn: TryOn | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function loadTryOn(): Promise<void> {
  loading ??= loadJson<unknown>(KEYS.tryOn).then(raw => { tryOn = normalizeTryOn(raw); emit(); });
  return loading;
}

export const getTryOn = (): TryOn | null => tryOn;

export function onTryOn(f: () => void): () => void {
  listeners.add(f);
  return () => { listeners.delete(f); };
}
function emit() { for (const f of listeners) f(); }

export async function setTryOn(next: TryOn | null): Promise<void> {
  await loadTryOn();
  if (next === tryOn) return;
  tryOn = next;
  emit();
  await saveJson(KEYS.tryOn, tryOn);
}
