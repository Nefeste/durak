# по образцу nardy: tools/gpu/selftest.py @ 1d2bdff (studio ADR 0002): то же устройство, свои правила и сеть
"""Проверка набора перед обучением (tools/gpu/README.md, шаг 3) — около 5 минут.

    python tools/gpu/selftest.py [--quick]

1. Признаки: features.py против эталона TypeScript (vectors/features.jsonl.gz) — бит в бит; сеть: torch против
   оценки TypeScript на тех же весах (vectors/tiny.bin).
2. То же на свежих партиях этой машины: Bun играет партии на 2–4 места, Python пересчитывает признаки и оценку.
3. Видеокарта: видна ли и сколько примеров в секунду учит.
4. Самоигра: сколько партий и примеров в секунду даёт один процесс Bun, и сколько выйдет в сутки на всех.
5. Арена: две колоды против «Среднего» — что арена запускается.
Правила здесь не переписаны на Python: партии играет движок приложения в Bun, поэтому сверять правила не с чем.
"""
import argparse
import gzip
import json
import os
import sys
import tempfile
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import bun_path, finish, start  # noqa: E402
from features import INPUTS, encode, random_perm, read_shard  # noqa: E402


def check_vectors(path, weights, label):
    import torch
    from model import load_bin
    rows = [json.loads(line) for line in gzip.open(path, 'rt', encoding='utf8')]
    raw = np.array([r['raw'] for r in rows], np.uint8)
    x = encode(raw)
    bad = 0
    for i, r in enumerate(rows):
        want = np.zeros(INPUTS, np.float32)
        for j, v in r['feat']:
            want[j] = v
        if not np.array_equal(want, x[i]):
            bad += 1
            if bad <= 3:
                diff = np.nonzero(want != x[i])[0]
                print(f'  НЕ СОВПАЛО: наблюдение {i}, входы {diff[:10].tolist()}: ждали {want[diff[:10]].tolist()}, получили {x[i][diff[:10]].tolist()}')
    model = load_bin(weights).eval()
    with torch.no_grad():
        v = torch.sigmoid(model(torch.from_numpy(x))).numpy()
    d = float(np.abs(v - np.array([r['value'] for r in rows])).max())
    # перестановка некозырных мастей не трогает ничего, кроме карт: плоскости карт переставлены, остальное — то же
    p = encode(raw[:200], random_perm(min(200, len(raw)), np.random.default_rng(1)))
    sym = np.array_equal(p[:, 396:], x[:200, 396:]) and np.array_equal(p[:, :396].reshape(-1, 11, 4, 9).sum(axis=(2, 3)), x[:200, :396].reshape(-1, 11, 4, 9).sum(axis=(2, 3)))
    ok = bad == 0 and d < 1e-5 and sym
    print(f'{label}: {len(rows)} наблюдений, расхождений признаков {bad}, наибольшее расхождение оценки {d:.1e}'
          + ('' if sym else ', ПЕРЕСТАНОВКА МАСТЕЙ ЛОМАЕТ ПРИЗНАКИ'))
    return ok


def check_device(quick):
    import torch
    from model import Net
    cuda = torch.cuda.is_available()
    print(f'torch {torch.__version__}, ' + (f'видеокарта: {torch.cuda.get_device_name(0)}' if cuda
                                            else 'видеокарты НЕТ — обучение пойдёт на процессоре, медленнее (README, «Если видеокарты не видно»)'))
    dev = torch.device('cuda' if cuda else 'cpu')
    model = Net((256, 128)).to(dev)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    rng = np.random.default_rng(1)
    raw = np.zeros((2048, 56), np.uint8)
    raw[:, :36] = rng.integers(0, 11, (2048, 36))
    raw[:, 36] = 2
    x = torch.from_numpy(encode(raw)).to(dev)
    y = torch.rand(2048, device=dev)
    steps = 20 if quick else 100
    for i in range(steps + 5):
        if i == 5:
            if cuda:
                torch.cuda.synchronize()
            t0 = time.time()
        loss = torch.nn.functional.binary_cross_entropy_with_logits(model(x), y)
        opt.zero_grad()
        loss.backward()
        opt.step()
    if cuda:
        torch.cuda.synchronize()
    dt = time.time() - t0
    t1 = time.time()
    for _ in range(5):
        encode(raw, random_perm(2048, rng))
    enc = (time.time() - t1) / 5
    print(f'обучение: {steps * 2048 / dt:,.0f} примеров в секунду на шаге сети, признаки на процессоре — {2048 / enc:,.0f} в секунду')
    return True


