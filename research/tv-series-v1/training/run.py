"""Bounded offline TV-series LoRA experiment. Never installs or promotes a model."""
import argparse
import hashlib
import json
import math
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BASE = ROOT / '.local-runtime/model'
PARENT = ROOT / 'artifacts/fine-tuning/classification-reviewed9b-v1'
OUTPUT = ROOT / 'artifacts/fine-tuning/tv-series-experimental-v1'

def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def read(name):
    return json.loads((HERE / name).read_text())

def validate(value):
    contract = read('contract.json')['schema']['properties']
    if not isinstance(value, dict) or set(value) != {'category', 'intent'}:
        raise ValueError('Expected category and intent only')
    if value['category'] not in contract['category']['enum'] or value['intent'] not in contract['intent']['enum']:
        raise ValueError('Unsupported output')
    if (value['category'] == 'MIXED') != (value['intent'] == 'mixed'):
        raise ValueError('Mixed mismatch')
    return value

def check_inputs():
    recipe = read('recipe.json')
    for name, expected in recipe['files_sha256'].items():
        if sha(HERE / name) != expected:
            raise ValueError('Frozen input changed: ' + name)
    if sha(PARENT / 'adapters.safetensors') != recipe['parent_adapter_sha256']:
        raise ValueError('Installed parent changed')
    manifest = read('base-manifest.json')
    for name, expected in {**manifest['base_weight_sha256'], **manifest['model_metadata_sha256']}.items():
        if sha(BASE / name) != expected:
            raise ValueError('Base changed: ' + name)
    return recipe

def prompt(tokenizer, row, target=False):
    messages = [{'role': 'system', 'content': read('contract.json')['instructions']},
                {'role': 'user', 'content': json.dumps({'note': row['text']}, ensure_ascii=False)}]
    if target:
        messages.append({'role': 'assistant', 'content': json.dumps(validate({k: row[k] for k in ('category', 'intent')}), separators=(',', ':'))})
    return tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=not target,
                                        enable_thinking=False, return_dict=False)

def encode(tokenizer):
    recipe = read('recipe.json'); encoded = []
    for row in read('train.json'):
        prefix, full = prompt(tokenizer, row), prompt(tokenizer, row, True)
        if full[:len(prefix)] != prefix or len(full) > recipe['max_sequence_tokens'] or not 0 < len(full)-len(prefix) <= 64:
            raise ValueError('Token bounds: ' + row['id'])
        encoded.append((row['id'], full, len(prefix)))
    return encoded

def response_loss(model, batch, bounds):
    # Same response-only projection objective as the released research trainer.
    import mlx.core as mx
    import mlx.nn as nn
    text = model.language_model
    hidden = text.model(batch[:, :-1])
    positions = bounds[:, 0:1] + mx.arange(64)[None, :]
    mask = positions < bounds[:, 1:2]
    safe = mx.clip(positions, 1, batch.shape[1]-1)
    selected = mx.take_along_axis(hidden, (safe-1)[..., None], axis=1)
    logits = text.model.embed_tokens.as_linear(selected) if text.args.tie_word_embeddings else text.lm_head(selected)
    target = mx.take_along_axis(batch, safe, axis=1)
    return (nn.losses.cross_entropy(logits, target)*mask).astype(mx.float32).sum()/mask.sum()

