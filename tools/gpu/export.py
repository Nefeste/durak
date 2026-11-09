"""Веса из снимка обучения в файл для TypeScript (`.bin` + паспорт `.json`, src/bot/net/model.ts).

    python tools/gpu/export.py tools/gpu/runs/main/last.pt tools/gpu/nets/<дата>/last

train.py сам пишет best.bin и last.bin; этот скрипт — чтобы достать веса из любого `.pt` (best.pt, last.pt).
"""
import os
import sys

import torch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from features import VERSION  # noqa: E402
from model import Net, export_bin  # noqa: E402

if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    ck = torch.load(sys.argv[1], map_location='cpu', weights_only=False)
    if ck.get('features') != VERSION:
        sys.exit(f'снимок с признаками версии {ck.get("features")}, а здесь {VERSION}')
    model = Net(tuple(ck['hidden']))
    model.load_state_dict(ck['model'])
    st = ck['state']
    sha = export_bin(model, sys.argv[2], dict(games=st['games'], samples=st['samples'], hours=round(st['seconds'] / 3600, 2),
                                             rounds=st['rounds'], arena=st['arenas'][-1] if st['arenas'] else None, source=os.path.basename(sys.argv[1])))
    print(f'{sys.argv[2]}.bin: {"×".join(map(str, model.sizes))}, sha256 {sha[:16]}…')
