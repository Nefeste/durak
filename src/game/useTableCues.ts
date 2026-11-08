// Звуки стола на экране (docs/09-game-design.md, «Звук»): хук помнит прошлое наблюдение своей партии и
// зовёт отклик на то, что изменилось (`cuesOf`). Шлепок звучит, когда карта легла: через полёт (180 мс);
// с «Меньше движения» карта стоит на месте сразу — и звук сразу. Новая партия — новый `game`.
import { useEffect, useRef } from 'react';
import type { Observation } from '../engine';
import { FLIGHT } from '../render/TableCanvas';
import { cue, preloadSounds } from '../ui/feedback';
import { cuesOf } from './cues';

/** `deals` — партия начинается раздачей (в задаче дня её нет: позиция уже на столе). */
export function useTableCues(view: Observation | null, game: string | number, less: boolean, deals = true): void {
  const seen = useRef<{ game: string | number; view: Observation | null }>({ game, view: null });
  useEffect(() => { preloadSounds(); }, []);
  useEffect(() => {
    if (!view) return;
    const prev = seen.current.game === game ? seen.current.view : null;
    if (prev === view) return;
    seen.current = { game, view };
    // таймер не отменяется при следующем наблюдении: карта уже летит, и звук её догонит. Карта, которая
    // кончила отбой, сначала ложится (шлепок через полёт), потом стол уходит («бито» или «беру» — ещё через полёт)
    let at = 0;
    for (const c of cuesOf(prev, view)) {
      if (c.what === 'shuffle' && !deals) continue;
      if (!less && (c.what === 'slap' || at > 0)) at += FLIGHT;
      if (at > 0) setTimeout(() => cue(c.what, c.mine), at);
      else cue(c.what, c.mine);
    }
  }, [view, game, less, deals]);
}
