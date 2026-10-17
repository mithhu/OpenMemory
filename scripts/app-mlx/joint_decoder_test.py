"""Contract equivalence and branch isolation, with no model/GPU dependency."""
import json,unittest
from joint_decoder import JointDecoder,valid_outputs
from classification_contract import CATEGORIES,INTENTS,validate_prediction
class Tokenizer:
    eos_token_ids={1000,1001}
    def encode(self,s,add_special_tokens=False):return list(s.encode())
    def decode(self,ids):return bytes(ids).decode()
class Tests(unittest.TestCase):
    def test_exact_existing_contract(self):
        expected=[]
        for c in CATEGORIES:
            for i in INTENTS:
                try:expected.append(validate_prediction({'category':c,'intent':i}))
                except ValueError:pass
        self.assertEqual([json.loads(x) for x in valid_outputs()],expected)
        self.assertEqual(len(expected),73)
    def test_all_paths_and_contradictory_branch(self):
        t=Tokenizer();d=JointDecoder(t,3)
        for s in valid_outputs():
            ids=t.encode(s)
            for i,token in enumerate(ids):self.assertIn(token,d.allowed(ids[:i]))
            self.assertEqual(d.allowed(ids),[1000,1001])
            self.assertEqual(d.allowed(ids+[1000]),[1000,1001])
        prefix=t.encode('{"category":"MOVIE","intent":"')
        self.assertNotIn(ord('m'),d.allowed(prefix))
        with self.assertRaises(ValueError):d.allowed([999])
    def test_tokenizer_round_trip_is_required(self):
        class Broken(Tokenizer):
            def decode(self,ids):return 'changed'
        with self.assertRaises(ValueError):JointDecoder(Broken(),1)
if __name__=='__main__':unittest.main()
