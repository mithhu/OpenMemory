import unittest
from classification_output import classify_output
from classification_contract import validate_prediction
from classify import strict

class Tests(unittest.TestCase):
    def run_case(self,values):
        calls=[]
        def generate(constrained):
            calls.append(constrained)
            value=values[len(calls)-1]
            if isinstance(value,Exception):raise value
            return value
        return calls,lambda:classify_output(generate,lambda raw:validate_prediction(strict(raw)))
    def test_valid_semantic_mistake_is_not_rewritten(self):
        calls,run=self.run_case(['{"category":"BOOK","intent":"clarify"}'])
        self.assertEqual(run(),({'category':'BOOK','intent':'clarify'},False));self.assertEqual(calls,[False])
    def test_contradiction_gets_one_retry(self):
        calls,run=self.run_case(['{"category":"MOVIE","intent":"mixed"}','{"category":"MOVIE","intent":"wishlist"}'])
        self.assertEqual(run(),({'category':'MOVIE','intent':'wishlist'},True));self.assertEqual(calls,[False,True])
    def test_duplicate_json_field_is_invalid(self):
        calls,run=self.run_case(['{"category":"MOVIE","category":"BOOK","intent":"clarify"}','{"category":"BOOK","intent":"clarify"}'])
        self.assertTrue(run()[1]);self.assertEqual(calls,[False,True])
    def test_retry_cannot_loop(self):
        calls,run=self.run_case(['bad','also bad'])
        with self.assertRaises(ValueError):run()
        self.assertEqual(calls,[False,True])
    def test_inference_failure_does_not_retry(self):
        calls,run=self.run_case([RuntimeError('GPU unavailable')])
        with self.assertRaises(RuntimeError):run()
        self.assertEqual(calls,[False])
if __name__=='__main__':unittest.main()
