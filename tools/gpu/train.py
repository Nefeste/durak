# по образцу nardy: tools/gpu/train.py @ 1d2bdff (studio ADR 0002): то же устройство, свои правила и сеть
"""Обучение сети седьмого уровня «Мастер» на видеокарте (tools/gpu/README.md, docs/specs/2026-11-neural.md).

    python tools/gpu/train.py --hours 24                    # сутки; Ctrl+C — остановить, та же команда — продолжить
    python tools/gpu/train.py --hours 1 --out tools/gpu/runs/test   # пробный час

Партии играет Bun — настоящий движок и боты приложения, по процессу на ядро (`selfplay.ts`); видеокарта учит сеть
на их наблюдениях. Круги идут внахлёст: пока процессы играют круг N + 1 весами круга N, видеокарта учит на круге N.
Два этапа: сначала TD(λ) — сеть выбирает ход по своей оценке сразу после действия, цель — λ-возврат по наблюдениям
места до исхода партии; потом «поиск» — ход выбирается как у бота в приложении (расклады и доигрывание отбоя),
цель — смесь λ-возврата и оценки поиска (экспертная итерация). Раз в час — арена против «Сильного» и «Опытного»
настоящими ботами приложения, снимок, строка в журнале.
"""
import argparse
import collections
import json
import math
import os
import shutil
import signal
import sys
import time

import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import REPO, bun_path, finish, start, stop_all  # noqa: E402
from features import INPUTS, VERSION, encode, random_perm, read_shard  # noqa: E402
from model import Net, export_bin  # noqa: E402

NAMES = {'experienced': '«Сильного»', 'master': '«Опытного»', 'average': '«Среднего»', 'amateur': '«Любителя»'}
# пилот песочницы (30 минут на процессоре, 09.11.2026): третий соперник арены — растёт ли сеть дальше пилота
PILOT = 'tools/gpu/nets/2026-11-09-cpu-pilot/best.bin'


def name_of(rival):
    if rival.startswith('net:'):
        return '«пилота»' if PILOT in rival else rival
    return NAMES.get(rival, rival)


def parse():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(HERE, 'runs', 'main'), help='папка прогона (продолжается, если есть)')
    ap.add_argument('--hours', type=float, default=168.0, help='сколько учиться всего, с учётом прошлых запусков')
    ap.add_argument('--hidden', default='256,128', help='скрытые слои; 256,128 — под телефон (замер — в спецификации)')
    ap.add_argument('--threads', type=int, default=0, help='процессов самоигры (0 — ядер минус два)')
    ap.add_argument('--games', type=int, default=0, help='партий на процесс за круг (0 — 400 на этапе TD, 100 на этапе поиска)')
    ap.add_argument('--td-share', type=float, default=0.5, help='доля времени на этап TD(λ), остальное — поиск')
    ap.add_argument('--td-max-hours', type=float, default=2.0, help='этап TD — не дольше стольких часов: на первом прогоне (10.11.2026) сила на арене после часа TD не росла')
    ap.add_argument('--lam', type=float, default=0.8, help='λ возврата')
    ap.add_argument('--beta', type=float, default=0.5, help='этап поиска: доля оценки поиска в цели своих решений')
    ap.add_argument('--samples', type=int, default=8, help='этап поиска: раскладов на решение в самоигре')
    ap.add_argument('--eps', type=float, default=0.05, help='доля решений наугад среди кандидатов (разведка)')
    ap.add_argument('--keep', type=float, default=0.5, help='доля наблюдений партии, которые идут в обучение')
    ap.add_argument('--mix', default='net:0.75,average:0.12,amateur:0.06,experienced:0.07',
                    help='кто сидит на местах самоигры: сеть и уровни приложения с долями')
    ap.add_argument('--seats', default='2:0.6,3:0.2,4:0.2', help='сколько мест за столом, с долями')
    ap.add_argument('--replay', type=int, default=3, help='сколько последних кругов в обучении')
    ap.add_argument('--batch', type=int, default=2048)
    ap.add_argument('--lr', type=float, default=1e-3)
    ap.add_argument('--lr-end', type=float, default=3e-5)
    ap.add_argument('--arena-minutes', type=float, default=60.0)
    ap.add_argument('--arena-pairs', type=int, default=200, help='колод на соперника (партий — вдвое больше)')
    ap.add_argument('--arena-vs', default='experienced,master,pilot',
                    help='соперники арены: experienced — «Сильный», master — «Опытный», pilot — сеть-пилот, net:<файл.bin> — любая сеть')
    ap.add_argument('--arena-samples', type=int, default=24, help='раскладов на решение сети на арене (как в приложении)')
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--device', default='auto', help='auto, cuda или cpu')
    ap.add_argument('--bun', default=None, help='путь к bun, если его нет в PATH')
    return ap.parse_args()


