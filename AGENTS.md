This is an Expo/React Native mobile card game («Дурак» — podkidnoy and perevodnoy durak) for RuStore.
Prioritize mobile-first patterns, a smooth card table on modern Android phones, correctness of the rules, an
honest deck and a bot that never sees hidden cards.

## Studio charter — read first

This project belongs to the «Горница» studio. Studio-wide rules live only in the public
charter repository `Nefeste/gornitsa` (https://github.com/Nefeste/gornitsa); this repository
keeps only what is specific to the project. Before changing anything — and after a context
reset — read the charter's `AGENTS.md`, then `docs/05-rules.md` (hard rules for every game)
and `docs/04-process.md` (how work is done). Raw files:
`https://raw.githubusercontent.com/Nefeste/gornitsa/main/<path>`.

Current state of this project: `STATUS.md` (it is not repeated here).

Precedence: the owner's recorded decision → the charter → this project's documents. A project
rule may narrow a charter rule, never weaken it. If a document here restates or contradicts
the charter, replace it with a link or report the contradiction to the owner.

## Read `docs/` before changing anything

The project documents itself in [`docs/`](docs/README.md), in Russian, and that is the source of
truth for *why* things are the way they are. Start there, in this order, especially after a context
reset:

- `docs/README.md` — index and the rules these documents follow.
- `docs/01-product.md` — what we promise the player, what is deliberately absent, the vocabulary.
- `docs/08-rules.md` — **the only place** where the rules of durak are written down.
- `docs/09-game-design.md` — modes, screens, controls, ads and purchases; all game-design numbers.
- `docs/02-architecture.md`, `docs/03-server-api.md`, `docs/04-data-model.md` — how it is built.
- `docs/10-bot.md` — bots, the endgame solver, the review and the daily puzzle.
- `docs/05-process.md`, `docs/06-testing.md` — versions, CI, release, what to run.
- `docs/07-roadmap.md` — what is being built now; it links the live specification.
- `docs/11-money.md`, `docs/12-market.md` — money, law, market.
- `docs/adr/` — decisions that are expensive to reverse. Read the relevant one *before* proposing
  the opposite; each records what it costs.
- `docs/specs/` — specification-driven development: a notable feature gets a spec **before** code.

Working rule, spec-first lifecycle, ADRs and version sections are the same in every studio
project — charter `docs/04-process.md`.

## Sister project

This project copies most of its infrastructure from `Nefeste/nardy` (studio ADR 0002, project ADR 0001):
the server (Bun + SQLite on the studio machine in Russia), the network layer, friend tables by link, quick
match and Glicko-2 rating, verifiable randomness (here — the deck order), `think.ts` slicing, the review
«почему», the money module, the dialog, i18n mechanics, crash log, release signing plugin, Android CI and
RuStore upload. Every copied file carries `// из nardy: <path> @ <commit>` on its first line. RuStore Pay
and CI workflows come from the studio kit `@gornitsa/kit` / `Nefeste/gornitsa-kit` (studio ADR 0022).

## Expo and native SDKs

Expo SDK 57, as nardy (see `package.json`). Never write Expo, React Native, Skia, Reanimated, RuStore Pay,
RuStore Review or Yandex Mobile Ads code from memory — follow «Expo has changed» in the charter's `AGENTS.md`.
`docs.expo.dev` may be unreachable from the sandbox — then nardy's working config (same SDK 57) is the reference.

## Commands

Stage А is in the code (engine, rule bots, a table vs bots); the rest follows nardy.

```bash
npm ci
npx expo install <package>          # ALWAYS instead of npm/yarn/bun add — SDK-compatible versions
npm run typecheck                   # app + tools (tsc --noEmit, -p tools)
npm run lint                        # zero warnings
bun test tools/test                 # rules (golden), random games, observation, deck, purity, texts, bots
DURAK_LONG=1 bun test tools/test/games.test.ts   # 100 000 random games (~4 min)
bun tools/sim/arena.ts 1000 average amateur podkidnoy   # bot strength on mirrored deals
bun tools/test/make-deck-fixture.ts > tools/test/fixtures/deck-v1.json   # deck vectors (only on a new deck version)
EXPO_OFFLINE=1 npm run export:web
NODE_PATH=/opt/node22/lib/node_modules bun tools/e2e/browser.ts   # the table in a browser, real taps
```

## Hard rules

Studio-wide rules — no React Native `Alert`, player-facing strings only in `src/i18n/`, generated
`ios/`/`android/`, a permanent application id and signing key, a pure engine, no stakes or currency,
bots never pose as humans, ads only between games, no free chat — are in the charter's `docs/05-rules.md`.
This project's own rules:

- **Rules live in one place**: `src/engine/` implements `docs/08-rules.md` exactly and stays pure. The deck
  order is an argument, never shuffled inside the engine. Table rules (variant, players, options) are part of
  the game record (ADR 0003). Golden tests pin the behaviour.
- **The bot sees only its observation** (ADR 0005): `src/bot/` gets `observe(state, seat)` — its own hand,
  the trump, the talon size, the table, the discard pile, cards opponents picked up in the open, hand sizes —
  and nothing else. It never imports the deck. A test runs every bot on pairs of states with the same
  observation and different hidden cards and requires the same move.
- **The deck is verifiable** (ADR 0004): online the server commits to its seed before the deal and reveals it
  after the game; offline the phone shuffles with `expo-crypto` at the moment of the deal.
- **The server sends each seat only what that seat may see** (ADR 0008): no response or event ever carries
  another player's hand or the talon order before the reveal; a test checks every route.
- **No bot, hints, card counting or review during an online game** — for anyone, paid or not (ADR 0006).
- **Portrait only** (ADR 0007).
- **Own look, not the studio brand book** (ADR 0012, owner's decision): dark table with glass, colours only in
  `src/ui/theme.ts`. Unique card backs «including 18+» are a post-1.0 owner decision (the age rating changes).
- **Cards are drawn by code** (ADR 0010): own deck with Russian indices (В, Д, К, Т), no copied deck art.
- `applicationId` is `games.gornitsa.durak` — eternal (charter ADR 0006); confirmed by the owner (#1). In the game the app is «Козырь».
