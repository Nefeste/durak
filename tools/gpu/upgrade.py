"""Перевести сеть со старой версии признаков на новую без изменения оценки (docs/specs/2026-11-neural.md, «Вход»).

    python tools/gpu/upgrade.py <старый.bin> <новый-префикс>

1 → 2: на каждое из четырёх мест добавлены два входа — «его очередь подкидывать» (#57) и «сдался» (#58). В первом слое
для них — нулевые строки весов, остальные строки переезжают на новые номера: оценка сети та же, а дальнейшее обучение
научит её новым входам.
"""
import json
import os
import sys

import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from features import CARDS, INPUTS, SCALARS, VERSION  # noqa: E402
from model import MAGIC, Net, export_bin  # noqa: E402

OLD_PER_SEAT = 15


def read_v1(path):
    data = np.fromfile(path, dtype='<u4')
    if int(data[0]) != MAGIC or int(data[1]) != 1:
        raise SystemExit(f'{path}: нужна сеть признаков версии 1')
    layers = int(data[2])
    sizes = [int(x) for x in data[3:4 + layers]]
    floats = data.view('<f4')
    at = 4 + layers
    ws, bs = [], []
    for i in range(layers):
        a, b = sizes[i], sizes[i + 1]
        ws.append(floats[at:at + a * b].reshape(a, b).copy())
        at += a * b
        bs.append(floats[at:at + b].copy())
        at += b
    return sizes, ws, bs


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    sizes, ws, bs = read_v1(sys.argv[1])
    old_in = CARDS + SCALARS + 4 * OLD_PER_SEAT
    if sizes[0] != old_in:
        sys.exit(f'вход {sizes[0]}, а у версии 1 — {old_in}')
    per_seat = (INPUTS - CARDS - SCALARS) // 4
    rows = list(range(CARDS + SCALARS)) + [CARDS + SCALARS + r * per_seat + k for r in range(4) for k in range(OLD_PER_SEAT)]
    w1 = np.zeros((INPUTS, sizes[1]), np.float32)
    w1[rows] = ws[0]
    model = Net(tuple(sizes[1:-1]))
    with torch.no_grad():
        for i, layer in enumerate(model.layers):
            layer.weight.copy_(torch.from_numpy((w1 if i == 0 else ws[i]).T.copy()))
            layer.bias.copy_(torch.from_numpy(bs[i]))
    old = os.path.splitext(sys.argv[1])[0] + '.json'
    passport = json.load(open(old, encoding='utf8')) if os.path.exists(old) else {}
    for k in ('sizes', 'features', 'sha256', 'bytes'):
        passport.pop(k, None)
    passport['upgraded'] = f'признаки 1 → {VERSION}: две нулевые строки на место (очередь, сдался), оценка та же'
    sha = export_bin(model, sys.argv[2], passport)
    print(f'{sys.argv[2]}.bin: признаки {VERSION}, {"×".join(map(str, model.sizes))}, sha256 {sha[:16]}…')
