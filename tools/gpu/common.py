"""Общее для обучения: где Bun и репозиторий, запуск частей самоигры и арены (tools/gpu/README.md)."""
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))


def bun_path(given=None):
    """Путь к Bun: `--bun`, переменная BUN, PATH, обычное место установки (~/.bun/bin)."""
    for cand in (given, os.environ.get('BUN'), shutil.which('bun'),
                 os.path.join(os.path.expanduser('~'), '.bun', 'bin', 'bun.exe' if os.name == 'nt' else 'bun')):
        if cand and os.path.exists(cand):
            return cand
        if cand and shutil.which(cand):
            return shutil.which(cand)
    sys.exit('Bun не найден. Поставить: Windows — powershell -c "irm bun.sh/install.ps1 | iex", '
             'Linux — curl -fsSL https://bun.sh/install | bash; потом открыть новое окно PowerShell/терминала (README, шаг 2).')


def start(bun, script, args):
    """Запустить скрипт Bun из корня репозитория; вывод — построчно JSON."""
    flags = getattr(subprocess, 'CREATE_NEW_PROCESS_GROUP', 0) if os.name == 'nt' else 0
    return subprocess.Popen([bun, os.path.join('tools', 'gpu', script), *[str(a) for a in args]], cwd=REPO,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf8', creationflags=flags,
                            start_new_session=(os.name != 'nt'))


def finish(proc):
    """Дождаться процесса и вернуть его последнюю строку JSON."""
    out, err = proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f'процесс Bun упал (код {proc.returncode}):\n{err.strip()[-2000:]}')
    return json.loads(out.strip().splitlines()[-1])


def stop_all(procs):
    for p in procs:
        if p.poll() is None:
            p.kill()
    for p in procs:
        try:
            p.wait(timeout=10)
        except Exception:
            pass