def main():
    args = parse()
    bun = bun_path(args.bun)
    dev = torch.device('cuda' if (args.device == 'auto' and torch.cuda.is_available()) else (args.device if args.device != 'auto' else 'cpu'))
    threads = args.threads or max(1, (os.cpu_count() or 4) - 2)
    torch.set_num_threads(2 if dev.type == 'cpu' else 1)     # ядра — самоигре
    os.makedirs(args.out, exist_ok=True)
    log_path = os.path.join(args.out, 'log.txt')

    def log(msg):
        line = time.strftime('%Y-%m-%d %H:%M:%S ') + msg
        print(line, flush=True)
        with open(log_path, 'a', encoding='utf8') as f:
            f.write(line + '\n')

    hidden = tuple(int(x) for x in args.hidden.split(','))
    model = Net(hidden).to(dev)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    state = dict(seconds=0.0, games=0, samples=0, rounds=0, best=-1.0, arenas=[])
    last = os.path.join(args.out, 'last.pt')
    if os.path.exists(last):
        ck = torch.load(last, map_location=dev, weights_only=False)
        if tuple(ck['hidden']) != hidden or ck.get('features') != VERSION:
            sys.exit(f'в {args.out} учится другая сеть ({ck["hidden"]}, признаки {ck.get("features")}): другой --out или те же --hidden')
        model.load_state_dict(ck['model'])
        opt.load_state_dict(ck['opt'])
        state.update(ck['state'])
        log(f'продолжаю: {state["games"]:,} партий, {state["seconds"] / 3600:.2f} ч обучения позади из {args.hours:g}')
    else:
        log(f'новая сеть {INPUTS}×{"×".join(map(str, hidden))}×1 (признаки {VERSION}), устройство {dev}'
            + (f' ({torch.cuda.get_device_name(0)})' if dev.type == 'cuda' else '') + f', процессов самоигры {threads}, Bun {bun}')

    stop = {'now': False}

    def on_signal(*_):
        if stop['now']:
            os._exit(1)
        stop['now'] = True
        log('остановка по запросу — сохраняю (второй Ctrl+C — выйти сразу, без сохранения)')
    signal.signal(signal.SIGINT, on_signal)
    if hasattr(signal, 'SIGTERM'):
        signal.signal(signal.SIGTERM, on_signal)
    if hasattr(signal, 'SIGBREAK'):
        signal.signal(signal.SIGBREAK, on_signal)

    def save():
        torch.save(dict(model=model.state_dict(), opt=opt.state_dict(), state=state, hidden=list(hidden), features=VERSION, inputs=INPUTS), last + '.tmp')
        os.replace(last + '.tmp', last)

    def passport():
        return dict(games=state['games'], samples=state['samples'], hours=round(state['seconds'] / 3600, 2), rounds=state['rounds'],
                    seed=args.seed, created=time.strftime('%Y-%m-%dT%H:%M:%S'), arena=state['arenas'][-1] if state['arenas'] else None)

    rivals = []
    for k in args.arena_vs.split(','):
        if k == 'pilot':
            if os.path.exists(os.path.join(REPO, PILOT)):
                rivals.append(f'net:{PILOT}:{args.arena_samples}:bout')
            else:
                log(f'нет {PILOT} — арена без пилота (git pull)')
        elif k:
            rivals.append(k)
    args.arena_vs = ','.join(rivals)
    total = args.hours * 3600
    shards = os.path.join(args.out, 'shards')
    os.makedirs(shards, exist_ok=True)
    buffer = collections.deque(maxlen=max(1, args.replay))
    rng = np.random.default_rng(args.seed * 1_000_003 + state['rounds'])

    def stage():
        frac = state['seconds'] / total
        td = state['seconds'] < min(args.td_share * total, args.td_max_hours * 3600)
        lr = args.lr_end + 0.5 * (args.lr - args.lr_end) * (1 + math.cos(math.pi * min(1.0, frac)))
        eps = args.eps * (1 - 0.6 * min(1.0, frac))
        return td, lr, eps

    def launch(rnd):
        """Круг самоигры: процессы Bun с весами на сейчас."""
        td, _, eps = stage()
        weights = os.path.join(args.out, f'play-{rnd % 2}.bin')
        export_bin(model, weights[:-4], passport())
        games = args.games or (400 if td else 100)
        procs = []
        for w in range(threads):
            procs.append(start(bun, 'selfplay.ts', [
                '--net', weights, '--games', games, '--seed', (args.seed * 100_000 + rnd) * 64 + w, '--out', os.path.join(shards, f'w{w}.bin'),
                '--mode', 'td' if td else 'search', '--samples', 2 if td else args.samples, '--horizon', 'now' if td else 'bout',
                '--lam', args.lam, '--beta', args.beta, '--eps', round(eps, 4), '--keep', args.keep, '--mix', args.mix, '--seats', args.seats]))
        return dict(procs=procs, td=td, t=time.time())

    def collect(run):
        # ждать круг, проверяя остановку: Ctrl+C не ждёт конца круга
        while any(p.poll() is None for p in run['procs']):
            if stop['now']:
                stop_all(run['procs'])
                return None
            time.sleep(0.2)
        stats = [finish(p) for p in run['procs']]
        raws, tgts = [], []
        for w in range(len(run['procs'])):
            r, t = read_shard(os.path.join(shards, f'w{w}.bin'))
            raws.append(r)
            tgts.append(t)
        raw, tgt = np.concatenate(raws), np.concatenate(tgts)
        agg = {k: sum(s[k] for s in stats) for k in ('games', 'samples', 'steps', 'decisions', 'loops')}
        mixed = [s for s in stats if s['net_mixed_n']]
        n_mixed = sum(s['net_mixed_n'] for s in mixed)
        agg['net_mixed'] = sum(s['net_mixed'] * s['net_mixed_n'] for s in mixed) / n_mixed if n_mixed else None
        agg['net_mixed_base'] = sum(s['net_mixed_base'] * s['net_mixed_n'] for s in mixed) / n_mixed if n_mixed else None
        agg['seconds'] = time.time() - run['t']
        return raw, tgt, agg

    def loss_on(raw, tgt):
        model.eval()
        with torch.no_grad():
            total_loss, n = 0.0, 0
            for s in range(0, min(len(raw), 50_000), 8192):
                x = torch.from_numpy(encode(raw[s:s + 8192])).to(dev)
                y = torch.from_numpy(tgt[s:s + 8192]).to(dev)
                total_loss += torch.nn.functional.binary_cross_entropy_with_logits(model(x), y, reduction='sum').item()
                n += len(y)
        return total_loss / max(1, n)

    def train(lr):
        for g in opt.param_groups:
            g['lr'] = lr
        raw = np.concatenate([b[0] for b in buffer])
        tgt = np.concatenate([b[1] for b in buffer])
        order = rng.permutation(len(raw))
        model.train()
        loss_sum, nb = 0.0, 0
        for s in range(0, len(order), args.batch):
            sel = order[s:s + args.batch]
            x = torch.from_numpy(encode(raw[sel], random_perm(len(sel), rng))).to(dev, non_blocking=True)
            y = torch.from_numpy(tgt[sel]).to(dev, non_blocking=True)
            loss = torch.nn.functional.binary_cross_entropy_with_logits(model(x), y)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            loss_sum += loss.item()
            nb += 1
            if stop['now']:
                break
        return loss_sum / max(1, nb)

    def run_arena():
        t = time.time()
        weights = os.path.join(args.out, 'arena')
        export_bin(model, weights, passport())
        proc = start(bun, 'arena.ts', ['--net', weights + '.bin', '--vs', args.arena_vs, '--pairs', args.arena_pairs, '--jobs', threads,
                                       '--samples', args.arena_samples, '--seed', 900 + len(state['arenas'])])
        try:
            r = finish(proc)
        except RuntimeError as e:
            log(f'== арена не удалась: {e}')
            return
        r.update(games=state['games'], hours=round(state['seconds'] / 3600, 2), rounds=state['rounds'])
        state['arenas'].append(r)
        parts = []
        for k in args.arena_vs.split(','):
            a = r[k]
            parts.append(f'против {name_of(k)} {a["share"]:.3f} ± {a["ci"]:.3f} (Эло {a["elo"]:+.0f}, {a["elo_lo"]:+.0f}…{a["elo_hi"]:+.0f})')
        log('== арена: ' + '; '.join(parts) + f'; {time.time() - t:.0f} с')
        # лучший снимок — по средней доле против всех соперников арены, а не против одного «Опытного»: на 400 партиях
        # доля против одного шумит на ±0,04 и рост не видит (прогон 10–12.11.2026: «лучшим» остался первый час TD,
        # хотя поиск поднял долю против пилота с 0,54 до 0,63). `best_mean` — новый ключ: у старых прогонов `best`
        # был долей против «Опытного», с ним не сравнить
        keys = args.arena_vs.split(',')
        mean = sum(r[k]['share'] for k in keys) / len(keys)
        export_bin(model, os.path.join(args.out, 'snapshots', f'h{state["seconds"] / 3600:06.2f}'), passport())
        if mean > state.get('best_mean', -1.0):
            state['best_mean'] = mean
            state['best'] = r['master']['share'] if 'master' in r else mean
            export_bin(model, os.path.join(args.out, 'best'), passport())
            if os.path.exists(last):
                shutil.copyfile(last, os.path.join(args.out, 'best.pt'))
            log(f'   лучший снимок обновлён: в среднем {mean:.3f} против {", ".join(name_of(k) for k in keys)}')
        with open(os.path.join(args.out, 'progress.jsonl'), 'a', encoding='utf8') as f:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')

    last_arena = time.time()      # первая арена — через час: у новой сети она ничего не скажет
    t_mark = time.time()
    run = launch(state['rounds'])
    try:
        while not stop['now']:
            got = collect(run)
            if got is None or stop['now']:
                break
            raw, tgt, agg = got
            td, lr, _ = stage()
            fresh = loss_on(raw, tgt)        # ошибка на новом круге до обучения на нём — честная проверка
            buffer.append((raw, tgt))
            state['rounds'] += 1
            state['games'] += agg['games']
            state['samples'] += agg['samples']
            arena_due = time.time() - last_arena >= args.arena_minutes * 60
            done = state['seconds'] + (time.time() - t_mark) >= total
            # следующий круг играет, пока видеокарта учит (кроме арены и конца: им нужны все ядра)
            run = None if (arena_due or done) else launch(state['rounds'])
            t1 = time.time()
            loss = train(lr)
            t_train = time.time() - t1
            now = time.time()
            state['seconds'] += now - t_mark
            t_mark = now
            save()
            mixed = (f'; сеть за столами с ботами не дурак в {agg["net_mixed"]:.3f} (как все — {agg["net_mixed_base"]:.3f})'
                     if agg['net_mixed'] is not None else '')
            log(f'круг {state["rounds"]}: {"TD" if td else "поиск"}, партий {state["games"]:,} '
                f'(+{agg["games"]} за {agg["seconds"]:.0f} с, {agg["games"] / max(1e-9, agg["seconds"]):.0f}/с), примеров {agg["samples"]:,}, '
                f'ошибка на новом {fresh:.4f}, после обучения {loss:.4f}, шаг {lr:.1e}, обучение {t_train:.0f} с{mixed}'
                + (f', круг не кончился: {agg["loops"]}' if agg['loops'] else '') + f'; {state["seconds"] / 3600:.2f} ч из {args.hours:g}')
            if stop['now']:
                break
            if arena_due:
                run_arena()
                last_arena = time.time()
                t_mark = time.time()
            if state['seconds'] >= total:
                break
            if run is None:
                run = launch(state['rounds'])
    except KeyboardInterrupt:
        stop['now'] = True
    finally:
        if run is not None:
            stop_all(run['procs'])
        save()
        export_bin(model, os.path.join(args.out, 'last'), passport())
    if stop['now']:
        log(f'сохранено: {state["games"]:,} партий, {state["seconds"] / 3600:.2f} ч обучения; та же команда — продолжить')
        return
    run_arena()
    save()
    log(f'готово: {state["games"]:,} партий, {state["seconds"] / 3600:.2f} ч; лучший снимок — {state["best"]:.3f}; '
        f'веса — {os.path.relpath(os.path.join(args.out, "best.bin"), REPO)}, прислать — python tools/gpu/collect.py')


if __name__ == '__main__':
    main()
