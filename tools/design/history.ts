// История партий для снимков и проверки «Статистики» (docs/09-game-design.md, «Статистика»): настоящие партии
// ботов движком — на месте 0 «вы» (бот своего уровня), столы на 2–4 места, подкидной и переводной, один уровень и
// разные; партии разложены по четырём неделям до `now`, у части — подсказка и настоящий разбор (малым числом
// раскладов, чтобы быстро). Детерминированно по `seed`.
//
//   bun tools/design/history.ts [партий] [now, мс] > history.json
import { dealOf, firstOf, observe, RULES_V1 } from '../../src/engine';
import type { GameRecord, Variant } from '../../src/engine';
import { chooseAction, LEVELS, makeRng, reviewThink, RULE_LEVELS, thinkSync } from '../../src/bot';
import type { Level } from '../../src/bot';
import { movesOf } from '../../src/game/review';
import type { FinishedGame } from '../../src/state/history';
import { playGame, shuffled } from '../sim/play';

const DAY = 24 * 3600_000;

export function fakeHistory(count: number, now: number, seed = 7, reviews = 6): FinishedGame[] {
  const rng = makeRng(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[rng.int(xs.length)];
  const out: FinishedGame[] = [];
  for (let i = 0; i < count; i++) {
    const seats = i % 5 === 0 ? 3 : i % 7 === 0 ? 4 : 2;
    const variant: Variant = i % 3 === 0 ? 'perevodnoy' : 'podkidnoy';
    // ваш «уровень» растёт: первые партии — «Новичок», последние — «Средний»
    const me: Level = RULE_LEVELS[Math.min(RULE_LEVELS.length - 1, Math.floor((i / count) * RULE_LEVELS.length))];
    const one = pick(LEVELS.slice(0, 4));
    const levels: Level[] = Array.from({ length: seats - 1 }, () => (seats > 2 && i % 2 ? pick(LEVELS.slice(0, 4)) : one));
    const deck = shuffled(rng);
    const { hands, trump } = dealOf(deck, seats);
    const f = firstOf(hands, trump);
    // поисковые уровни медленные — за них в снимках играют правила «Среднего»: запись та же, уровень в истории свой
    const lv = (seat: number): Level => (seat === 0 ? me : RULE_LEVELS.includes(levels[seat - 1]) ? levels[seat - 1] : 'average');
    const p = playGame(deck, seats, f.seat, variant, (s, seat) => chooseAction(observe(s, seat), lv(seat), rng));
    const end = now - (count - 1 - i) * ((27 * DAY) / count) - 3600_000;
    const record: GameRecord = {
      v: 1, rules: RULES_V1, variant, seats, first: f.seat, firstWhy: f.why, deck,
      actions: p.actions.map((x, k) => ({ ...x, at: end - 300_000 + k * 1000 })), result: p.final.result,
    };
    const review = i >= count - reviews ? thinkSync(reviewThink(movesOf(record, 0), 0, 16, 2000)) : null;
    out.push({ record, levels, at: end - 300_000, end, hinted: i % 9 === 4, review });
  }
  return out;
}

if (import.meta.main) {
  const n = Number(process.argv[2] ?? 60);
  const now = Number(process.argv[3] ?? Date.now());
  console.log(JSON.stringify(fakeHistory(n, now)));
}