def train():
    import random
    import numpy as np
    import mlx.core as mx
    import mlx.nn as nn
    import mlx.optimizers as optim
    from mlx_lm import load
    from mlx_lm.tuner.utils import linear_to_lora_layers
    from mlx.utils import tree_flatten
    from functools import partial
    recipe = check_inputs()
    OUTPUT.mkdir(parents=True, exist_ok=False)
    random.seed(recipe['seed']); np.random.seed(recipe['seed']); mx.random.seed(recipe['seed'])
    mx.set_cache_limit(536870912)
    model, tokenizer = load(str(BASE), trust_remote_code=False)
    model.freeze(); model.eval()
    linear_to_lora_layers(model, 1, {'rank': 8, 'scale': 20.0, 'dropout': 0.0})
    weights = mx.load(str(PARENT / 'adapters.safetensors'))
    params = dict(tree_flatten(model.trainable_parameters()))
    if set(weights) != set(params) or len(params) != 14 or sum(v.size for v in params.values()) != 638976:
        raise ValueError('Unexpected adapter architecture')
    model.load_weights(list(weights.items()), strict=False)
    mx.eval(model.parameters())
    if any(not bool(mx.array_equal(dict(tree_flatten(model.trainable_parameters()))[k], v).item()) for k, v in weights.items()):
        raise ValueError('Warm-start weights differ')
    encoded = encode(tokenizer)
    (OUTPUT / 'tokenization.json').write_text(json.dumps([{'id': i, 'tokens': len(t), 'offset': o, 'sha256': hashlib.sha256(json.dumps(t).encode()).hexdigest()} for i,t,o in encoded], indent=2)+'\n')
    model.train()
    for layer in model.layers[:-1]: layer.eval()
    optimizer = optim.Adam(learning_rate=recipe['learning_rate'])
    grad = nn.value_and_grad(model, response_loss)
    state = [model.state, optimizer.state, mx.random.state]
    @partial(mx.compile, inputs=state, outputs=state)
    def step(tokens, bounds):
        loss, gradients = grad(model, tokens, bounds)
        optimizer.update(model, gradients)
        return loss, gradients
    started = time.monotonic()
    with (OUTPUT / 'steps.jsonl').open('x') as log:
        for n, (id, tokens, offset) in enumerate(encoded, 1):
            loss, gradients = step(mx.array([tokens]), mx.array([[offset, len(tokens)]]))
            mx.eval(model.parameters(), optimizer.state, loss, gradients)
            value = float(loss.item())
            if not math.isfinite(value) or any(not bool(mx.all(mx.isfinite(v)).item()) for _,v in tree_flatten(gradients)):
                raise RuntimeError('Nonfinite loss/gradient')
            log.write(json.dumps({'step': n, 'id': id, 'loss': value})+'\n'); log.flush()
            if n % 10 == 0: print(json.dumps({'stage': 'train', 'updates': n, 'total': len(encoded), 'loss': value, 'seconds': time.monotonic()-started}), flush=True)
            if mx.get_active_memory()+mx.get_cache_memory() > 8_000_000_000:
                raise RuntimeError('8GB allocation bound exceeded')
    mx.save_safetensors(str(OUTPUT / 'adapters.safetensors'), dict(tree_flatten(model.trainable_parameters())))
    (OUTPUT / 'adapter_config.json').write_text((PARENT / 'adapter_config.json').read_text())
    (OUTPUT / 'completed.json').write_text(json.dumps({'steps': len(encoded), 'seconds': time.monotonic()-started, 'peakBytes': mx.get_peak_memory(), 'adapterSha256': sha(OUTPUT / 'adapters.safetensors'), 'parentUnchanged': sha(PARENT/'adapters.safetensors') == recipe['parent_adapter_sha256']}, indent=2)+'\n')

def evaluate(which):
    import mlx.core as mx
    from mlx_lm import load, generate
    from mlx_lm.sample_utils import make_sampler
    check_inputs(); mx.set_cache_limit(536870912); mx.random.seed(20261017)
    adapter = PARENT if which == 'parent' else OUTPUT
    model, tokenizer = load(str(BASE), adapter_path=str(adapter), trust_remote_code=False)
    result = HERE / (which + '-predictions.jsonl')
    started = time.monotonic()
    with result.open('x') as stream:
        for subset, name in [('series', 'series-holdout.json'), ('retention', 'retention.json')]:
            for index, row in enumerate(read(name), 1):
                tokens = prompt(tokenizer, row)
                if len(tokens)+80 > 2048: raise ValueError('No truncation permitted')
                raw = generate(model, tokenizer, prompt=tokens, max_tokens=80, sampler=make_sampler(temp=0), verbose=False)
                def pairs(items):
                    d = {}
                    for k,v in items:
                        if k in d: raise ValueError('Duplicate key')
                        d[k] = v
                    return d
                try: prediction = validate(json.loads(raw, object_pairs_hook=pairs))
                except (ValueError, TypeError, KeyError): prediction = None
                stream.write(json.dumps({'id': row['id'], 'subset': subset, 'gold': {k: row[k] for k in ('category', 'intent')}, 'prediction': prediction, 'raw': raw})+'\n'); stream.flush()
                mx.clear_cache()
                if mx.get_active_memory()+mx.get_cache_memory() > 8_000_000_000: raise RuntimeError('8GB allocation bound exceeded')
                if index % 10 == 0: print(json.dumps({'stage': which, 'subset': subset, 'rows': index}), flush=True)
    (HERE / (which+'-completed.json')).write_text(json.dumps({'rows': 88, 'seconds': time.monotonic()-started, 'peakBytes': mx.get_peak_memory(), 'outputSha256': sha(result), 'adapterSha256': sha(adapter/'adapters.safetensors')}, indent=2)+'\n')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['preflight', 'train', 'parent', 'candidate'])
    args = parser.parse_args()
    check_inputs()
    if args.phase != 'preflight':
        import fcntl, os
        fd = int(os.environ['OPENMEMORY_TV_LEASE_FD'])
        if os.fstat(fd).st_ino != os.stat('/tmp/openmemory-local-model-gpu.lock').st_ino:
            raise ValueError('Canonical supervisor lease required')
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    if args.phase == 'preflight':
        from transformers import AutoTokenizer
        tokenizer = AutoTokenizer.from_pretrained(str(BASE), local_files_only=True, trust_remote_code=False)
        encoded = encode(tokenizer)
        print(json.dumps({'rows': len(encoded), 'maxTokens': max(len(t) for _,t,_ in encoded), 'training': False}))
    elif args.phase == 'train': train()
    else: evaluate(args.phase)

if __name__ == '__main__': main()
