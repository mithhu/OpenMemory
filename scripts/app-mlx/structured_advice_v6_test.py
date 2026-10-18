import hashlib,json,unittest
from pathlib import Path
from structured_advice_v6 import validate
ROOT=Path(__file__).resolve().parents[2]

def advice(category,intent,reasons=None):return {'category':category,'intent':intent,'clarificationReasons':reasons or []}
class StructuredAdviceV6(unittest.TestCase):
 def test_generic_requests_keep_their_known_wish(self):
  for category in ['MOVIE','SERIES','BOOK','MUSIC','LESSON','WISHLIST']:
   self.assertEqual(validate(advice(category,'wishlist'))['clarificationReasons'],[])
 def test_known_actions_and_independent_references(self):
  validate(advice('MUSIC','wishlist',['unresolved_reference']))
  validate(advice('NOTE','wishlist',['unresolved_reference']))
  validate(advice('BOOK','reaction',['missing_identity']))
  validate(advice('LESSON','progress',['missing_identity']))
 def test_impossible_category_action_pairs_rejected(self):
  for value in [advice('BOOK','listen'),advice('LESSON','none'),advice('MOVIE','none'),advice('MUSIC','complete'),advice('PERSON','wishlist'),advice('WISHLIST','reaction'),advice('NOTE','complete')]:
   with self.subTest(value=value),self.assertRaises(ValueError):validate(value)
 def test_nonmedia_plans_do_not_acquire_media_questions(self):
  for reasons in [['missing_identity'],['missing_action'],['missing_identity','missing_action']]:
   with self.assertRaises(ValueError):validate(advice('WISHLIST','wishlist',reasons))
  validate(advice('WISHLIST','wishlist',['unresolved_reference']))
 def test_unknown_media_action_requires_the_specific_reason(self):
  for category in ['BOOK','MOVIE','SERIES','LESSON','MUSIC']:
   validate(advice(category,None,['missing_action']))
   validate(advice(category,None,['missing_identity','missing_action']))
   for value in [advice(category,None),advice(category,None,['missing_identity']),advice(category,'wishlist',['missing_action'])]:
    with self.assertRaises(ValueError):validate(value)
 def test_mixed_router_can_preserve_component_unknowns(self):
  for reasons in [[],['missing_action'],['missing_identity','missing_action','unresolved_reference']]:
   validate(advice('MIXED','mixed',reasons))
  with self.assertRaises(ValueError):validate(advice('MIXED','wishlist'))
 def test_unknown_reference_is_not_an_ordinary_fact(self):
  validate(advice('NOTE',None,['unresolved_reference']))
  for value in [advice('NOTE','none',['unresolved_reference']),advice('NOTE',None),advice('NOTE','wishlist')]:
   with self.assertRaises(ValueError):validate(value)
 def test_corrected_data_and_migration_are_explicit(self):
  p=ROOT/'research/structured-advice-v6'
  data=json.loads((p/'train-reviewed-v6.json').read_text());self.assertEqual(len(data),196)
  migration=json.loads((p/'label-migration.json').read_text());self.assertEqual(migration['changed'],23)
  for row in data:validate(row['expected'])
  byid={r['id']:r for r in data}
  self.assertEqual(byid['v5-r2-repair-023']['expected']['clarificationReasons'],['missing_identity'])
  self.assertEqual(byid['structured-v5-development-009']['expected'],advice('MOVIE','wishlist'))
  self.assertEqual(byid['structured-v5-development-025']['expected'],advice('MUSIC','wishlist',['unresolved_reference']))
 def test_public_wording_is_kept_and_ambiguous_rows_not_trained(self):
  p=ROOT/'research/structured-advice-v6'
  rows=json.loads((p/'public-development-labels.json').read_text());mix=json.loads((p/'train-provisional-mixture-v6.json').read_text())
  self.assertEqual(len(rows),24);self.assertEqual(len(mix),211)
  ids={r['id'] for r in mix}
  for row in rows:
   self.assertEqual(row['note'],''.join(chunk['text'] for chunk in row['sourceSlots']))
   if row['expected'] is None:self.assertNotIn(row['id'],ids)
   else:self.assertIn(row['id'],ids);validate(row['expected'])
  old=json.loads((ROOT/'research/structured-advice-v5/experiment-02/public-qualification.json').read_text())
  self.assertFalse({r['id'] for r in rows}&{r['id'] for r in old})
 def test_frozen_v5_experiments_remain_unchanged(self):
  for name in ['experiment-01','experiment-02']:
   p=ROOT/'research/structured-advice-v5'/name
   for file,expected in json.loads((p/'recipe.json').read_text())['files_sha256'].items():
    self.assertEqual(hashlib.sha256((p/file).read_bytes()).hexdigest(),expected,file)
if __name__=='__main__':unittest.main()
