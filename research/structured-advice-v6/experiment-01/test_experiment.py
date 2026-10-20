import copy,json,sys,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import summarize
class ExperimentTests(unittest.TestCase):
 def setUp(self):
  self.gold=json.loads((HERE/'qualification.json').read_text())+json.loads((HERE/'public-qualification.json').read_text())
  self.perfect=[{'id':r['id'],'gold':r['expected'],'subset':r['slice'],'prediction':r['expected'] or {'category':'NOTE','intent':'none','clarificationReasons':[]},'parsed':r['expected'] or {'category':'NOTE','intent':'none','clarificationReasons':[]},'latencySeconds':1} for r in self.gold]
 def test_fixed_counts_diverse_slices_and_no_overlap(self):
  train=json.loads((HERE/'train.json').read_text());norm=lambda t:' '.join(t.casefold().split())
  self.assertEqual(len(train),211);self.assertEqual(len(self.gold),72)
  self.assertEqual(sum(r['expected'] is not None for r in self.gold),67)
  self.assertEqual(sum(r['slice']=='series' for r in self.gold),16)
  self.assertEqual(len({r['expected']['category'] for r in self.gold if r['expected']}),11)
  self.assertFalse({norm(r['note']) for r in train}&{norm(r['note']) for r in self.gold})
 def test_public_text_and_provenance_preserved(self):
  nom=json.loads((HERE/'public-nominations.json').read_text());public=json.loads((HERE/'public-qualification.json').read_text())
  self.assertEqual([r['note'] for r in nom],[r['note'] for r in public])
  self.assertTrue(all(''.join(s['text'] for s in r['sourceSlots'])==r['note'] for r in public))
 def test_missing_predictions_fail_closed(self):
  data={m:copy.deepcopy(self.perfect) for m in summarize.MODELS};data['candidate'].pop()
  with self.assertRaises(ValueError):summarize.summarize(data)
 def test_invalid_unscored_and_partial_completion_reject(self):
  data={m:copy.deepcopy(self.perfect) for m in summarize.MODELS}
  target=next(r for r in data['candidate'] if r['gold'] and r['gold']['category']=='LESSON' and r['gold']['intent']=='progress')
  target['prediction']=target['parsed']={**target['gold'],'intent':'complete'}
  result=summarize.summarize(data)
  self.assertFalse(result['gates']['no_partial_series_or_course_false_completion'])
  self.assertEqual(result['falseCompletionIds'],[target['id']])
  self.assertFalse(result['qualifiedForAppCompatibilityChecks'])
  row=next(r for r in data['candidate'] if r['gold'] is None);row['prediction']=None
  self.assertFalse(summarize.summarize(data)['gates']['zero_contract_invalid_including_unscored'])
if __name__=='__main__':unittest.main()
