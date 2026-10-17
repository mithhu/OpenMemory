import json
import unittest
from pathlib import Path
from structured_advice_v5 import validate, semantic_key

class StructuredAdvice(unittest.TestCase):
    def test_development_labels_valid(self):
        rows=json.loads((Path(__file__).resolve().parents[2]/'research/structured-advice-v5/development.json').read_text())
        self.assertEqual(len(rows),32)
        for row in rows: validate(row['expected'])
    def test_known_action_and_missing_identity_coexist(self):
        for intent in ['reaction','wishlist','complete','progress','listen']:
            self.assertEqual(validate({'category':'BOOK','intent':intent,'clarificationReasons':['missing_identity']})['intent'],intent)
    def test_wrong_shape_and_contradictions_are_rejected(self):
        for value in [
            {'category':'MOVIE','intent':'clarify'},
            {'category':'BOOK','intent':None,'clarificationReasons':[]},
            {'category':'BOOK','intent':'complete','clarificationReasons':['missing_action']},
            {'category':'SERIES','intent':'progress','clarificationReasons':['missing_identity','missing_identity']},
            {'category':'SERIES','intent':'progress','clarificationReasons':['legacy_uncertainty']},
            {'category':'MIXED','intent':'none','clarificationReasons':[]},
        ]:
            with self.assertRaises(ValueError):validate(value)
    def test_reason_order_does_not_change_semantic_score(self):
        a={'category':'MOVIE','intent':None,'clarificationReasons':['missing_identity','missing_action']}
        b={**a,'clarificationReasons':list(reversed(a['clarificationReasons']))}
        self.assertEqual(semantic_key(a),semantic_key(b))

if __name__=='__main__':unittest.main()
