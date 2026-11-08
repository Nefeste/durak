// из nardy: src/bot/think.ts @ 1d2bdff — `thinkSliced`; часть с часами вынесена из `src/bot/` (там
// часов нет, тест чистоты). Тип размышления и счёт подряд — `src/bot/think.ts`.
import type { Thinking } from '../bot';

export interface ThinkJob<R> { promise: Promise<R>; cancel: () => void }

/**
 * Думать кусками не дольше `sliceMs`, отдавая управление между ними, и не дольше `budgetMs`
 * в сумме. Кусок кончается, когда следующий шаг, судя по последнему, уже не успеет до конца
 * куска (спецификация бота, критерий 3: кусок ≤ 12 мс по p95), — а не после того, как время
 * вышло. `onSlice` — длина каждого куска, мс (замер и тест). Отменённая работа не завершается
 * никогда: обещание просто не исполнится.
 */
export function thinkSliced<R>(t: Thinking<R>, budgetMs: number, sliceMs = 12, now: () => number = () => Date.now(), onSlice?: (ms: number) => void): ThinkJob<R> {
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
        setTimeout(slice, 0);
      } catch (e) { reject(e); }
    };
    setTimeout(slice, 0);
  });
  return { promise, cancel: () => { cancelled = true; } };
}
