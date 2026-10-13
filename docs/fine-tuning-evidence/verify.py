"""CPU-only evidence audit. No MLX, GPU, cloud, or training required."""
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
import struct

HERE = Path(__file__).resolve().parent

def require(condition, message):
    if not condition:
        raise ValueError(message)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def adapter_check(path, evidence):
    require(sha(path) == evidence['adapter_sha256'], 'Adapter hash differs from selected model')
    data = path.read_bytes()
    header_size = struct.unpack('<Q', data[:8])[0]
    header = json.loads(data[8:8 + header_size])
    tensors = {k: v for k, v in header.items() if k != '__metadata__'}
    count = 0
    trained_b = 0
    for name, tensor in tensors.items():
        require(tensor['dtype'] == 'F32', 'Unexpected tensor dtype')
        begin, end = tensor['data_offsets']
        payload = data[8 + header_size + begin:8 + header_size + end]
        values = [v[0] for v in struct.iter_unpack('<f', payload)]
        require(len(values) == math.prod(tensor['shape']), 'Tensor shape/data mismatch')
        require(all(math.isfinite(v) for v in values), 'Nonfinite adapter values')
        count += len(values)
        if name.endswith('lora_b') and any(v != 0 for v in values):
            trained_b += 1
    require(count == evidence['training']['trainable_parameters'], 'Wrong parameter count')
    require(len(tensors) == evidence['training']['tensor_count'], 'Wrong tensor count')
    require(trained_b == 7, 'Expected seven nonzero LoRA B matrices')
    return {'sha256': sha(path), 'parameters': count, 'nonzero_b_matrices': trained_b}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--adapter', type=Path, help='Optional local trained adapters.safetensors')
    parser.add_argument('--source-root', type=Path, help='Optional project with original private reports')
    args = parser.parse_args()
    evidence = json.loads((HERE / 'evidence.json').read_text())
    for name, expected in evidence['export_sha256'].items():
        require(sha(HERE / name) == expected, 'Export changed: ' + name)
    rows = json.loads((HERE / 'paired-development.json').read_text())
    require(len(rows) == 208 and len({(r['cohort'], r['case_id']) for r in rows}) == 208,
            'Expected 208 distinct paired cases')
    supported = [r for r in rows if r['expected_intent'] is not None]
    require(len(supported) == 195, 'Expected 195 intent-labeled cases')
    summary = {}
    for model in ['base', 'adapter']:
        def correct(r, label):
            p = r[model + '_prediction']
            return p is not None and p[label] == r['expected_' + label]
        category = sum(correct(r, 'category') for r in rows)
        intent = sum(correct(r, 'intent') for r in supported)
        require(category == evidence['comparison'][model + '_category_correct'], 'Category score differs')
        require(intent == evidence['comparison'][model + '_intent_correct'], 'Intent score differs')
        summary[model] = {'category': [category, len(rows)], 'intent': [intent, len(supported)],
                          'invalid_outputs': sum(r[model + '_prediction'] is None for r in rows)}
    with (HERE / 'training-loss.csv').open() as f:
        losses = list(csv.DictReader(f))
    require([int(r['step']) for r in losses] == list(range(1, 731)), 'Training steps not 1..730')
    require(all(math.isfinite(float(r['response_only_loss'])) for r in losses), 'Nonfinite loss')
    if args.source_root:
        for name, expected in evidence['original_source_sha256'].items():
            require(sha(args.source_root / name) == expected, 'Original report changed: ' + name)
    result = {'development_scores': summary, 'ordered_training_steps': len(losses),
              'original_reports_checked': bool(args.source_root),
              'adapter_check': adapter_check(args.adapter, evidence) if args.adapter else 'not requested',
              'qualification_passed': False,
              'scope': evidence['scope']}
    print(json.dumps(result, indent=2))

if __name__ == '__main__':
    main()
