import unittest
from summarize import summarize

class PairedScoring(unittest.TestCase):
    def setUp(self):
        self.cases=[{'id':'show','category':'SERIES','intent':'progress'},{'id':'old','category':'BOOK','intent':'progress'}]
        self.rows=[{'id':r['id'],'subset':subset,'gold':{k:r[k] for k in ['category','intent']},'prediction':None} for r,subset in zip(self.cases,['series','retention'])]
    def test_invalid_outputs_remain_in_denominators(self):
        result=summarize(self.rows,self.rows,self.cases)
        self.assertEqual(result['series']['candidate']['total'],1)
        self.assertEqual(result['series']['candidate']['invalid'],1)
        self.assertEqual(result['series']['candidate']['jointCorrect'],0)
        self.assertFalse(result['eligibleForFurtherQualification'])
    def test_incomplete_or_reordered_pairs_fail(self):
        for bad in [self.rows[:-1],list(reversed(self.rows))]:
            with self.assertRaises(ValueError): summarize(self.rows,bad,self.cases)
    def test_new_gain_does_not_hide_old_loss(self):
        import copy
        parent=copy.deepcopy(self.rows);candidate=copy.deepcopy(self.rows)
        parent[1]['prediction']=parent[1]['gold'];candidate[0]['prediction']=candidate[0]['gold']
        result=summarize(parent,candidate,self.cases)
        self.assertEqual(result['series']['gains'],['show'])
        self.assertEqual(result['retention']['losses'],['old'])
        self.assertFalse(result['productionPromoted'])

if __name__=='__main__':unittest.main()
