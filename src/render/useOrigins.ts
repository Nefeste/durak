// Откуда летят новые карты (`originsOf` в layout.ts): хук помнит прошлое наблюдение экрана и сравнивает с новым.
// Состояние обновляется прямо при отрисовке — так React советует хранить то, что выводится из прошлых значений.
import { useState } from 'react';
import type { Observation } from '../engine';
import { noOrigins, originsOf } from './layout';
import type { Origins } from './layout';

export function useOrigins(view: Observation | null): Origins {
  const [seen, setSeen] = useState<{ view: Observation | null; origins: Origins }>(() => ({ view, origins: noOrigins() }));
  if (view && view !== seen.view) {
    const origins = originsOf(seen.view, view, seen.origins);
    setSeen({ view, origins });
    return origins;
  }
  return seen.origins;
}
