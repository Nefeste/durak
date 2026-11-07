# Данные

## Движок

### Карта

Число `0…35`: `карта = масть × 9 + достоинство`. Масти: 0 ♠, 1 ♣, 2 ♦, 3 ♥. Достоинство: 0 — шестёрка … 8 — туз.
Запись для людей — `6♠`, `10♥`, `В♣`, `Д♦`, `К♥`, `Т♠` (русские индексы, ADR [0010](adr/0010-cards-in-code.md)).
Порядок мастей нужен только для «младшей карты» при выборе первого хода ([`08-rules.md`](08-rules.md), п. 3).

### Позиция

```ts
type State = {
  rules: 'durak-rules-v1'; variant: 'podkidnoy' | 'perevodnoy'; seats: number;   // 2..4
  hands: number[][];          // руки по местам
  talon: number[];            // прикуп сверху вниз; последний — козырь
  trump: number;              // козырная карта (масть = козырь)
  table: [number, number | null][]; // пары «атака — защита»
  discard: number[];          // сброс
  openly: number[][];         // по местам: карты, взятые в открытую и ещё не сыгранные
  attacker: number; defender: number; passed: boolean[];
  boutLimit: number;          // предел карт атаки этого отбоя
  bout: number;               // номер отбоя с нуля
  out: number[];              // порядок выхода
  phase: 'bout' | 'giving' | 'end';
  result: null | { fool: number | null; draw: boolean };
};
```

### Действие

```ts
type Action =
  | { type: 'attack' | 'throwIn' | 'transfer' | 'give'; cards: number[] }
  | { type: 'beat'; card: number; on: number }
  | { type: 'take' | 'pass' | 'done' };
```

### Запись партии

```ts
type GameRecord = {
  v: 1;                       // номер формата записи
  rules: 'durak-rules-v1';
  variant: 'podkidnoy' | 'perevodnoy';
  seats: { kind: 'you' | 'bot' | 'human'; level?: Level; name?: string }[];
  first: number;              // кто ходит первым
  firstWhy: 'lowestTrump' | 'lowestCard' | 'afterFool';
  deck: number[];             // 36 чисел — порядок колоды
  source: { kind: 'phone' } | { kind: 'server'; commit: string; seed: string; seeds: string[] };
  actions: { seat: number; action: Action; at: number }[]; // at — мс от начала партии, для разбора и темпа
  result: null | { fool: number | null; draw: boolean; order: number[] };
};
```

Восстановление — переигрывание `actions` по `deck`. Запись с ботами хранит колоду с самого начала — это и есть
правда партии; ботам её не передают (ADR [0005](adr/0005-bot-observation.md)).

## Телефон

AsyncStorage, ключи `durak.*`, как в «Нардах»: идущая партия (`durak.game`), история последних 200 партий
(`durak.history`), настройки (`durak.settings`), профиль онлайна (`durak.device`, `durak.name`), права покупок
(`durak.rights`), задачи дня (`durak.daily`), счётчики своей статистики (`durak.stats`). Резервная копия Android —
как в «Нардах» (ADR 0024 «Нард»): профиль онлайна возвращается только на тот же телефон.

## Сервер

SQLite (WAL), как в «Нардах»: `devices`, `profiles`, `tables`, `seats` (место, профиль или бот), `games`
(колода, зёрна, отпечаток, итог), `actions` (номер, место, действие, время), `ratings` (по вариантам), `stats`.
Сроки хранения — как в «Нардах»: законченные столы — 30 дней, профили без активности — по уставу.
