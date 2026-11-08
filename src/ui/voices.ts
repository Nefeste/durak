// из nardy: src/ui/voices.ts @ 1d2bdff — без изменений.
// Проигрыватели звука (docs/specs/2026-10-look-and-sound.md, «Что изменилось», 2026-11-07): по одному
// на вариант файла — шаги хода не обрывают друг друга. Заводятся заранее, все звуки партии сразу
// (по одному проигрывателю за шаг), а не при первом выводе шашки в конце партии. Проигрыватель,
// на котором Android сообщил об ошибке, перед следующим звуком открывает файл заново; не создался —
// новая попытка не раньше чем через RETRY_MS, а не молчание до перезапуска игры. Неполадка — в журнал
// сбоев, по разу на вариант. Без модулей Expo — проверяется тестом (tools/test/sound.test.ts);
// настоящий проигрыватель (expo-audio) подставляет src/ui/feedback.ts.

/** Проигрыватель одного файла — то, что нужно от него игре. */
export interface Voice {
  /** Сыграть с начала с громкостью 0…1. */
  play(volume: number): void;
  /** Открыть файл заново: после ошибки проигрыватель молчит, пока файл не откроют снова. */
  reload(): void;
}

/** Создать проигрыватель варианта `k` звука `id`; `fail` — сообщить об ошибке Android на нём. */
export type MakeVoice<Id extends string> = (id: Id, k: number, fail: (why: unknown) => void) => Voice | null;

/** Не создался — новая попытка не раньше чем через столько мс. */
export const RETRY_MS = 5000;

interface Slot { voice: Voice | null; at: number; broken: boolean }

export class Voices<Id extends string> {
  private readonly slots = new Map<string, Slot>();
  private readonly told = new Set<string>();
  private readonly queue: [Id, number][] = [];

  constructor(
    /** Сколько вариантов у каждого звука. */
    private readonly sizes: Readonly<Record<Id, number>>,
    private readonly make: MakeVoice<Id>,
    /** Записать неполадку варианта (в журнал сбоев): какой файл и что случилось — текст или исключение. */
    private readonly note: (key: string, why: unknown) => void = () => {},
    private readonly now: () => number = Date.now,
  ) {}

  /** Неполадка варианта — в журнал один раз: повторы не вытесняют из журнала настоящие сбои. */
  private tell(key: string, why: unknown): void {
    if (this.told.has(key)) return;
    this.told.add(key);
    this.note(key, why);
  }

  /** Проигрыватель варианта: создаётся при первом обращении; не создавшийся — заново через RETRY_MS. */
  private slot(id: Id, k: number): Slot {
    const key = `${id}-${k + 1}`;
    const old = this.slots.get(key);
    if (old && (old.voice || this.now() - old.at < RETRY_MS)) return old;
    const s: Slot = old ?? { voice: null, at: 0, broken: false };
    s.at = this.now();
    s.broken = false;
    try {
      s.voice = this.make(id, k, why => { s.broken = true; this.tell(key, why); });
      if (!s.voice) this.tell(key, 'player not created');
    } catch (e) {
      s.voice = null;
      this.tell(key, e);
    }
    this.slots.set(key, s);
    return s;
  }

  /** Создан ли уже проигрыватель варианта (или была попытка). */
  has(id: Id, k: number): boolean {
    return this.slots.has(`${id}-${k + 1}`);
  }

  /**
   * Сыграть вариант `k`; после ошибки — сначала открыть файл заново. Не бросает: исключение — в журнал,
   * а в следующий раз файл откроется заново. `false` — проигрывателя нет или запуск не удался.
   */
  play(id: Id, k: number, volume: number): boolean {
    const s = this.slot(id, k);
    if (!s.voice) return false;
    try {
      if (s.broken) {
        s.broken = false;
        s.voice.reload();
      }
      s.voice.play(volume);
      return true;
    } catch (e) {
      s.broken = true;
      this.tell(`${id}-${k + 1}`, e);
      return false;
    }
  }

  /**
   * Завести заранее все варианты звуков `ids`, по одному проигрывателю за шаг: `step(next)` зовёт
   * `next` позже (в игре — таймер), и партия не замирает, пока Android открывает файлы.
   */
  warm(ids: readonly Id[], step: (next: () => void) => void): void {
    const idle = this.queue.length === 0;
    for (const id of ids) {
      for (let k = 0; k < this.sizes[id]; k++) {
        if (!this.has(id, k) && !this.queue.some(([q, j]) => q === id && j === k)) this.queue.push([id, k]);
      }
    }
    if (idle && this.queue.length) this.pump(step);
  }

  private pump(step: (next: () => void) => void): void {
    step(() => {
      const next = this.queue.shift();
      if (next && !this.has(next[0], next[1])) this.slot(next[0], next[1]);
      if (this.queue.length) this.pump(step);
    });
  }
}
