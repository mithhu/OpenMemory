import hashlib,json,sys,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from summarize import metric,compare
from run import validate
class RepairTests(unittest.TestCase):
 def test_explicit_labels_and_counts(self):
  train=json.loads((HERE/'train.json').read_text());test=json.loads((HERE/'qualification.json').read_text())
  self.assertEqual(len(train),196);self.assertEqual(len(test),48)
  for r in train+test:validate(r['expected'])
  normalized=[' '.join(r['note'].casefold().split()) for r in train+test]
  self.assertEqual(len(normalized),len(set(normalized)))
  self.assertEqual(len({r['expected']['category'] for r in test}),11)
 def test_previous_qualification_not_reused_as_fresh(self):
  current=json.loads((HERE/'qualification.json').read_text());old=json.loads((HERE.parent/'experiment-01/qualification.json').read_text())
  norm=lambda s:' '.join(s.casefold().split())
  self.assertFalse({norm(r['note']) for r in current}&{norm(r['note']) for r in old})
 def test_public_text_unchanged_and_not_in_training(self):
  raw=json.loads((HERE/'public-nominations.json').read_text());labeled=json.loads((HERE/'public-qualification.json').read_text())
  self.assertEqual([r['note'] for r in raw],[r['note'] for r in labeled])
  self.assertEqual(len(labeled),24);self.assertEqual(sum(r['expected'] is not None for r in labeled),16)
  train=json.loads((HERE/'train.json').read_text())
  self.assertFalse({r['note'] for r in labeled}&{r['note'] for r in train})
  for r in labeled:
   if r['expected'] is not None:validate(r['expected'])
 def test_invalid_output_never_gets_full_credit(self):
  gold={'category':'BOOK','intent':None,'clarificationReasons':['missing_action']}
  row={'id':'x','gold':gold,'prediction':None,'parsed':{'category':'BOOK','intent':None,'clarificationReasons':[]}}
  self.assertEqual(metric([row])['correct'],0)
  self.assertEqual(metric([row],'category')['correct'],1)
  fixed={**row,'parsed':gold,'prediction':gold}
  self.assertEqual(compare([row],[fixed])['gains'],['x'])
if __name__=='__main__':unittest.main()
