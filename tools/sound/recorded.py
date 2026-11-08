"""из nardy: tools/sound/recorded.py @ 1d2bdff — звуки стола из записей CC0 (docs/09-game-design.md, «Звук»).

Свои отличия: один исходник — набор Kenney «Casino Audio» с OpenGameArt (Freesound и kenney.nl из
песочницы закрыты, страница OpenGameArt — CC0, архив тот же, что «Нарды» брали с kenney.nl, SHA-256
совпал); звуки — тасовка, шлепок карты, шорох «бито», мягкий «беру»; начало звука — первые 2 мс,
которые не тише 24 дБ самого громкого места (у записей Kenney перед ударом бывает тихий щелчок
пальцев — с него звук начался бы на 100 мс раньше карты); у тасовки затухание длиннее.

Скрипт скачивает архив в кэш, сверяет SHA-256, режет по отрезкам ниже, убирает гул ниже 90 Гц,
выравнивает громкость вариантов и звуков между собой на слух с телефона (`heard`: динамик без
частот ниже 450 Гц, полка уха, «Fast» 125 мс) и пишет assets/sounds/<звук>-<n>.wav и SOURCES.md.

    python3 -m venv /tmp/snd && /tmp/snd/bin/pip install -r tools/sound/requirements.txt
    /tmp/snd/bin/python -I tools/sound/recorded.py            # из корня репозитория
"""
import hashlib
import io
import os
import subprocess
import sys
import zipfile
from math import gcd

import numpy as np
import soundfile as sf
from scipy.signal import butter, lfilter, resample_poly, sosfilt

SR = 44100
PEAK = 0.708  # −3 дБ
OUT = 'assets/sounds'
CACHE = os.environ.get('DURAK_SOUND_CACHE', '/tmp/durak-sound-sources')

# ——— исходники: что, чьё, откуда, лицензия, отпечаток скачанного файла ———
SOURCES = {
    'kenney': dict(title='Casino Audio 1.1 (54 Casino Sound Effects)', author='Kenney (Kenney Vleugels, kenney.nl)',
                   page='https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips',
                   url='https://opengameart.org/sites/default/files/kenney_casino-audio.zip',
                   sha256='f36250766ac5bc378c13708ddf12a23a8e54a3251f8d482c7536e51b5dbafa18'),
}


def L(member, at, length, gain=1.0, delay=0.0, rate=1.0, src='kenney'):
    """Слой варианта: файл `member` архива с `at` с, удар — от начала, `length` с; `rate` > 1 — выше и короче."""
    return dict(src=src, at=at, length=length, gain=gain, delay=delay, rate=rate, member=f'Audio/{member}.ogg')


# ——— звуки: варианты из файлов архива ———
PLAN = {
    # тасовка при раздаче: в записи семь «пролистываний» колоды за 3 с; вариант — три подряд, 1,2 с —
    # столько же, сколько идёт раздача (`DEAL` в src/render/TableCanvas.tsx)
    'shuffle': [[L('card-shuffle', t, 1.2)] for t in (0.10, 1.30, 1.75)],
    # шлепок карты о стол: короткие удары без шороха перед ними
    'slap': [[L(m, t, 0.22)] for m, t in (('card-place-1', 0.10), ('card-slide-1', 0.10), ('card-slide-2', 0.0),
                                           ('card-slide-4', 0.05), ('card-slide-5', 0.07), ('card-slide-6', 0.12))],
    # «бито»: стопку сдвигают в сторону
    'swish': [[L(f'card-shove-{k}', t, 0.45)] for k, t in ((1, 0.06), (2, 0.15), (3, 0.06), (4, 0.15))],
    # «беру»: карты собирают со стола в руку — веер, тише остальных
    'take': [[L('card-fan-1', 0.40, 0.42)], [L('card-fan-1', 0.40, 0.42, rate=0.94)], [L('card-fan-2', 0.80, 0.42)]],
}
LENGTH = {'shuffle': 1.2, 'slap': 0.22, 'swish': 0.45, 'take': 0.42}
# затухание в конце, с: тасовка обрывается посреди пролистывания — уходит дольше
FADE = {'shuffle': 0.15, 'slap': 0.03, 'swish': 0.06, 'take': 0.08}
# на слух с телефона относительно тасовки, дБ: короткие звуки — как стук шашки «Нард» к кубикам,
# «беру» — мягче («вздох колоды», спецификация 1.0, §6)
HEARD = {'shuffle': 0.0, 'slap': -2.5, 'swish': -2.5, 'take': -5.0}
# опора — громкость тасовки на слух, дБ: как кубики «Нард» (−19,7), которые владелец слушал на
# телефоне; шлепок тогда — как их стук шашки (−22,2)
REF = -20.0
# динамик телефона: ниже ~450 Гц почти не играет
PHONE = butter(4, 450, 'hp', fs=SR, output='sos')


