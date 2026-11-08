# Данные

## Движок

### Карта

Число `0…35`: `карта = масть × 9 + достоинство`. Масти: 0 ♠, 1 ♣, 2 ♦, 3 ♥. Достоинство: 0 — шестёрка … 8 — туз.
Запись для людей — `6♠`, `10♥`, `В♣`, `Д♦`, `К♥`, `Т♠` (русские индексы, ADR [0010](adr/0010-cards-in-code.md)).
Порядок мастей нужен только для «младшей карты» при выборе первого хода ([`08-rules.md`](08-rules.md), п. 3).

### Позиция

Код — `src/engine/types.ts`; здесь коротко.

```ts
type State = {
  rules: RuleSet;             // свод: id 'durak-rules-v1', пределы атаки, firstBoutTransfer
  variant: 'podkidnoy' | 'perevodnoy'; seats: number;   // 2..4
  hands: number[][];          // руки по местам
  talon: number[];            // прикуп сверху вниз; последний — козырь
  trump: number;              // козырная карта (масть = козырь)
  table: [number, number | null][]; // пары «атака — защита»
  discard: number[];          // сброс
  openly: number[][];         // по местам: карты, взятые в открытую и ещё не сыгранные
  starter: number;            // кто начал отбой — для добора после перевода
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
  | { type: 'attack' | 'transfer'; cards: number[] }   // одна или несколько одного достоинства
  | { type: 'throwIn' | 'give'; cards: [number] }       // подкинуть и вдогонку — по одной
  | { type: 'beat'; card: number; on: number }
  | { type: 'take' | 'pass' };
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

Сделано к этапу Е — ключи `src/state/storage.ts`: `durak.current` (идущая партия с ботами), `durak.settings`,
`durak.crashlog`, `durak.device`, `durak.adult`, `durak.ads` (счётчики рекламы, `src/money/ads.ts`), `durak.purchases`
(кэш прав «Без рекламы» и «Про»), `durak.unlocked` (разборы, открытые рекламой), `durak.rate` (когда просили оценку).
Настройки — `personalAds` с этапа Е.

## Сервер

SQLite (WAL), как в «Нардах»; миграции — `server/src/schema.ts` (номер — `PRAGMA user_version`, новые — только в
конец). Сделано в этапе Г:

| Таблица | Что |
|---|---|
| `players` | профиль: хеш ключа устройства, ник, тег, когда создан и когда был на связи |
| `ratings` | Glicko-2 по вариантам (`player`, `variant`, рейтинг, отклонение, волатильность, число партий) |
| `tables` | стол: код, вид (`friend`/`quick`), создатель, вариант, мест, уровень ботов на свободные места, состояние, номер текущей партии, `version` |
| `table_seats` | место: игрок или бот (уровень) |
| `games` | партия: зерно сервера и его отпечаток, зёрна мест, первый ход, действия (JSON по порядку), запас часов мест, кто нажал «Реванш», итог, начало и конец |
| `reports` | отчёты «Сообщить об ошибке», 180 дней |

Позиция партии в базе не хранится: её даёт переигрывание действий от колоды (`restore` при запуске, ADR 0002). В
памяти — позиция, таймеры, кто в сети и кто играет за кого. Сроки хранения: стол, где никто не сел, — сутки;
законченные столы — 30 дней.
