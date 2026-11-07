# Как ведётся работа

Общий порядок — устав, [`docs/04-process.md`](https://github.com/Nefeste/gornitsa/blob/main/docs/04-process.md):
спецификация до кода, ADR для дорогих решений, разделы версий, кто что сливает (ADR 0018 устава), CI на PR и APK
только на тег (ADR 0019 устава). Здесь — как это устроено в «Дураке»; устройство — как в «Нардах»
([`docs/05-process.md`](https://github.com/Nefeste/nardy/blob/main/docs/05-process.md)).

## Версии

- Всегда полный номер X.Y.Z. До магазина — 0.Y.Z; **1.0.0** — первый выход в RuStore.
- Номер — в `app.json` (`expo.version`, `android.versionCode`), `package.json`, `package-lock.json`, `STATUS.md`;
  тест сверяет все четыре.
- У каждой версии — раздел `### X.Y.Z — …` в «Версиях» `README.md`: что изменилось для игрока.

## Ветки и CI

- Работа — в ветках `claude/…` и PR в `main`. PR без путей владельца сливается сам по метке «ревью: ок» после
  зелёного `pr.yml`; пути владельца — `.github/CODEOWNERS` (`app.json`, `.github/`, `server/`, `src/money/`,
  `plugins/`) — сливает владелец.
- `pr.yml` — типы (приложение, `tools`, `server`), линтер, `bun test tools/test`; из `gornitsa-kit@v1`.
- `android.yml` — APK и AAB только на тег `vX.Y.Z`; ключ, подпись, состав APK и белый список разрешений —
  действия `gornitsa-kit`. Тег ставит владелец.
- `server.yml` — тесты сервера под Bun и сборка в ветку `vps`, которую забирает машина (как в «Нардах»).
- `rustore.yml` — загрузка в RuStore, только руками.

## Сервер

Как в «Нардах»: машина сайта gornitsa.games, поддомен `durak.gornitsa.games`, установка — `Nefeste/gornitsagames`,
`deploy/durak/` (по образцу `deploy/nardy/`, PR туда сливает владелец). Копия базы раз в сутки; копия вне машины и
проверка восстановления — как у остальных серверов студии.

## Выпуск — чек-лист

1. Все проверки [`06-testing.md`](06-testing.md) зелёные; замер кадра и бота на целевом телефоне — в журнале
   спецификации.
2. Раздел версии в `README.md`, `STATUS.md`.
3. Тег — владелец; CI собирает APK.
4. Загрузка в RuStore и отправка на модерацию — владелец (или `rustore.yml` с его ключом).
5. После выхода — страница игры на сайте (`store/site/`, `status: live`).
