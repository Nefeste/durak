// из nardy: src/bot/think.ts @ 1d2bdff — `thinkSliced`; часть с часами вынесена из `src/bot/` (там
// часов нет, тест чистоты). Тип размышления и счёт подряд — `src/bot/think.ts`.
import type { Thinking } from '../bot';

export interface ThinkJob<R> { promise: Promise<R>; cancel: () => void }

/** Кусок по умолчанию, мс, — самый длинный: на экране 60 Гц (кадр 16,7 мс). На 90 и 120 Гц кусок короче — `sliceFor`. */
export const SLICE_MS = 10;

/** Доля кадра на кусок и самый короткий кусок, мс. */
const FRAME_SHARE = 0.6, SLICE_MIN = 4;

/**
 * Кусок под частоту экрана: доля кадра, но не длиннее `max`. Замер владельца 10.11.2026, экран 120 Гц: кусок 10 мс не
 * влезал в кадр 8,3 мс, и кадр JS выходил через раз — медиана 16,8 мс, дольше 25 мс — 7,5 %. Кадр неизвестен — самый
 * короткий кусок: первые же кадры покажут частоту.
 */
export const sliceFor = (period: number, max = SLICE_MS): number =>
  Number.isFinite(period) ? Math.max(SLICE_MIN, Math.min(max, period * FRAME_SHARE)) : SLICE_MIN;

/** Кратчайший замеченный промежуток между кадрами, мс, — частота экрана; общий для всех размышлений. Длинные куски
 *  растягивают промежутки, поэтому берётся наименьший: его видно по первым коротким кускам. */
let framePeriod = Infinity;
let lastFrame: number | null = null;

/** Следующий кусок — к следующему кадру, а не сразу: `setTimeout(0)` пускал два-три куска подряд между кадрами, и
 *  кадр JS выходил 25–50 мс. Где кадров нет (Bun: тесты, арена), — как раньше, сразу. */
const frames = typeof requestAnimationFrame === 'function';
const nextSlice: (f: () => void) => void = frames
  ? f => {
    requestAnimationFrame(ts => {
      if (lastFrame !== null && ts > lastFrame && ts - lastFrame < 50) framePeriod = Math.min(framePeriod, ts - lastFrame);
      lastFrame = ts;
      f();
    });
  }
  : f => { setTimeout(f, 0); };

/**
 * Думать кусками не дольше `sliceMs`, отдавая управление между ними, и не дольше `budgetMs`
 * в сумме. Кусок кончается, когда следующий шаг, судя по последнему, уже не успеет до конца
 * куска (спецификация бота, критерий 3: кусок ≤ 12 мс по p95; по умолчанию — `SLICE_MS`), — а не после того, как время
 * вышло. `onSlice` — длина каждого куска, мс (замер и тест). Отменённая работа не завершается
 * никогда: обещание просто не исполнится.
 */
export function thinkSliced<R>(t: Thinking<R>, budgetMs: number, sliceMs = SLICE_MS, now: () => number = () => Date.now(), onSlice?: (ms: number) => void): ThinkJob<R> {
  let cancelled = false;
  const promise = new Promise<R>((resolve, reject) => {
    const deadline = now() + budgetMs;
    const slice = () => {
      if (cancelled) return;
      try {
        const start = now();
        // в Bun кадров нет — кусок как задан; на телефоне — под частоту экрана
        const end = Math.min(deadline, start + (frames ? sliceFor(framePeriod, sliceMs) : sliceMs));
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
