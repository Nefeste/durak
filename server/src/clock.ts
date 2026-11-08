// из nardy: server/src/clock.ts @ 1d2bdff
// Часы сервера: время и таймеры. В тестах — поддельные, со сдвигом времени вручную.

export interface Clock {
  now(): number;
  /** Вызвать `fn` в момент `when` (мс); вернуть отмену. */
  at(when: number, fn: () => void): () => void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  at(when, fn) {
    const t = setTimeout(fn, Math.max(0, when - Date.now()));
    return () => clearTimeout(t);
  },
};

/** Поддельные часы: время идёт только в `advance`, таймеры срабатывают по порядку. */
export class FakeClock implements Clock {
  private timers: { when: number; fn: () => void; id: number }[] = [];
  private ids = 0;
  constructor(private t = 1_790_000_000_000) {}

  now() { return this.t; }

  at(when: number, fn: () => void) {
    const id = ++this.ids;
    this.timers.push({ when, fn, id });
    return () => { this.timers = this.timers.filter(x => x.id !== id); };
  }

  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      const due = this.timers.filter(x => x.when <= end).sort((a, b) => a.when - b.when || a.id - b.id)[0];
      if (!due) break;
      this.timers = this.timers.filter(x => x.id !== due.id);
      this.t = Math.max(this.t, due.when);
      due.fn();
    }
    this.t = end;
  }

  get pending() { return this.timers.length; }
}
