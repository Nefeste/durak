"""Сложить итог обучения в папку для git (tools/gpu/README.md, шаг 7).

    python tools/gpu/collect.py                               # самый свежий прогон из tools/gpu/runs/
    python tools/gpu/collect.py --run tools/gpu/runs/<папка>

Кладёт в tools/gpu/nets/<дата>-<папка>/: best.bin/json (лучший на арене), last.bin/json (последний), last.pt (снимок для
продолжения обучения — с ним можно учить дальше на другой машине), log.txt и progress.jsonl. Обычно около 3 МБ. Обучению
не мешает: снимок пишется после каждого круга целиком (через временный файл), здесь только читается. Снимок, который уже
лежит в nets/, второй раз не собирается.
"""
import argparse
import glob
import hashlib
import json
import os
import shutil
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
RUNS = os.path.join(HERE, 'runs')
NETS = os.path.join(HERE, 'nets')


def sha(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run', default=None)
    args = ap.parse_args()
    runs = [os.path.dirname(p) for p in glob.glob(os.path.join(RUNS, '*', 'last.pt'))]
    if args.run:
        runs = [os.path.abspath(args.run)]
    if not runs:
        sys.exit('нет прогонов в tools/gpu/runs/ (train.py пишет туда last.pt после каждого круга)')
    import torch
    for r in sorted(runs, key=lambda p: os.path.getmtime(os.path.join(p, 'last.pt'))):
        ck = torch.load(os.path.join(r, 'last.pt'), map_location='cpu', weights_only=False)
        st = ck['state']
        a = st['arenas'][-1] if st['arenas'] else {}
        best = a.get('master', {}).get('share')
        print(f'  {os.path.relpath(r, REPO)}: сеть {"×".join(map(str, [ck["inputs"], *ck["hidden"]]))}, {st["games"]:,} партий, {st["seconds"] / 3600:.1f} ч, '
              f'снимок {time.strftime("%Y-%m-%d %H:%M", time.localtime(os.path.getmtime(os.path.join(r, "last.pt"))))}'
              + (f', последняя арена против «Опытного» {best:.3f}' if best is not None else ''))
    run = max(runs, key=lambda p: os.path.getmtime(os.path.join(p, 'last.pt')))
    # last.bin — из last.pt сейчас, чтобы собрать и идущее обучение
    from export import Net, VERSION, export_bin  # noqa: F401
    ck = torch.load(os.path.join(run, 'last.pt'), map_location='cpu', weights_only=False)
    model = Net(tuple(ck['hidden']))
    model.load_state_dict(ck['model'])
    st = ck['state']
    tmp = os.path.join(run, 'collect-last')
    digest = export_bin(model, tmp, dict(games=st['games'], samples=st['samples'], hours=round(st['seconds'] / 3600, 2), rounds=st['rounds'],
                                        arena=st['arenas'][-1] if st['arenas'] else None, run=os.path.basename(run)))
    for j in glob.glob(os.path.join(NETS, '*', 'last.json')):
        with open(j, encoding='utf8') as f:
            if json.load(f).get('sha256') == digest:
                sys.exit(f'этот снимок уже собран: {os.path.relpath(os.path.dirname(j), REPO)} — обучение с тех пор не продвинулось')
    dest = os.path.join(NETS, time.strftime('%Y-%m-%d') + '-' + os.path.basename(os.path.normpath(run)))
    os.makedirs(dest, exist_ok=True)
    shutil.move(tmp + '.bin', os.path.join(dest, 'last.bin'))
    shutil.move(tmp + '.json', os.path.join(dest, 'last.json'))
    for name in ('best.bin', 'best.json', 'last.pt', 'log.txt', 'progress.jsonl'):
        src = os.path.join(run, name)
        if os.path.exists(src):
            shutil.copyfile(src, os.path.join(dest, name))
    size = sum(os.path.getsize(p) for p in glob.glob(os.path.join(dest, '*')))
    print(f'взят {os.path.relpath(run, REPO)} → {os.path.relpath(dest, REPO)} ({size / 1e6:.1f} МБ); дальше — git add, commit, push (README, шаг 7)')


if __name__ == '__main__':
    main()
