// Перетаскивание карты (docs/09-game-design.md, «Управление»): палец ведёт карту по экранным координатам касания.
// Координаты «внутри вида» (`locationX/Y`) в движении на Android считаются от того вида, что сейчас под пальцем, —
// над кнопкой «Бито» или плашкой соперника они вдруг малы, и карта на кадр прыгала к верху стола: «дубль над плашкой
// соперника» (игра владельца 09.11.2026). Экранные `pageX/Y` от вида не зависят: точка на столе — точка начала касания
// (тогда палец над картой руки, на самом столе) плюс сдвиг пальца по экрану. Без React — проверяется тестами.

/** Начало перетаскивания: точка на столе и на экране. */
export interface DragStart { x0: number; y0: number; px0: number; py0: number }

interface Touch { locationX: number; locationY: number; pageX: number; pageY: number }

export const dragStart = (t: Touch): DragStart => ({ x0: t.locationX, y0: t.locationY, px0: t.pageX, py0: t.pageY });

/** Сдвиг пальца и точка на столе сейчас — только по экранным координатам. */
export function dragPoint(d: DragStart, t: Pick<Touch, 'pageX' | 'pageY'>): { dx: number; dy: number; x: number; y: number } {
  const dx = t.pageX - d.px0, dy = t.pageY - d.py0;
  return { dx, dy, x: d.x0 + dx, y: d.y0 + dy };
}
