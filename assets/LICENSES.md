# Паспорт картинок и звуков «Козыря»

Значок и заставка нарисованы кодом: `bun tools/art/icon.ts` (ADR устава 0023, правило 3; ADR 0010).
Генераторов изображений нет. Шрифт индекса — Onest 700, SIL Open Font License 1.1
(`@expo-google-fonts/onest`, текст лицензии — `assets/fonts/Onest-OFL.txt`).

| Файл | Размер | SHA-256 |
|---|---|---|
| `assets/icon.png` | 1024 × 1024 | `64e84fa0bd76aece4280f7d1411eff420ac35acdd982ef470b38414011e1b556` |
| `assets/adaptive-icon.png` | 1024 × 1024 | `65d0aa3b071332b0e1b19b47ba24bcc9e967f7dba823dcbda1aa81f092887fb5` |
| `assets/splash-icon.png` | 512 × 512 | `175ea612b347a0a6610e2b1f8e718190deee174e173d7e1b52eab3a36525db13` |

## Звуки

Звуки стола — записи **CC0 1.0** из набора Kenney «Casino Audio» 1.1
([OpenGameArt](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), автор — Kenney Vleugels,
kenney.nl; в архиве `License.txt`: «License (Creative Commons Zero, CC0)»). Файлы `assets/sounds/*.wav` собирает
`tools/sound/recorded.py`; откуда каждый, отрезок и SHA-256 архива и его файлов — `assets/sounds/SOURCES.md`.
Синтезированных звуков нет.

| Исходник | Лицензия | SHA-256 |
|---|---|---|
| `kenney_casino-audio.zip` (Casino Audio 1.1) | CC0 1.0 | `f36250766ac5bc378c13708ddf12a23a8e54a3251f8d482c7536e51b5dbafa18` |
