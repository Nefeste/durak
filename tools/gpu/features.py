"""Признаки наблюдения для сети — то же, что src/bot/net/features.ts (`encode`), бит в бит (docs/specs/2026-11-neural.md, «Вход»).

Вход — «сырая запись» наблюдения места, 56 байт: её пишет самоигра в Bun (`pack` в features.ts). Здесь — только
`encode` над пачкой записей numpy и перестановка некозырных мастей для обучения. Сверка с TypeScript —
tools/gpu/vectors/features.jsonl.gz (selftest.py здесь, tools/test/net.test.ts там).
"""
import numpy as np

VERSION = 1
RAW_SIZE = 56
DECK = 36
RANKS = 9
PLANES = 11
CARDS = PLANES * DECK
SCALARS = 18
PER_SEAT = 15
INPUTS = CARDS + SCALARS + 4 * PER_SEAT

# смещения скаляров сырой записи (RAW в features.ts)
SEATS, VARIANT, ORDER, TRUMP, TALON, BOUT, LIMIT, GIVING, TABLE = 36, 37, 38, 39, 40, 41, 42, 43, 44
HANDS, ATTACKER, DEFENDER, STARTER, PASSED, OUT, FIRST_TRANSFER = 45, 49, 50, 51, 52, 53, 54
# зоны карт (ZONE в features.ts)
UNSEEN, OWN, OPENLY1, TRUMP_BOTTOM, OWN_KNOWN = 0, 1, 6, 9, 10
HAND_STEPS = (1, 2, 3, 4, 6, 8, 12)
TALON_STEPS = (1, 3, 6, 12, 18)

_SUIT = np.arange(DECK) // RANKS
_RANK = np.arange(DECK) % RANKS


def _div(a, d):
    """Как в TypeScript: деление в float64, потом в float32 (запись в Float32Array)."""
    return (a.astype(np.float64) / d).astype(np.float32)


def encode(raw, perm=None):
    """raw — (N, 56) uint8; perm — (N, 3): перестановка некозырных мастей 1…3 (None — без перестановки). → (N, 474) float32."""
    raw = np.asarray(raw, dtype=np.uint8)
    n = raw.shape[0]
    out = np.zeros((n, INPUTS), np.float32)
    rows = np.arange(n)[:, None]
    ts = raw[:, TRUMP].astype(np.int64)[:, None]
    # масть козыря — 0, остальные по возрастанию номера — 1, 2, 3
    canon = np.where(_SUIT[None, :] == ts, 0, _SUIT[None, :] + 1 - (ts < _SUIT[None, :]))
    if perm is not None:
        p = np.concatenate([np.zeros((n, 1), np.int64), np.asarray(perm, np.int64)], axis=1)
        canon = np.take_along_axis(p, canon, axis=1)
    idx = canon * RANKS + _RANK[None, :]
    z = raw[:, :DECK].astype(np.int64)
    plane = np.where(z == UNSEEN, 10, np.where((z == OWN) | (z == OWN_KNOWN), 0, z))
    out[rows, plane * DECK + idx] = 1
    kr, kc = np.nonzero(z == OWN_KNOWN)
    out[kr, DECK + idx[kr, kc]] = 1
    known = np.zeros((n, 4), np.int64)
    for r in (1, 2, 3):
        known[:, r] = (z == OPENLY1 + r - 1).sum(axis=1)
    S = CARDS
    seats = raw[:, SEATS].astype(np.int64)
    out[np.arange(n), S + seats - 2] = 1
    out[:, S + 3] = raw[:, VARIANT]
    out[:, S + 4] = raw[:, ORDER]
    out[:, S + 5] = raw[:, GIVING]
    out[:, S + 6] = raw[:, BOUT] == 0
    out[:, S + 7] = raw[:, FIRST_TRANSFER]
    t = raw[:, TALON].astype(np.int64)
    out[:, S + 8] = t == 0
    for k, step in enumerate(TALON_STEPS):
        out[:, S + 9 + k] = t >= step
    out[:, S + 14] = _div(t, 24)
    limit = raw[:, LIMIT].astype(np.int64)
    table = raw[:, TABLE].astype(np.int64)
    out[:, S + 15] = _div(limit, 6)
    out[:, S + 16] = _div(table, 6)
    out[:, S + 17] = _div(np.maximum(0, limit - table), 6)
    for r in range(4):
        o = S + SCALARS + r * PER_SEAT
        present = r < seats
        h = raw[:, HANDS + r].astype(np.int64)
        cols = np.zeros((n, PER_SEAT), np.float32)
        cols[:, 0] = 1
        for k, step in enumerate(HAND_STEPS):
            cols[:, 1 + k] = h >= step
        cols[:, 8] = _div(h, 12)
        cols[:, 9] = 0 if r == 0 else _div(np.maximum(0, h - known[:, r]), 12)
        cols[:, 10] = raw[:, ATTACKER] == r
        cols[:, 11] = raw[:, DEFENDER] == r
        cols[:, 12] = raw[:, STARTER] == r
        cols[:, 13] = (raw[:, PASSED] >> r) & 1
        cols[:, 14] = (raw[:, OUT] >> r) & 1
        out[:, o:o + PER_SEAT] = np.where(present[:, None], cols, 0)
    return out


def random_perm(n, rng):
    """Случайная перестановка некозырных мастей на каждый пример: (N, 3) из {1, 2, 3}."""
    return np.argsort(rng.random((n, 3)), axis=1) + 1


def read_shard(path):
    """Файл самоигры (selftest.ts): 'DKS1', n, 56, 0 — затем n × 56 байт записей и n float32 целей."""
    data = np.fromfile(path, dtype=np.uint8)
    head = data[:16].view('<u4')
    if head[0] != 0x31534B44 or head[2] != RAW_SIZE:
        raise ValueError(f'{path}: не файл самоигры DKS1')
    n = int(head[1])
    raw = data[16:16 + n * RAW_SIZE].reshape(n, RAW_SIZE)
    tgt = data[16 + n * RAW_SIZE:16 + n * RAW_SIZE + 4 * n].view('<f4')
    return raw.copy(), tgt.copy()
