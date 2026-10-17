"""Development-only v4 structural decoder. No source heuristics or save authority.

Allows the frozen v4 validator's full semantic label space, including all unique
reason orderings. It guarantees structure when generation reaches EOS, not that
labels describe the user's note correctly. Not wired into the production worker.
"""
import itertools
import json
from pathlib import Path

SPEC = json.loads((Path(__file__).with_name('classification_advice_v4.json')).read_text())


def validate_advice_v4(value):
    if not isinstance(value, dict) or set(value) != {'category', 'intent', 'clarificationReasons'}:
        raise ValueError('Expected exactly the v4 advice fields')
    props = SPEC['schema']['properties']
    if value['category'] not in props['category']['enum'] or value['intent'] not in props['intent']['enum']:
        raise ValueError('Unsupported v4 label')
    reasons = value['clarificationReasons']
    valid_reasons = props['clarificationReasons']['items']['enum']
    if (not isinstance(reasons, list) or len(reasons) > 3 or
            any(not isinstance(r, str) or r not in valid_reasons for r in reasons) or
            len(set(reasons)) != len(reasons)):
        raise ValueError('Reasons must be unique supported values')
    if (value['category'] == 'MIXED') != (value['intent'] == 'mixed'):
        raise ValueError('Mixed category and action must agree')
    if value['intent'] is None and not reasons:
        raise ValueError('Unknown action needs a clarification reason')
    if 'missing_action' in reasons and value['intent'] is not None:
        raise ValueError('A missing action cannot also be known')
    return value


def valid_outputs():
    props = SPEC['schema']['properties']
    reasons = props['clarificationReasons']['items']['enum']
    for category, intent in itertools.product(props['category']['enum'], props['intent']['enum']):
        for size in range(len(reasons) + 1):
            for ordered in itertools.permutations(reasons, size):
                value = {'category': category, 'intent': intent, 'clarificationReasons': list(ordered)}
                try:
                    validate_advice_v4(value)
                except ValueError:
                    continue
                yield json.dumps(value, separators=(',', ':'))


class AdviceLanguageV4:
    """Compile once per tokenizer/model. Contains no note, KV cache or prediction."""
    def __init__(self, tokenizer):
        self.eos = frozenset(tokenizer.eos_token_ids)
        if not self.eos:
            raise ValueError('Tokenizer must expose stop tokens')
        self.trie = {}
        self.max_output_tokens = 0
        self.output_count = 0
        for output in valid_outputs():
            tokens = tokenizer.encode(output, add_special_tokens=False)
            if tokenizer.decode(tokens) != output or self.eos.intersection(tokens):
                raise ValueError('Output tokenizer round trip failed')
            self.max_output_tokens = max(self.max_output_tokens, len(tokens))
            self.output_count += 1
            node = self.trie
            for token in tokens:
                node = node.setdefault(token, {})
            for token in self.eos:
                node[token] = {}

    def processor(self, prompt_length):
        return AdviceProcessorV4(self, prompt_length)


class AdviceProcessorV4:
    """Fresh request boundary; position derives only from supplied token history."""
    def __init__(self, language, prompt_length):
        if not isinstance(prompt_length, int) or prompt_length < 0:
            raise ValueError('Invalid prompt boundary')
        self.language = language
        self.prompt_length = prompt_length

    def allowed(self, generated):
        node = self.language.trie
        for token in generated:
            if token not in node:
                raise ValueError('Token outside v4 structural language')
            node = node[token]
        # MLX may ask for one speculative token beyond EOS.
        return sorted(node) if node else sorted(self.language.eos)

    def __call__(self, tokens, logits):
        import mlx.core as mx
        if len(tokens) < self.prompt_length:
            raise ValueError('Incomplete prompt')
        allowed = self.allowed(tokens[self.prompt_length:].tolist())
        mask = mx.full(logits.shape, -float('inf'), dtype=logits.dtype)
        mask[..., mx.array(allowed)] = 0
        return logits + mask
