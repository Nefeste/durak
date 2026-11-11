// Дощатый пол комнаты (13-art.md §5, третий круг вида): где лежит каждая доска. Чистая функция — рисует Backdrop.tsx,
// проверяет tools/test/theme.test.ts.

/** Ширина доски и пределы её длины, dp. */
export const PLANK = { width: 44, min: 150, span: 110 } as const;

export interface Plank { x: number; y: number; w: number; h: number; light: boolean }

/**
 * Доски пола: идут от игрока вдаль (вертикально), торцы вразбежку. Без случайности — длина и тон доски считаются
 * из номера ряда и номера доски, поэтому пол один и тот же при каждом запуске. Чистая функция (тест).
 */
export function planks(width: number, height: number): Plank[] {
  const out: Plank[] = [];
  const cols = Math.ceil(width / PLANK.width);
  // ряды — от середины экрана в обе стороны: пол симметричен столу
  const x0 = (width - cols * PLANK.width) / 2;
  for (let i = 0; i < cols; i++) {
    let y = -((i * 97) % PLANK.span) - 20, n = 0;
    while (y < height) {
      const h = PLANK.min + ((i * 53 + n * 71) % PLANK.span);
      out.push({ x: x0 + i * PLANK.width, y, w: PLANK.width, h, light: (i * 3 + n * 5) % 7 < 2 });
      y += h;
      n++;
    }
  }
  return out;
}