def check_selfplay(bun, weights, quick, threads):
    tmp = tempfile.mkdtemp(prefix='durak-selftest-')
    games = 30 if quick else 100
    t0 = time.time()
    proc = start(bun, 'selfplay.ts', ['--net', weights, '--games', games, '--seed', 3, '--out', os.path.join(tmp, 's.bin')])
    r = finish(proc)
    dt = time.time() - t0
    raw, tgt = read_shard(os.path.join(tmp, 's.bin'))
    ok = raw.shape[0] == r['samples'] and np.all((tgt >= 0) & (tgt <= 1)) and r['loops'] == 0
    gps, sps = r['games'] / dt, r['samples'] / dt
    print(f'самоигра (один процесс, этап TD): {gps:.1f} партий и {sps:,.0f} примеров в секунду; на {threads} процессах — около '
          f'{gps * threads * 86400 / 1e6:.1f} млн партий в сутки' + ('' if ok else ' — ФАЙЛ САМОИГРЫ НЕ СХОДИТСЯ'))
    t0 = time.time()
    proc = start(bun, 'selfplay.ts', ['--net', weights, '--games', games // 5, '--seed', 4, '--mode', 'search', '--samples', 8, '--horizon', 'bout'])
    r = finish(proc)
    dt = time.time() - t0
    print(f'самоигра (этап поиска, 8 раскладов): {r["games"] / dt:.1f} партий в секунду на процесс')
    return ok


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--quick', action='store_true')
    ap.add_argument('--bun', default=None)
    ap.add_argument('--threads', type=int, default=0)
    args = ap.parse_args()
    threads = args.threads or max(1, (os.cpu_count() or 4) - 2)
    print(f'Python {sys.version.split()[0]}, numpy {np.__version__}, ядер {os.cpu_count()}')
    bun = bun_path(args.bun)
    import subprocess
    print('Bun ' + subprocess.run([bun, '--version'], capture_output=True, text=True).stdout.strip() + f' ({bun})')
    vec = os.path.join(HERE, 'vectors')
    ok = check_vectors(os.path.join(vec, 'features.jsonl.gz'), os.path.join(vec, 'tiny.bin'), 'эталон признаков')
    # свежие партии этой машины: Bun пишет наблюдения, Python пересчитывает
    tmp = tempfile.mkdtemp(prefix='durak-selftest-')
    fresh = os.path.join(tmp, 'fresh.jsonl.gz')
    finish(start(bun, 'vectors.ts', ['--net', os.path.join(vec, 'tiny.bin'), '--positions', 300 if args.quick else 1500, '--seed', int(time.time()) % 100000, '--out', fresh]))
    ok = check_vectors(fresh, os.path.join(vec, 'tiny.bin'), 'свежие партии') and ok
    check_device(args.quick)
    import torch
    from model import Net, export_bin
    torch.manual_seed(1)
    export_bin(Net((256, 128)), os.path.join(tmp, 'net'))
    ok = check_selfplay(bun, os.path.join(tmp, 'net.bin'), args.quick, threads) and ok
    t0 = time.time()
    a = finish(start(bun, 'arena.ts', ['--net', os.path.join(tmp, 'net.bin'), '--vs', 'average', '--pairs', 2, '--samples', 4]))
    print(f'арена: {a["average"]["games"]} партии против «Среднего» за {time.time() - t0:.0f} с — запускается')
    print('ВСЁ В ПОРЯДКЕ — можно запускать обучение' if ok else 'ЕСТЬ РАСХОЖДЕНИЯ — обучение не запускать, прислать вывод целиком')
    sys.exit(0 if ok else 1)
