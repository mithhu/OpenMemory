"""Single bounded attempt: train once, then compare parent and candidate. No promotion."""
import fcntl
import json
import os
import signal
import subprocess
import time
from pathlib import Path
from run import HERE, ROOT, OUTPUT, sha

def main():
    started = time.monotonic()
    python = ROOT / '.local-runtime/venv/bin/python'
    recipe = json.loads((HERE/'recipe.json').read_text())
    for name in ['run.py', 'supervise.py']:
        if sha(HERE/name) != recipe['files_sha256'][name]: raise ValueError('Runner changed')
    with open('/tmp/openmemory-local-model-gpu.lock', 'a+') as lease:
        fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        env = {**os.environ, 'OPENMEMORY_TV_LEASE_FD': str(lease.fileno())}
        for phase, maximum in [('train', 660), ('parent', 270), ('candidate', 270)]:
            limit = min(maximum, 1200-(time.monotonic()-started))
            if limit <= 0: raise TimeoutError('20-minute experiment deadline')
            with (HERE/(phase+'.log')).open('x') as log:
                process = subprocess.Popen([str(python), str(HERE/'run.py'), phase],
                    stdout=log, stderr=subprocess.STDOUT, env=env, pass_fds=(lease.fileno(),), start_new_session=True)
                try: code = process.wait(timeout=limit)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGTERM)
                    try: process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL); process.wait()
                    (HERE/'failure.json').write_text(json.dumps({'phase': phase, 'reason': 'deadline; worker reaped', 'seconds': time.monotonic()-started}, indent=2)+'\n')
                    raise
                if code:
                    (HERE/'failure.json').write_text(json.dumps({'phase': phase, 'exit': code, 'seconds': time.monotonic()-started}, indent=2)+'\n')
                    raise RuntimeError('Failed phase: '+phase)
            print(json.dumps({'completedPhase': phase, 'seconds': time.monotonic()-started}), flush=True)
        (HERE/'supervisor-completed.json').write_text(json.dumps({'completed': True, 'seconds': time.monotonic()-started, 'candidateInstalled': False, 'candidateAdapter': str(OUTPUT.relative_to(ROOT))}, indent=2)+'\n')

if __name__ == '__main__': main()