def fetch(key):
    s = SOURCES[key]
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, key + os.path.splitext(s['url'])[1])
    if not os.path.exists(path):
        subprocess.run(['curl', '-sSfL', '--max-time', '120', '-o', path, s['url']], check=True)
    digest = hashlib.sha256(open(path, 'rb').read()).hexdigest()
    if digest != s['sha256']:
        sys.exit(f'{key}: SHA-256 {digest} не совпал с {s["sha256"]} — исходник изменился, слушать заново')
    return path


def load(layer):
    data = zipfile.ZipFile(fetch(layer['src'])).read(layer['member'])
    x, sr = sf.read(io.BytesIO(data), always_2d=True)
    x = x.mean(axis=1)
    if sr != SR:
        g = gcd(sr, SR)
        x = resample_poly(x, SR // g, sr // g)
    return sosfilt(butter(2, 90, 'hp', fs=SR, output='sos'), x)


def onset(x):
    """Первые 2 мс, которые не тише 24 дБ самого громкого места отрезка."""
    n = int(0.002 * SR)
    fr = np.sqrt(np.mean(x[: len(x) // n * n].reshape(-1, n) ** 2, axis=1) + 1e-12)
    return int(np.argmax(20 * np.log10(fr / fr.max()) > -24)) * n


def layer_audio(layer, fade):
    x = load(layer)
    pre = 0.06
    a = max(0, int((layer['at'] - pre) * SR))
    seg = x[a: a + int((layer['length'] / layer['rate'] + pre + 0.3) * SR)]
    s = max(0, onset(seg) - int(0.003 * SR))
    y = seg[s: s + int(layer['length'] / layer['rate'] * SR) + 1]
    if layer['rate'] != 1.0:
        y = resample_poly(y, 1000, int(round(1000 * layer['rate'])))
    y = y[: int(layer['length'] * SR)].copy()
    f = int(fade * SR)
    y[-f:] *= np.linspace(1, 0, f) ** 2
    s = int(0.0015 * SR)
    y[:s] *= np.linspace(0, 1, s)
    return y * layer['gain']


def variant(layers, length, fade):
    out = np.zeros(int(length * SR))
    for lay in layers:
        y = layer_audio(lay, fade)
        a = int(lay['delay'] * SR)
        b = min(len(out), a + len(y))
        out[a:b] += y[: b - a]
    return out


def ear(y):
    """Чувствительность уха: полка +4 дБ выше 1,5 кГц (K-взвешивание BS.1770; срез низа делает `PHONE`)."""
    g, w, q = 10 ** (4.0 / 40), 2 * np.pi * 1500.0 / SR, 1 / np.sqrt(2)
    c, r = np.cos(w), 2 * np.sqrt(g) * np.sin(w) / (2 * q)
    b = [g * ((g + 1) + (g - 1) * c + r), -2 * g * ((g - 1) + (g + 1) * c), g * ((g + 1) + (g - 1) * c - r)]
    a = [(g + 1) - (g - 1) * c + r, 2 * ((g - 1) - (g + 1) * c), (g + 1) - (g - 1) * c - r]
    return lfilter(b, a, y)


def heard(y):
    """Громкость на слух с телефона, дБ: динамик (`PHONE`), ухо (`ear`) и «Fast» шумомера (125 мс)."""
    p = ear(sosfilt(PHONE, y))
    a = np.exp(-1 / (0.125 * SR))
    return 10 * np.log10(lfilter([1 - a], [1, -a], p ** 2).max() + 1e-20)


def soft_clip(y, drive):
    if not drive:
        return y
    x = y / np.abs(y).max()
    return np.tanh(drive * x) / np.tanh(drive)


def to_heard(y, target):
    """Вариант — к громкости `target` на слух; пик не выше −3 дБ, где не хватает — пики скругляются."""
    for drive in np.arange(0, 3.001, 0.05):
        z = soft_clip(y, drive) * PEAK / (1 if drive else np.abs(y).max())
        if heard(z) >= target - 0.05:
            break
    else:
        print(f'  не достаёт до цели на {target - heard(z):.1f} дБ')
    return z * min(1.0, 10 ** ((target - heard(z)) / 20)), round(float(drive), 2)


def ru(x, d=2):
    return f'{x:.{d}f}'.replace('.', ',')


def segment_text(lay):
    src = SOURCES[lay['src']]
    extra = []
    if lay['rate'] != 1.0:
        pct = round(abs(lay['rate'] - 1) * 100)
        extra.append(f'на {pct} % {"выше" if lay["rate"] > 1 else "ниже"}')
    if lay['gain'] != 1.0:
        extra.append(f'громкость {ru(lay["gain"])}')
    name = lay['member'].split('/')[-1]
    return (f'[{src["author"].split(" (")[0]} — {name}]({src["page"]}), с {ru(lay["at"])} с, {lay["length"] * 1000:.0f} мс'
            + (f' ({", ".join(extra)})' if extra else ''))


def main():
    os.makedirs(OUT, exist_ok=True)
    raw = {cue: [variant(v, LENGTH[cue], FADE[cue]) for v in vs] for cue, vs in PLAN.items()}
    ref = REF
    rows = []
    for cue, ys in raw.items():
        drives = []
        for k, (v, y) in enumerate(zip(PLAN[cue], ys), 1):
            z, d = to_heard(y, ref + HEARD[cue])
            drives.append(d)
            name = f'{cue}-{k}.wav'
            sf.write(os.path.join(OUT, name), np.clip(z, -1, 1), SR, subtype='PCM_16')
            rows.append((name, '; '.join(segment_text(lay) for lay in v)))
            print(f'{name}: {len(z) / SR:.2f} с, пик {20 * np.log10(np.abs(z).max()):.1f} дБ, на слух {heard(z):.1f} дБ')
        print(f'{cue}: скругление пиков {", ".join(ru(d) for d in drives)}')
    with open(os.path.join(OUT, 'SOURCES.md'), 'w', encoding='utf-8') as f:
        f.write('# Откуда звуки\n\n')
        f.write('Собрано `tools/sound/recorded.py` (не править руками): записи со свободной лицензией\n')
        f.write('**CC0 1.0** (общественное достояние — можно в платном приложении, указывать автора не обязательно;\n')
        f.write('указываем, откуда взято). Обработка у всех: моно 44,1 кГц, срез ниже 90 Гц, начало — с удара,\n')
        f.write('затухание в конце, пик не выше −3 дБ. Громкость выровнена на слух с телефона (без частот ниже\n')
        f.write('450 Гц, полка уха +4 дБ выше 1,5 кГц, «Fast» 125 мс): шлепок и «бито» — на 2,5 дБ тише тасовки,\n')
        f.write('«беру» — на 5 дБ; тасовка — как кубики «Нард» на слух; где не хватало пика −3 дБ, пики\n')
        f.write('слегка скруглены (tanh).\n\n')
        f.write('## Файлы\n\n| Файл | Откуда |\n|---|---|\n')
        for name, text in rows:
            f.write(f'| `{name}` | {text} |\n')
        f.write('\n## Исходники\n\n| Запись | Автор | Лицензия | SHA-256 скачанного файла |\n|---|---|---|---|\n')
        for s in SOURCES.values():
            f.write(f'| [{s["title"]}]({s["page"]}) | {s["author"]} | CC0 1.0 | `{s["sha256"]}` |\n')
        f.write('\n### Файлы архива, из которых взято\n\n| Файл архива | SHA-256 |\n|---|---|\n')
        members = sorted({(lay['src'], lay['member']) for vs in PLAN.values() for v in vs for lay in v})
        for src, member in members:
            digest = hashlib.sha256(zipfile.ZipFile(fetch(src)).read(member)).hexdigest()
            f.write(f'| `{member}` | `{digest}` |\n')
        f.write('\nАрхив: ' + ', '.join(f'<{s["url"]}>' for s in SOURCES.values()) + '; лицензия в нём — `License.txt`\n')
        f.write('(«License (Creative Commons Zero, CC0)»), на странице OpenGameArt — «License(s): CC0».\n')
    print('SOURCES.md:', len(rows), 'файлов')


if __name__ == '__main__':
    main()
