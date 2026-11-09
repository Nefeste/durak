// Реплики за столом на экране (docs/09-game-design.md, «Живой стол»): хук помнит прошлое наблюдение, сравнивает с
// новым (`speechOf`) и держит каждую реплику 1,2 с. Новая реплика того же места сменяет старую.
import { useEffect, useRef, useState } from 'react';
import type { Observation } from '../engine';
import { speechOf } from './speech';
import type { Word } from './speech';

/** Сколько видна реплика, мс (docs/09-game-design.md, «Темп»). */
export const SAY_MS = 1200;

export interface Bubble { id: number; seat: number; word: Word }

export function useSpeech(view: Observation | null): Bubble[] {
  const [seen, setSeen] = useState<{ view: Observation | null; list: Bubble[]; n: number }>(() => ({ view, list: [], n: 0 }));
  let cur = seen;
  if (view && view !== seen.view) {
    const says = speechOf(seen.view, view);
    let n = seen.n;
    const fresh = says.map(s => ({ id: ++n, seat: s.seat, word: s.word }));
    cur = { view, n, list: [...seen.list.filter(b => !says.some(s => s.seat === b.seat)), ...fresh] };
    setSeen(cur);
  }
  // каждая реплика гаснет через SAY_MS от своего появления, сколько бы новых ни пришло за это время
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    for (const b of seen.list) {
      if (timers.current.has(b.id)) continue;
      timers.current.set(b.id, setTimeout(() => {
        timers.current.delete(b.id);
        setSeen(s => ({ ...s, list: s.list.filter(x => x.id !== b.id) }));
      }, SAY_MS));
    }
  }, [seen.list]);
  useEffect(() => {
    const all = timers.current;
    return () => { all.forEach(clearTimeout); all.clear(); };
  }, []);
  return cur.list;
}
