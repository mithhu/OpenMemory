"""Experimental finite-output decoder; not enabled in the app until evaluated.

Preserves the existing validator's label space exactly. It prevents malformed
JSON and contradictory MIXED labels, not semantic errors. No input heuristics,
label rewriting, prompt modification, or weight updates.
"""
import json
from classification_contract import CATEGORIES, INTENTS, validate_prediction


def valid_outputs():
    outputs = []
    for category in CATEGORIES:
        for intent in INTENTS:
            value = {'category': category, 'intent': intent}
            try:
                validate_prediction(value)
            except ValueError:
                continue
            outputs.append(json.dumps(value, separators=(',', ':')))
    return outputs


class JointDecoder:
    """Fresh instance per request. MLX logits processor over a token trie.

    Uses full supplied token history to derive its position, so speculative
    generation and repeated calls do not advance mutable decoder state.
    """
    def __init__(self, tokenizer, prompt_length):
        self.prompt_length = prompt_length
        self.trie = {}
        self.eos = set(tokenizer.eos_token_ids)
        if not self.eos:
            raise ValueError('Tokenizer must expose stop tokens')
        for output in valid_outputs():
            ids = tokenizer.encode(output, add_special_tokens=False)
            if tokenizer.decode(ids) != output or self.eos.intersection(ids):
                raise ValueError('Output tokenizer round trip failed')
            node = self.trie
            for token in ids:
                node = node.setdefault(token, {})
            for token in self.eos:
                node[token] = {}

    def allowed(self, generated):
        node = self.trie
        for token in generated:
            if token not in node:
                raise ValueError('Decoder received a token outside its language')
            node = node[token]
        if not node:
            return sorted(self.eos)  # MLX computes one speculative token past EOS.
        return sorted(node)

    def __call__(self, tokens, logits):
        import mlx.core as mx
        if len(tokens) < self.prompt_length:
            raise ValueError('Incomplete prompt in logits processor')
        allowed = self.allowed(tokens[self.prompt_length:].tolist())
        mask = mx.full(logits.shape, -float('inf'), dtype=logits.dtype)
        mask[..., mx.array(allowed)] = 0
        return logits + mask
