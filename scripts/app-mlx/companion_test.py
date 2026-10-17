"""CPU-only HTTP boundary tests. No model, network provider, or GPU is used."""
import http.client
import json
import threading
import unittest
from unittest.mock import patch
import companion

ORIGIN = companion.DEFAULT_ORIGIN
RESULT = {'advice': {'category': 'WISHLIST', 'intent': 'wishlist'}, 'adapterSha256': companion.classify.ADAPTER_SHA, 'seconds': 1.2, 'totalSeconds': 1.3, 'peakBytes': 100}


class CompanionTests(unittest.TestCase):
    def setUp(self):
        self.notes = []
        self.now = 1000
        def classify(text):
            self.notes.append(text)
            return RESULT
        self.state = companion.CompanionState([ORIGIN, 'http://localhost:3005'], classify, lambda: True, lambda: self.now, lease_factory=lambda: None)
        self.server = companion.CompanionServer(self.state, 0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, method, path, data=None, origin=ORIGIN, token=None, extra=None, raw=None):
        headers = {'Content-Type': 'application/json'}
        if origin is not None:
            headers['Origin'] = origin
        if token:
            headers['Authorization'] = 'Bearer ' + token
        headers.update(extra or {})
        if path == '/classify' and isinstance(data, dict) and 'captureId' not in data:
            data = {**data, 'captureId': 'a' * 32}
        body = raw if raw is not None else json.dumps(data) if data is not None else None
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=2)
        connection.request(method, path, body, headers)
        response = connection.getresponse()
        payload = response.read().decode()
        result = (response.status, dict(response.getheaders()), payload)
        connection.close()
        return result

    def paired_token(self):
        code = self.state.reveal_code()
        status, _, body = self.request('POST', '/pair', {'code': code})
        self.assertEqual(status, 200)
        return json.loads(body)['token']

    def test_status_reports_identity_without_inference(self):
        status, headers, body = self.request('GET', '/status')
        value = json.loads(body)
        self.assertEqual(status, 200)
        self.assertTrue(value['ready'])
        self.assertEqual(value['contractVersion'], 3)
        self.assertFalse(value['paired'])
        self.assertEqual(headers['Access-Control-Allow-Origin'], ORIGIN)
        self.assertEqual(self.notes, [])

    def test_local_pair_page_requires_explicit_reveal(self):
        status, _, body = self.request('GET', '/', origin=None)
        self.assertEqual(status, 200)
        self.assertIsNone(self.state.code)
        self.assertIn('Reveal a new pairing code', body)
        status, _, body = self.request('GET', '/?reveal=1', origin=None)
        self.assertEqual(status, 200)
        self.assertIn(self.state.code, body)
        self.assertEqual(self.request('GET', '/?reveal=1')[0], 404)
        self.assertEqual(self.request('GET', '/?reveal=1', origin=None, extra={'Sec-Fetch-Site': 'cross-site'})[0], 403)

    def test_bad_origin_and_dns_rebinding_rejected(self):
        self.assertEqual(self.request('GET', '/status', origin='https://evil.test')[0], 403)
        self.assertEqual(self.request('GET', '/status', extra={'Host': 'evil.test'})[0], 403)
        self.assertEqual(self.request('POST', '/pair', {'code': 'x'}, origin=None)[0], 403)

    def test_pair_single_use_and_bound_origin(self):
        code = self.state.reveal_code()
        status, _, body = self.request('POST', '/pair', {'code': code})
        token = json.loads(body)['token']
        self.assertEqual(json.loads(body)['expiresAt'], 4600)
        self.assertEqual(self.request('POST', '/pair', {'code': code})[0], 401)
        self.assertEqual(self.request('POST', '/classify', {'text': 'A visit'}, token=token, origin='http://localhost:3005')[0], 401)
        status, _, body = self.request('GET', '/status', token=token)
        self.assertTrue(json.loads(body)['paired'])

    def test_expired_pair_code_and_session(self):
        code = self.state.reveal_code()
        self.now += 301
        self.assertEqual(self.request('POST', '/pair', {'code': code})[0], 401)
        token = self.paired_token()
        self.now += 3601
        self.assertEqual(self.request('POST', '/classify', {'text': 'A visit'}, token=token)[0], 401)
        self.assertFalse(json.loads(self.request('GET', '/status', token=token)[2])['paired'])

    def test_classify_requires_pair_and_validates_result(self):
        self.assertEqual(self.request('POST', '/classify', {'text': 'A visit'})[0], 401)
        token = self.paired_token()
        status, _, body = self.request('POST', '/classify', {'text': 'I want to visit Japan'}, token=token)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {**RESULT, 'captureId': 'a' * 32})
        self.assertEqual(self.notes, ['I want to visit Japan'])

    def test_capture_reservation_retained_until_owner_releases(self):
        token = self.paired_token()
        self.assertEqual(self.request('POST', '/classify', {'text': 'A visit'}, token=token)[0], 200)
        self.assertEqual(self.request('POST', '/classify', {'text': 'Another', 'captureId': 'b' * 32}, token=token)[0], 409)
        other = self.paired_token()
        self.request('POST', '/release', {'captureId': 'a' * 32}, token=other)
        self.assertTrue(self.state.busy.locked())
        self.now += 3601
        self.assertEqual(self.request('POST', '/release', {'captureId': 'a' * 32}, token=token)[0], 200)
        self.assertFalse(self.state.busy.locked())

    def test_release_during_gpu_work_defers_unlock_until_finish(self):
        owner = 'Bearer ' + self.paired_token()
        self.assertTrue(self.state.begin_capture('a' * 32, owner, ORIGIN))
        self.assertTrue(self.state.release_capture('a' * 32, owner, ORIGIN))
        self.assertTrue(self.state.busy.locked())
        self.assertFalse(self.state.finish_capture())
        self.assertFalse(self.state.busy.locked())

    def test_early_cancellation_prevents_late_classify(self):
        token = self.paired_token()
        self.assertEqual(self.request('POST', '/release', {'captureId': 'a' * 32}, token=token)[0], 200)
        self.assertEqual(self.request('POST', '/classify', {'text': 'A visit'}, token=token)[0], 409)
        self.assertEqual(self.notes, [])

    def test_top_level_cross_site_landing_allowed_but_reveal_protected(self):
        extra = {'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document'}
        self.assertEqual(self.request('GET', '/', origin=None, extra=extra)[0], 200)
        self.assertIsNone(self.state.code)
        self.assertEqual(self.request('GET', '/?reveal=1', origin=None, extra=extra)[0], 403)
        self.assertEqual(self.request('GET', '/', origin=None, extra={**extra, 'Sec-Fetch-Dest': 'iframe'})[0], 403)

    def test_lease_takeover_failure_releases_reservation(self):
        def fail():
            raise BlockingIOError('Another native worker won the lease')
        self.state.lease_factory = fail
        token = self.paired_token()
        self.assertEqual(self.request('POST', '/classify', {'text': 'A visit'}, token=token)[0], 503)
        self.assertFalse(self.state.busy.locked())

    def test_invalid_duplicate_and_oversize_inputs(self):
        token = self.paired_token()
        for data in ({'text': ''}, {'text': 'a' * 1000}, {'text': '😀' * 260}, {'text': 'valid', 'extra': True}, {'text': 2}):
            self.assertEqual(self.request('POST', '/classify', data, token=token)[0], 400)
        self.assertEqual(self.request('POST', '/classify', token=token, raw='{"text":"a","text":"b"}')[0], 400)
        self.assertEqual(self.request('POST', '/classify', token=token, raw='a' * 4097)[0], 400)
        self.assertEqual(self.notes, [])

    def test_busy_lock_prevents_parallel_inference(self):
        token = self.paired_token()
        self.state.busy.acquire()
        try:
            self.assertEqual(self.request('POST', '/classify', {'text': 'A visit'}, token=token)[0], 409)
        finally:
            self.state.busy.release()
        self.assertEqual(self.notes, [])

    def test_failure_sanitized_and_lock_released(self):
        def fail(text):
            raise ValueError('/secret/path with secret note')
        self.state.classifier = fail
        token = self.paired_token()
        status, _, body = self.request('POST', '/classify', {'text': 'A visit'}, token=token)
        self.assertEqual(status, 503)
        self.assertNotIn('secret', body)
        self.assertTrue(self.state.busy.acquire(False))
        self.state.busy.release()

    def test_wrong_adapter_is_rejected(self):
        self.state.classifier = lambda _: {**RESULT, 'adapterSha256': 'wrong'}
        token = self.paired_token()
        self.assertEqual(self.request('POST', '/classify', {'text': 'A visit'}, token=token)[0], 503)

    def test_preflight_restricted_and_private_network_allowed(self):
        status, headers, _ = self.request('OPTIONS', '/classify', extra={'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type, Authorization'})
        self.assertEqual(status, 204)
        self.assertEqual(headers['Access-Control-Allow-Private-Network'], 'true')
        self.assertNotIn('Access-Control-Allow-Credentials', headers)
        self.assertEqual(self.request('OPTIONS', '/classify', extra={'Access-Control-Request-Method': 'DELETE'})[0], 403)
        self.assertEqual(self.request('OPTIONS', '/classify', extra={'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'X-Unknown'})[0], 403)

    def test_unavailable_status_and_pair(self):
        self.state.ready = False
        self.assertFalse(json.loads(self.request('GET', '/status')[2])['ready'])
        self.assertEqual(self.request('POST', '/pair', {'code': self.state.reveal_code()})[0], 503)

    def test_origin_configuration_rejects_wildcards_and_paths(self):
        for value in ('*', 'https://*.example.com', 'https://example.com/', 'https://example.com/path', 'http://example.com', 'https://user:pass@example.com', 'https://example.com?x=y'):
            with self.assertRaises(ValueError):
                companion.validate_origin(value)
        self.assertEqual(companion.validate_origin('http://localhost:3005'), 'http://localhost:3005')

    def test_timeout_kills_and_reaps_before_return(self):
        import subprocess
        from unittest.mock import MagicMock
        process = MagicMock()
        process.pid = 12345
        process.communicate.side_effect = [subprocess.TimeoutExpired('worker', 145), ('', '')]
        with patch.object(companion.subprocess, 'Popen', return_value=process), patch.object(companion.os, 'killpg') as kill:
            with self.assertRaises(ValueError):
                companion.classify_note('A visit')
            kill.assert_called_once_with(12345, companion.signal.SIGKILL)
            self.assertEqual(process.communicate.call_count, 2)


class ReadyHelperTests(unittest.TestCase):
    def assert_helper_rejected(self, filename):
        expected = {
            'adapters.safetensors': companion.classify.ADAPTER_SHA,
            'adapter_config.json': companion.classify.CONFIG_SHA,
            'classification_contract.py': companion.classify.CONTRACT_SHA,
            'joint_decoder.py': companion.classify.JOINT_DECODER_SHA,
            'classification_output.py': companion.classify.OUTPUT_WRAPPER_SHA,
        }
        visited = []
        def digest(path):
            visited.append(path.name)
            return 'changed' if path.name == filename else expected[path.name]
        with patch.object(companion.platform, 'system', return_value='Darwin'), \
             patch.object(companion.platform, 'machine', return_value='arm64'), \
             patch.object(companion.Path, 'is_file', return_value=True), \
             patch.object(companion.classify, 'sha', side_effect=digest), \
             patch.object(companion.classify, 'strict') as parse_manifest:
            with self.assertRaisesRegex(ValueError, 'Pinned local model asset changed'):
                companion.ready_check()
            parse_manifest.assert_not_called()
        self.assertIn(filename, visited)

    def test_changed_decoder_blocks_readiness_before_model_loading(self):
        self.assert_helper_rejected('joint_decoder.py')

    def test_changed_retry_helper_blocks_readiness_before_model_loading(self):
        self.assert_helper_rejected('classification_output.py')


if __name__ == '__main__':
    unittest.main()
