# Откуда звуки

Собрано `tools/sound/recorded.py` (не править руками): записи со свободной лицензией
**CC0 1.0** (общественное достояние — можно в платном приложении, указывать автора не обязательно;
указываем, откуда взято). Обработка у всех: моно 44,1 кГц, срез ниже 90 Гц, начало — с удара,
затухание в конце, пик не выше −3 дБ. Громкость выровнена на слух с телефона (без частот ниже
450 Гц, полка уха +4 дБ выше 1,5 кГц, «Fast» 125 мс): шлепок и «бито» — на 2,5 дБ тише тасовки,
«беру» — на 5 дБ; тасовка — как кубики «Нард» на слух; где не хватало пика −3 дБ, пики
слегка скруглены (tanh).

## Файлы

| Файл | Откуда |
|---|---|
| `shuffle-1.wav` | [Kenney — card-shuffle.ogg](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), с 0,10 с, 1200 мс |
| `shuffle-2.wav` | [Kenney — card-shuffle.ogg](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), с 1,30 с, 1200 мс |
| `shuffle-3.wav` | [Kenney — card-shuffle.ogg](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), с 1,75 с, 1200 мс |
| `slap-1.wav` | [Kenney — card-place-1.ogg](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), с 0,10 с, 220 мс |
| `slap-2.wav` | [Kenney — card-slide-1.ogg](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), с 0,10 с, 220 мс |
| `slap-3.wav` | [Kenney — card-slide-2.ogg](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), с 0,00 с, 220 мс |
| `slap-4.wav` | [Kenney — card-slide-4.ogg](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), с 0,05 с, 220 мс |
| `slap-5.wav` | [Kenney — card-slide-5.ogg](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), с 0,07 с, 220 мс |
| `slap-6.wav` | [Kenney — card-slide-6.ogg](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), с 0,12 с, 220 мс |
| `swish-1.wav` | [Kenney — card-shove-1.ogg](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), с 0,06 с, 450 мс |
| `swish-2.wav` | [Kenney — card-shove-2.ogg](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), с 0,15 с, 450 мс |
| `swish-3.wav` | [Kenney — card-shove-3.ogg](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), с 0,06 с, 450 мс |
| `swish-4.wav` | [Kenney — card-shove-4.ogg](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), с 0,15 с, 450 мс |
| `take-1.wav` | [Kenney — card-fan-1.ogg](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), с 0,40 с, 420 мс |
| `take-2.wav` | [Kenney — card-fan-1.ogg](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), с 0,40 с, 420 мс (на 6 % ниже) |
| `take-3.wav` | [Kenney — card-fan-2.ogg](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), с 0,80 с, 420 мс |

## Исходники

| Запись | Автор | Лицензия | SHA-256 скачанного файла |
|---|---|---|---|
| [Casino Audio 1.1 (54 Casino Sound Effects)](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips) | Kenney (Kenney Vleugels, kenney.nl) | CC0 1.0 | `f36250766ac5bc378c13708ddf12a23a8e54a3251f8d482c7536e51b5dbafa18` |

### Файлы архива, из которых взято

| Файл архива | SHA-256 |
|---|---|
| `Audio/card-fan-1.ogg` | `7a9758ccad8899baef1b9f60b4064e4baa724a548293832fdaea07e6e07e638d` |
| `Audio/card-fan-2.ogg` | `5743373c9dde00c6eee949a2c8e65d75946522768999167e1f5632451630e848` |
| `Audio/card-place-1.ogg` | `d8f26c33a665dcbdcc6f632f6050bc9dd548feb0d4942d4547615926d3926810` |
| `Audio/card-shove-1.ogg` | `1ea667aa6795d5f14239192116ebcbd8f3f47eb1c7faaf2ec56844b9067b8b06` |
| `Audio/card-shove-2.ogg` | `8e95c1d3ae94b5b91bc663432ad7c3bf4e03a541c22ec10fa51c65fe0e29054b` |
| `Audio/card-shove-3.ogg` | `399520d483a1466fcaa850b9c407b4edbd5c7f0cbdf17e84dea12e9636326d0d` |
| `Audio/card-shove-4.ogg` | `0a1ad3a2f16bd2ed73349e6342426ca7a59a6e26b7e26e36d51d51c2c2349d6f` |
| `Audio/card-shuffle.ogg` | `96c84883a30845ede723a4cf2e8369e9837e7dd4e0d4eb0212b0a7ed21b0f544` |
| `Audio/card-slide-1.ogg` | `006cf9822d15d7063f8899e56041f41646df30adb6fbd8b974ee5d5420012690` |
| `Audio/card-slide-2.ogg` | `e674a1679ec87b507047fe012d068ad2c412125f56186f0e732684705c2a6888` |
| `Audio/card-slide-4.ogg` | `b9c82bcdbe6b7d00a06e2546bd2683a9ab082ca5fd090a42882f33eddd925b7f` |
| `Audio/card-slide-5.ogg` | `8638ab0c17f029aded0e27a4f9b9bb9f8c621b19a6e9975e855cb40ea63e2201` |
| `Audio/card-slide-6.ogg` | `be85da181ac879c20cb667d0f9f156dbdc236d3751737ad27359a15e946430a0` |

Архив: <https://opengameart.org/sites/default/files/kenney_casino-audio.zip>; лицензия в нём — `License.txt`
(«License (Creative Commons Zero, CC0)»), на странице OpenGameArt — «License(s): CC0».
