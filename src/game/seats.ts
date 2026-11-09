// Где место за столом с друзьями — глазами создателя (src/game/SeatMap.tsx): соперники над рукой идут по часовой
// стрелке слева направо (src/render/layout.ts), поэтому следующее за создателем место — слева, предпоследнее — справа,
// а вчетвером через одно — напротив. Без React — проверяется тестом (tools/test/seats.test.ts).
import type { TableView } from '../state/protocol';

export type Where = 'opposite' | 'left' | 'right';

/** Где место `seat` относительно места `host` за столом на `n` мест; само место создателя — `null`. */
export function whereOf(seat: number, host: number, n: number): Where | null {
  const rel = (((seat - host) % n) + n) % n;
  if (rel === 0) return null;
  if (n === 2) return 'opposite';
  if (n === 4 && rel === 2) return 'opposite';
  return rel === 1 ? 'left' : 'right';
}

/** Ряды схемы сверху вниз: напротив — наверху, слева и справа — посередине (втроём — наверху), создатель — внизу. */
export function placeRows(host: number, n: number): number[][] {
  const at = (rel: number) => (host + rel) % n;
  if (n === 2) return [[at(1)], [at(0)]];
  if (n === 3) return [[at(1), at(2)], [at(0)]];
  return [[at(2)], [at(1), at(3)], [at(0)]];
}

/** Места стола для схемы из вида места (`TableView`). */
export function placesOf(t: TableView): ({ name: string; bot: TableView['bots']; host: boolean; you: boolean } | null)[] {
  return t.seats.map((s, i) => (s ? { name: s.name, bot: s.bot, host: i === t.host, you: i === t.you } : null));
}
