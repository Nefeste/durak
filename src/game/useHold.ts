// Пауза перед «бито» и «беру» на экране (src/game/hold.ts): пока она идёт, стол показывает вид «последняя карта
// легла», потом — настоящий, и карты уходят в сброс или к взявшему. `key` — номер действия: новое действие
// (или касание своей карты, `skip`) кончает паузу. Состояние меняется прямо при отрисовке, как в useOrigins: иначе на
// один кадр мелькнул бы пустой стол.
import { useEffect, useState } from 'react';
import type { Observation } from '../engine';

export function useHold(key: string, held: Observation | null, ms: number): { shown: Observation | null; skip: () => void } {
  const [hold, setHold] = useState<{ key: string; on: boolean }>({ key: '', on: false });
  let cur = hold;
  if (held && hold.key !== key) {
    cur = { key, on: true };
    setHold(cur);
  }
  const on = !!held && cur.key === key && cur.on;
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setHold({ key, on: false }), ms);
    return () => clearTimeout(t);
  }, [key, on, ms]);
  return { shown: on ? held : null, skip: () => { if (on) setHold({ key, on: false }); } };
}
