# Паспорт картинок и звуков «Козыря»

Значок и заставка нарисованы кодом самой игры — туз червей и рубашка «Бордо» (`makeFaces`, `makeBack`) на
странице веб-сборки `?icon=1`: `EXPO_OFFLINE=1 npm run export:web && bun tools/art/icon.ts` (ADR устава 0023,
правило 3; ADR 0010). Генераторов изображений нет. Шрифт индекса — Onest 700, SIL Open Font License 1.1
(`@expo-google-fonts/onest`, текст лицензии — `assets/fonts/Onest-OFL.txt`).

| Файл | Размер | SHA-256 |
|---|---|---|
| `assets/icon.png` | 1024 × 1024 | `5ecc95f84e5ba899e55ce65e45297dc8b8daa4f2e420336afaa113c30f119ab6` |
| `assets/adaptive-icon.png` | 1024 × 1024 | `287817f6cf821c066948ff4e797884de3785b727572bbb77151374c4526a46fd` |
| `assets/splash-icon.png` | 512 × 512 | `ad87e2e4020286cfa8b16c9d3a2eebc2b7b3107aee93fe5d7cef6d2f8ef964f6` |

## Звуки

Звуки стола — записи **CC0 1.0** из набора Kenney «Casino Audio» 1.1
([OpenGameArt](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), автор — Kenney Vleugels,
kenney.nl; в архиве `License.txt`: «License (Creative Commons Zero, CC0)»). Файлы `assets/sounds/*.wav` собирает
`tools/sound/recorded.py`; откуда каждый, отрезок и SHA-256 архива и его файлов — `assets/sounds/SOURCES.md`.
Синтезированных звуков нет.

| Исходник | Лицензия | SHA-256 |
|---|---|---|
| `kenney_casino-audio.zip` (Casino Audio 1.1) | CC0 1.0 | `f36250766ac5bc378c13708ddf12a23a8e54a3251f8d482c7536e51b5dbafa18` |
