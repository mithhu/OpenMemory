"""One attempt only. Owns the GPU lease and hard per-phase/overall deadlines."""
import fcntl,json,os,signal,subprocess,time
from pathlib import Path
from run import HERE,ROOT,OUTPUT,sha

def main():
    recipe=json.loads((HERE/'recipe.json').read_text())
    for n in ['run.py','supervise.py','summarize.py']:
        if sha(HERE/n)!=recipe['files_sha256'][n]:raise ValueError('Frozen runner changed')
    started=time.monotonic()
    python=ROOT/'.local-runtime/venv/bin/python'
    with open('/tmp/openmemory-local-model-gpu.lock','a+') as lease:
        fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
        env={**os.environ,'OPENMEMORY_V6_LEASE_FD':str(lease.fileno()),'HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1'}
        for phase in ['train','base','installed','parent','candidate']:
            maximum=recipe['limits']['training_seconds'] if phase=='train' else recipe['limits']['each_evaluation_seconds']
            limit=min(maximum,recipe['limits']['total_seconds']-(time.monotonic()-started))
            if limit<=0:raise TimeoutError('Overall frozen deadline')
            with (HERE/(phase+'.log')).open('x') as log:
                child=subprocess.Popen([str(python),str(HERE/'run.py'),phase],stdout=log,stderr=subprocess.STDOUT,env=env,pass_fds=(lease.fileno(),),start_new_session=True)
                try:code=child.wait(timeout=limit)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid,signal.SIGTERM)
                    try:child.wait(timeout=5)
                    except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait()
                    (HERE/'failure.json').write_text(json.dumps({'phase':phase,'reason':'deadline; child reaped','seconds':time.monotonic()-started},indent=2)+'\n')
                    raise
                if code:
                    (HERE/'failure.json').write_text(json.dumps({'phase':phase,'exit':code,'seconds':time.monotonic()-started},indent=2)+'\n')
                    raise RuntimeError('Failed phase: '+phase)
            print(json.dumps({'phaseCompleted':phase,'seconds':time.monotonic()-started}),flush=True)
        subprocess.run([str(python),str(HERE/'summarize.py')],check=True,env=env)
        (HERE/'supervisor-completed.json').write_text(json.dumps({'seconds':time.monotonic()-started,'candidateInstalled':False},indent=2)+'\n')
if __name__=='__main__':main()
