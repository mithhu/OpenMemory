import json
import unittest
from advice_decoder_v4 import AdviceLanguageV4, valid_outputs, validate_advice_v4

class Tokenizer:
    eos_token_ids = {1000, 1001}
    def encode(self, value, add_special_tokens=False): return list(value.encode())
    def decode(self, tokens): return bytes(tokens).decode()

class Tests(unittest.TestCase):
    def test_full_label_space_and_reason_orderings(self):
        outputs = list(valid_outputs())
        self.assertEqual(len(outputs), 455)  # 9*(7*5 + 15) + 5 MIXED variants.
        self.assertEqual(len(set(outputs)), len(outputs))
        for output in outputs: validate_advice_v4(json.loads(output))
        for reasons in [['missing_identity','missing_action'],['missing_action','missing_identity']]:
            self.assertIn(json.dumps({'category':'BOOK','intent':None,'clarificationReasons':reasons},separators=(',',':')),outputs)

    def test_every_complete_token_path_and_fresh_request(self):
        tok=Tokenizer();language=AdviceLanguageV4(tok)
        first=language.processor(3);second=language.processor(20)
        for output in valid_outputs():
            tokens=tok.encode(output)
            for i,token in enumerate(tokens):self.assertIn(token,first.allowed(tokens[:i]))
            self.assertEqual(first.allowed(tokens),[1000,1001])
            self.assertEqual(first.allowed(tokens+[1000]),[1000,1001])
        self.assertEqual(first.allowed([]),second.allowed([]))
        with self.assertRaises(ValueError):first.allowed([999])

    def test_inconsistent_and_duplicate_branches_are_unreachable(self):
        tok=Tokenizer();d=AdviceLanguageV4(tok).processor(0)
        self.assertNotIn(ord('w'),d.allowed(tok.encode('{"category":"MIXED","intent":"')))
        self.assertNotIn(ord('u'),d.allowed(tok.encode('{"category":"BOOK","intent":"n')))
        # A known action can have identity/reference uncertainty, but not missing_action.
        prefix='{"category":"BOOK","intent":"start","clarificationReasons":["missing_'
        self.assertNotIn(ord('a'),d.allowed(tok.encode(prefix)))
        # Duplicate reason is not in any legal language output.
        bad={'category':'MIXED','intent':'mixed','clarificationReasons':['missing_identity']*2}
        with self.assertRaises(ValueError):validate_advice_v4(bad)

    def test_round_trip_and_eos_and_boundary_required(self):
        class Broken(Tokenizer):
            def decode(self,tokens):return 'changed'
        with self.assertRaises(ValueError):AdviceLanguageV4(Broken())
        class NoEos(Tokenizer):eos_token_ids=set()
        with self.assertRaises(ValueError):AdviceLanguageV4(NoEos())
        with self.assertRaises(ValueError):AdviceLanguageV4(Tokenizer()).processor(-1)

if __name__=='__main__':unittest.main()
