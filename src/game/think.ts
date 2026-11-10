// из nardy: src/bot/think.ts @ 1d2bdff — `thinkSliced`; часть с часами вынесена из `src/bot/` (там
// часов нет, тест чистоты). Тип размышления и счёт подряд — `src/bot/think.ts`.
import type { Thinking } from '../bot';

export interface ThinkJob<R> { promise: Promise<R>; cancel: () => void }

/**
 * Думать кусками не дольше `sliceMs`, отдавая управление между ними, и не дольше `budgetMs`
 * в сумме. Кусок кончается, когда следующий шаг, судя по последнему, уже не успеет до конца
 * куска (спецификация бота, критерий 3: кусок ≤ 12 мс по p95; по умолчанию — `SLICE_MS`), — а не после того, как время
 * вышло. `onSlice` — длина каждого куска, мс (замер и тест). Отменённая работа не завершается
 * никогда: обещание просто не исполнится.
 */
/** Кусок по умолчанию, мс: с работой кадра укладывается в 16,7 мс (замер владельца 10.11.2026 на 12 мс: кадры JS —
 *  медиана 17,1 мс, дольше 25 мс — 13 %). */
export const SLICE_MS = 10;

/** Следующий кусок — к следующему кадру, а не сразу: `setTimeout(0)` пускал два-три куска подряд между кадрами, и
 *  кадр JS выходил 25–50 мс. Где кадров нет (Bun: тесты, арена), — как раньше, сразу. */
const nextSlice: (f: () => void) => void = typeof requestAnimationFrame === 'function'
  ? f => { requestAnimationFrame(() => f()); }
  : f => { setTimeout(f, 0); };

export function thinkSliced<R>(t: Thinking<R>, budgetMs: number, sliceMs = SLICE_MS, now: () => number = () => Date.now(), onSlice?: (ms: number) => void): ThinkJob<R> {
  let cancelled = false;
  const promise = new Promise<R>((resolve, reject) => {
    const deadline = now() + budgetMs;
    const slice = () => {
      if (cancelled) return;
      try {
        const start = now();
        const end = Math.min(deadline, start + sliceMs);
        let at = start;
        for (;;) {
          const r = t.next(at >= deadline);
          const was = at;
          at = now();
          if (r.done) { onSlice?.(at - start); resolve(r.value); return; }
          if (at + (at - was) >= end) break;             // следующий шаг не влезет — отдать управление
        }
        onSlice?.(at - start);
        nextSlice(slice);
      } catch (e) { reject(e); }
    };
    nextSlice(slice);
  });
  return { promise, cancel: () => { cancelled = true; } };
}
