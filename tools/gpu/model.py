"""Сеть оценки позиции и её файл для TypeScript (docs/specs/2026-11-neural.md, «Сеть»).

Многослойный перцептрон, ReLU, выход — одно число до сигмоиды: шанс места не остаться с картами. Файл `.bin` читает
`netFromBin` (src/bot/net/model.ts): слова по 4 байта, little-endian — 'DKN1', версия признаков, число слоёв L,
размеры L + 1, затем на каждый слой W (вход × выход) и b. Рядом — паспорт `.json`.
"""
import hashlib
import json
import os

import numpy as np
import torch

from features import INPUTS, VERSION

MAGIC = 0x314E4B44


class Net(torch.nn.Module):
    def __init__(self, hidden=(256, 128)):
        super().__init__()
        sizes = [INPUTS, *hidden, 1]
        self.sizes = sizes
        self.layers = torch.nn.ModuleList(torch.nn.Linear(a, b) for a, b in zip(sizes[:-1], sizes[1:]))

    def forward(self, x):
        for i, layer in enumerate(self.layers):
            x = layer(x)
            if i + 1 < len(self.layers):
                x = torch.relu(x)
        return x.squeeze(-1)


def to_bin(model):
    sizes = model.sizes
    parts = [np.array([MAGIC, VERSION, len(sizes) - 1, *sizes], '<u4').tobytes()]
    for layer in model.layers:
        parts.append(layer.weight.detach().cpu().numpy().T.astype('<f4').tobytes())   # вход × выход
        parts.append(layer.bias.detach().cpu().numpy().astype('<f4').tobytes())
    return b''.join(parts)


def export_bin(model, prefix, passport=None):
    """Пишет `<prefix>.bin` и `<prefix>.json`; возвращает sha256 весов."""
    os.makedirs(os.path.dirname(os.path.abspath(prefix)), exist_ok=True)
    data = to_bin(model)
    sha = hashlib.sha256(data).hexdigest()
    with open(prefix + '.bin.tmp', 'wb') as f:
        f.write(data)
    os.replace(prefix + '.bin.tmp', prefix + '.bin')
    meta = dict(sizes=model.sizes, features=VERSION, sha256=sha, bytes=len(data), **(passport or {}))
    with open(prefix + '.json.tmp', 'w', encoding='utf8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    os.replace(prefix + '.json.tmp', prefix + '.json')
    return sha


def load_bin(path):
    """Сеть из `.bin` (для сверки и продолжения с присланных весов)."""
    data = np.fromfile(path, dtype='<u4')
    if int(data[0]) != MAGIC:
        raise ValueError(f'{path}: не файл весов DKN1')
    if int(data[1]) != VERSION:
        raise ValueError(f'{path}: признаки версии {int(data[1])}, а здесь {VERSION}')
    layers = int(data[2])
    sizes = [int(x) for x in data[3:4 + layers]]
    floats = data.view('<f4')
    model = Net(tuple(sizes[1:-1]))
    at = 4 + layers
    with torch.no_grad():
        for i, layer in enumerate(model.layers):
            a, b = sizes[i], sizes[i + 1]
            layer.weight.copy_(torch.from_numpy(floats[at:at + a * b].reshape(a, b).T.copy()))
            at += a * b
            layer.bias.copy_(torch.from_numpy(floats[at:at + b].copy()))
            at += b
    if at != floats.shape[0]:
        raise ValueError(f'{path}: размер файла не сходится с размерами слоёв')
    return model
