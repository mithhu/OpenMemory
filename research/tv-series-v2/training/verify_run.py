"""CPU integrity check for the finished experiment and its adapter archive."""
import json
import math
import struct
from run import HERE, OUTPUT, PARENT, read, sha

def main():
    recipe = read('recipe.json')
    for name, expected in recipe['files_sha256'].items():
        if sha(HERE/name) != expected: raise ValueError('Frozen input changed: '+name)
    steps = [json.loads(line) for line in (OUTPUT/'steps.jsonl').read_text().splitlines()]
    if len(steps) != recipe['updates']: raise ValueError('Incomplete training')
    for index, (actual, expected) in enumerate(zip(steps, read('train.json')), 1):
        if actual['step'] != index or actual['id'] != expected['id'] or not math.isfinite(actual['loss']):
            raise ValueError('Training trace mismatch')
    complete = json.loads((OUTPUT/'completed.json').read_text())
    tensor = OUTPUT/'adapters.safetensors'
    if sha(tensor) != complete['adapterSha256'] or sha(tensor) == recipe['parent_adapter_sha256']:
        raise ValueError('Candidate hash mismatch or no changed weights')
    if sha(PARENT/'adapters.safetensors') != recipe['parent_adapter_sha256']:
        raise ValueError('Installed parent was changed')
    with tensor.open('rb') as stream:
        size = struct.unpack('<Q', stream.read(8))[0]
        header = json.loads(stream.read(size))
    arrays = {k:v for k,v in header.items() if k != '__metadata__'}
    if len(arrays) != 14 or sum(math.prod(v['shape']) for v in arrays.values()) != 638976:
        raise ValueError('Unexpected adapter architecture')
    # Optional CPU tensor check, never a native inference/model allocation.
    import numpy as np
    from safetensors.numpy import load_file
    saved = load_file(str(tensor))
    parent_weights = load_file(str(PARENT/'adapters.safetensors'))
    if set(saved) != set(parent_weights): raise ValueError('Parent/candidate tensor names differ')
    changed = {name: int(np.count_nonzero(value != parent_weights[name])) for name,value in saved.items()}
    if not sum(changed.values()): raise ValueError('No actual parameter values changed')
    if any(not np.isfinite(v).all() for v in saved.values()):
        raise ValueError('Nonfinite saved adapter')
    for name in ['parent', 'candidate']:
        receipt = read(name+'-completed.json')
        if receipt['outputSha256'] != sha(HERE/(name+'-predictions.jsonl')) or receipt['rows'] != 80:
            raise ValueError('Incomplete or changed evaluation')
    print(json.dumps({'verified':True,'updates':len(steps),'tensors':len(arrays),'trainableValues':638976,'parentUnchanged':True,'candidateSha256':sha(tensor),'changedArrays':sum(n>0 for n in changed.values()),'changedValues':sum(changed.values()),'totalTrainableValues':sum(v.size for v in saved.values())}))

if __name__ == '__main__':main()
