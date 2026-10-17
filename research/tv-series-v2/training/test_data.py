import json
import unittest
from pathlib import Path
from run import validate, HERE

class FrozenData(unittest.TestCase):
    def test_train_and_tests_disjoint_and_schema_valid(self):
        data=[json.loads((HERE/n).read_text()) for n in ['train.json','series-holdout.json','retention.json']]
        self.assertEqual([len(x) for x in data],[200,32,48])
        sets=[]
        for rows in data:
            self.assertEqual(len(rows),len({r['id'] for r in rows}))
            sets.append({' '.join(r['text'].casefold().split()) for r in rows})
            for r in rows: validate({k:r[k] for k in ['category','intent']})
        self.assertFalse(sets[0]&sets[1]);self.assertFalse(sets[0]&sets[2]);self.assertFalse(sets[1]&sets[2])
    def test_legacy_boundary_minimal_pair_is_explicit(self):
        rows=json.loads((HERE/'train.json').read_text())
        pair={r['text']:r['intent'] for r in rows}
        self.assertEqual(pair['That movie was wonderful, but I have not said its title.'],'clarify')
        self.assertEqual(pair['The film Arrival is wonderful.'],'reaction')

if __name__=='__main__':unittest.main()
