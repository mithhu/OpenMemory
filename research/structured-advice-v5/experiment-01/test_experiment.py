import json,sys,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from summarize import metric,compare,wilson
from run import validate,semantic_key
class ExperimentTests(unittest.TestCase):
    def test_labels_and_disjoint_notes(self):
        train=json.loads((HERE/'train.json').read_text());test=json.loads((HERE/'qualification.json').read_text())
        self.assertEqual(len(train),132);self.assertEqual(len(test),48)
        for r in train+test:validate(r['expected'])
        notes=[' '.join(r['note'].casefold().split()) for r in train+test]
        self.assertEqual(len(notes),len(set(notes)))
        for group in [train,test]:self.assertEqual(len(set(r['expected']['category'] for r in group)),11)
    def test_invalid_does_not_erase_partial_metrics_or_get_joint_credit(self):
        gold={'category':'BOOK','intent':'reaction','clarificationReasons':['missing_identity']}
        row={'id':'1','gold':gold,'prediction':None,'parsed':{'category':'BOOK','intent':'reaction'}}
        self.assertEqual(metric([row],'category')['correct'],1)
        self.assertEqual(metric([row],'intent')['correct'],1)
        self.assertEqual(metric([row])['correct'],0)
        fixed={**row,'prediction':gold,'parsed':gold}
        self.assertEqual(compare([row],[fixed])['gains'],['1'])
        self.assertEqual(compare([fixed],[row])['losses'],['1'])
    def test_reason_order(self):
        a={'category':'BOOK','intent':None,'clarificationReasons':['missing_identity','missing_action']}
        b={**a,'clarificationReasons':list(reversed(a['clarificationReasons']))}
        self.assertEqual(semantic_key(a),semantic_key(b))
    def test_wilson_bounds(self):
        low,high=wilson(5,10);self.assertLess(low,.5);self.assertGreater(high,.5)
        self.assertEqual(wilson(0,0),None)
if __name__=='__main__':unittest.main()
