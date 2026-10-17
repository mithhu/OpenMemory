"""Loopback-only, explicitly paired bridge to the existing pinned MLX worker.

Start with Python 3: python scripts/app-mlx/companion.py
No inference starts until a paired website explicitly requests classification.
"""
import argparse
import fcntl
import html
import json
import math
import os
import platform
import re
import secrets
import signal
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

import classify
from classification_contract import validate_prediction

PORT = 8765
DEFAULT_ORIGIN = 'https://open-memory-ai.vercel.app'
MAX_BODY = 4096


def validate_origin(value):
    parsed = urlsplit(value)
    if (parsed.scheme not in ('http', 'https') or not parsed.hostname
            or parsed.username or parsed.password or parsed.path or parsed.query
            or parsed.fragment or '*' in value):
        raise ValueError('Allow an exact website origin, without a path or wildcard')
    if parsed.scheme == 'http' and parsed.hostname not in ('localhost', '127.0.0.1', '::1'):
        raise ValueError('Nonlocal origins must use HTTPS')
    try:
        parsed.port
    except ValueError as error:
        raise ValueError('Invalid origin port') from error
    return value


def ready_check():
    """Validate assets without importing MLX or starting a GPU process."""
    if platform.system() != 'Darwin' or platform.machine() != 'arm64':
        raise ValueError('Native MLX requires an Apple Silicon Mac')
    paths = [
        (classify.ADAPTER / 'adapters.safetensors', classify.ADAPTER_SHA),
        (classify.ADAPTER / 'adapter_config.json', classify.CONFIG_SHA),
        (classify.ROOT / 'scripts/app-mlx/classification_contract.py', classify.CONTRACT_SHA),
        (classify.ROOT / 'scripts/app-mlx/joint_decoder.py', classify.JOINT_DECODER_SHA),
        (classify.ROOT / 'scripts/app-mlx/classification_output.py', classify.OUTPUT_WRAPPER_SHA),
        (classify.ROOT / 'scripts/app-mlx/model-manifest.json',
         'b763acbbd2f8309cd9387da869ac8e26539c091a248d3ae2aa845d15ba84f235'),
    ]
    if not Path(classify.PYTHON).is_file():
        raise ValueError('Local runtime missing')
    for path, digest in paths:
        if classify.sha(path) != digest:
            raise ValueError('Pinned local model asset changed')
    recipe = classify.strict(paths[-1][0].read_text())
    for name, digest in {**recipe['base_weight_sha256'], **recipe['model_metadata_sha256']}.items():
        if classify.sha(classify.ROOT / '.local-runtime/model' / name) != digest:
            raise ValueError('Pinned base model asset changed')
    return True


def classify_note(text):
    # A process group ensures a timed-out worker cannot retain the GPU lease.
    process = subprocess.Popen(
        [classify.PYTHON, str(classify.ROOT / 'scripts/app-mlx/classify.py')],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, start_new_session=True,
        env={key: value for key, value in os.environ.items() if key != 'OPENMEMORY_MLX_TEST'},
    )
    try:
        output, _ = process.communicate(json.dumps({'text': text}, ensure_ascii=False), timeout=145)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.communicate()  # Reap before the HTTP service releases its busy lock.
        raise ValueError('Classification timed out')
    if process.returncode:
        raise ValueError('Local classification unavailable')
    return classify.strict(output)


def checked_result(result):
    if not isinstance(result, dict) or result.get('adapterSha256') != classify.ADAPTER_SHA:
        raise ValueError('Unexpected adapter identity')
    validate_prediction(result.get('advice'))
    for field in ('seconds', 'totalSeconds', 'peakBytes'):
        if field not in result or (isinstance(result[field], bool) or not isinstance(result[field], (int, float))
                                or not math.isfinite(result[field]) or result[field] < 0):
            raise ValueError('Invalid runtime metadata')
    return {key: result[key] for key in ('advice', 'adapterSha256', 'seconds', 'totalSeconds', 'peakBytes') if key in result}


def acquire_global_lease():
    lease = open('/tmp/openmemory-local-model-gpu.lock', 'a+')
    try:
        fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except Exception:
        lease.close()
        raise
    return lease


class CompanionState:
    def __init__(self, origins, classifier=classify_note, readiness=ready_check, clock=time.time, lease_factory=acquire_global_lease):
        self.origins = frozenset(validate_origin(origin) for origin in origins)
        self.classifier = classifier
        self.clock = clock
        self.busy = threading.Lock()
        self.capture_lock = threading.Lock()
        self.capture = None
        self.cancelled_captures = {}
        self.lease_factory = lease_factory
        self.auth_lock = threading.Lock()
        self.code = None
        self.code_expires = 0
        self.sessions = {}
        try:
            self.ready = readiness() is True
        except Exception:
            self.ready = False

    def reveal_code(self):
        with self.auth_lock:
            self.code = secrets.token_urlsafe(24)
            self.code_expires = self.clock() + 300
            return self.code

    def pair(self, code, origin):
        with self.auth_lock:
            if not isinstance(code, str) or len(code) > 128 or not self.code or self.clock() >= self.code_expires:
                return None
            if not secrets.compare_digest(code, self.code):
                return None
            self.code = None
            token = secrets.token_urlsafe(32)
            expires = self.clock() + 3600
            self.sessions = {key: value for key, value in self.sessions.items() if value[1] > self.clock()}
            self.sessions[token] = (origin, expires)
            return {'token': token, 'expiresAt': int(expires)}

    def authorized(self, header, origin):
        if not header or not header.startswith('Bearer '):
            return False
        with self.auth_lock:
            session = self.sessions.get(header[7:])
            return bool(session and session[0] == origin and session[1] > self.clock())


    def begin_capture(self, capture_id, owner, origin):
        with self.capture_lock:
            self.cancelled_captures = {key: expiry for key, expiry in self.cancelled_captures.items() if expiry > self.clock()}
            if (owner, origin, capture_id) in self.cancelled_captures:
                return False
            if not self.busy.acquire(False):
                return False
            self.capture = {'id': capture_id, 'owner': owner, 'origin': origin,
                            'active': True, 'cancelled': False, 'lease': None}
            return True

    def _clear_capture(self):
        if self.capture and self.capture['lease']:
            self.capture['lease'].close()
        self.capture = None
        self.busy.release()

    def finish_capture(self):
        with self.capture_lock:
            self.capture['active'] = False
            if self.capture['cancelled']:
                self._clear_capture()
                return False
            try:
                # Worker releases its lease on exit. Reacquire before extraction.
                # If another local worker wins the gap, refuse extraction safely.
                self.capture['lease'] = self.lease_factory()
            except Exception:
                self._clear_capture()
                raise
            return True

    def fail_capture(self):
        with self.capture_lock:
            if self.capture:
                self._clear_capture()

    def remember_cancel(self, capture_id, owner, origin):
        # Called under capture_lock; bounded idempotency for completed/cancelled IDs.
        self.cancelled_captures = {key: expiry for key, expiry in self.cancelled_captures.items() if expiry > self.clock()}
        if len(self.cancelled_captures) >= 512:
            self.cancelled_captures.pop(next(iter(self.cancelled_captures)))
        self.cancelled_captures[(owner, origin, capture_id)] = self.clock() + 300

    def release_capture(self, capture_id, owner, origin):
        with self.capture_lock:
            capture = self.capture
            if not capture or capture['id'] != capture_id or capture['owner'] != owner or capture['origin'] != origin:
                if not self.authorized(owner, origin):
                    return False
                # Cancellation can race ahead of the classify HTTP handler.
                self.remember_cancel(capture_id, owner, origin)
                return True
            self.remember_cancel(capture_id, owner, origin)
            if capture['active']:
                capture['cancelled'] = True  # Do not unlock an active GPU worker.
            else:
                self._clear_capture()
            return True


class CompanionHandler(BaseHTTPRequestHandler):
    server_version = 'OpenMemoryCompanion'

    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, *args):
        pass  # Do not log URLs, pairing codes, tokens, or notes.

    @property
    def state(self):
        return self.server.state

    def permitted(self, origin_required=False, navigation=False):
        # Reject duplicate headers and unknown Host to prevent DNS rebinding.
        hosts = self.headers.get_all('Host', [])
        origins = self.headers.get_all('Origin', [])
        if len(hosts) != 1 or hosts[0] not in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'):
            return False
        if len(origins) > 1:
            return False
        if not origins:
            return not origin_required and (self.headers.get('Sec-Fetch-Site') not in ('cross-site', 'same-site') or (navigation and self.headers.get('Sec-Fetch-Mode') == 'navigate' and self.headers.get('Sec-Fetch-Dest') == 'document'))
        return origins[0] in self.state.origins

    def respond(self, status, value, content_type='application/json'):
        payload = value.encode() if isinstance(value, str) else json.dumps(value).encode()
        self.send_response(status)
        origin = self.headers.get('Origin')
        if origin in self.state.origins:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; form-action 'none'")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        if not self.permitted(True) or self.path not in ('/status', '/pair', '/classify', '/release'):
            return self.respond(403, {'error': 'Website not allowed'})
        method = self.headers.get('Access-Control-Request-Method')
        expected = 'GET' if self.path == '/status' else 'POST'
        headers = {value.strip().lower() for value in self.headers.get('Access-Control-Request-Headers', '').split(',') if value.strip()}
        if method != expected or not headers.issubset({'content-type', 'authorization'}):
            return self.respond(403, {'error': 'Request not allowed'})
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
        self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', expected)
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()

    def do_GET(self):
        if not self.permitted(navigation=self.path == '/'):
            return self.respond(403, {'error': 'Website not allowed'})
        if self.path == '/status':
            return self.respond(200, {'ready': self.state.ready, 'platform': platform.system(), 'adapterSha256': classify.ADAPTER_SHA, 'contractVersion': 3, 'paired': self.state.authorized(self.headers.get('Authorization'), self.headers.get('Origin'))})
        if self.path not in ('/', '/?reveal=1') or self.headers.get('Origin'):
            return self.respond(404, {'error': 'Not found'})
        code = self.state.reveal_code() if self.path == '/?reveal=1' else None
        content = ('<p>Pair only with your trusted OpenMemory website. This code expires in five minutes and can be used once.</p>'
                   + (f'<p>Your pairing code: <strong>{html.escape(code)}</strong></p>' if code else '')
                   + '<p><a href="/?reveal=1">Reveal a new pairing code</a></p>') if self.state.ready else '<p>Local MLX assets are unavailable. Restore the pinned runtime and restart this service.</p>'
        return self.respond(200, '<!doctype html><meta charset="utf-8"><title>Pair OpenMemory MLX</title><h1>Pair OpenMemory MLX</h1>' + content, 'text/html; charset=utf-8')

    def read_json(self):
        lengths = self.headers.get_all('Content-Length', [])
        if len(lengths) != 1 or not lengths[0].isdigit() or self.headers.get('Transfer-Encoding'):
            raise ValueError('Invalid body length')
        length = int(lengths[0])
        if not 0 < length <= MAX_BODY or self.headers.get_content_type() != 'application/json':
            raise ValueError('Invalid body')
        self.connection.settimeout(10)
        raw = self.rfile.read(length)
        if len(raw) != length:
            raise ValueError('Incomplete body')
        data = classify.strict(raw.decode('utf-8'))
        if not isinstance(data, dict):
            raise ValueError('Expected JSON object')
        return data

    def do_POST(self):
        if not self.permitted(True):
            return self.respond(403, {'error': 'Website not allowed'})
        if self.path not in ('/pair', '/classify', '/release'):
            return self.respond(404, {'error': 'Not found'})
        try:
            data = self.read_json()
        except Exception:
            return self.respond(400, {'error': 'Invalid request. Use a short, nonempty note.'})
        if not self.state.ready:
            return self.respond(503, {'error': 'Local MLX is unavailable. Check the local runtime.'})
        origin = self.headers['Origin']
        if self.path == '/pair':
            result = self.state.pair(data.get('code'), origin) if set(data) == {'code'} else None
            return self.respond(200 if result else 401, result or {'error': 'Pairing code expired or incorrect. Reveal a new code locally.'})
        owner = self.headers.get('Authorization')
        if self.path == '/release':
            capture_id = data.get('captureId')
            if set(data) != {'captureId'} or not isinstance(capture_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{24,128}', capture_id):
                return self.respond(400, {'error': 'Invalid capture reservation'})
            # Owning token can release its existing reservation after expiry.
            released = self.state.release_capture(capture_id, owner, origin)
            return self.respond(200 if released else 409, {'released': released})
        if not self.state.authorized(owner, origin):
            return self.respond(401, {'error': 'Pair this website with your local MLX service again.'})
        text = data.get('text')
        capture_id = data.get('captureId')
        if (set(data) != {'text', 'captureId'} or not isinstance(capture_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{24,128}', capture_id) or not isinstance(text, str) or not text.strip()
                or len(json.dumps({'note': text}, ensure_ascii=False).encode()) > 1000):
            return self.respond(400, {'error': 'Use a short, nonempty note (up to 1000 UTF-8 bytes including formatting).'})
        if not self.state.begin_capture(capture_id, owner, origin):
            return self.respond(409, {'error': 'Local MLX is busy. Wait for the current review to finish.'})
        try:
            result = checked_result(self.state.classifier(text))
            if not self.state.finish_capture():
                return self.respond(409, {'error': 'Review cancelled. Local worker has finished safely.'})
            result['captureId'] = capture_id
        except Exception:
            self.state.fail_capture()
            return self.respond(503, {'error': 'Local MLX could not classify this note. Retry or review manually. Nothing was sent to cloud AI.'})
        try:
            return self.respond(200, result)
        except (BrokenPipeError, ConnectionResetError):
            self.state.release_capture(capture_id, owner, origin)


class CompanionServer(ThreadingHTTPServer):
    daemon_threads = False
    allow_reuse_address = True

    def __init__(self, state, port=PORT):
        self.state = state
        super().__init__(('127.0.0.1', port), CompanionHandler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-origin', action='append', default=[])
    args = parser.parse_args()
    try:
        origins = [validate_origin(origin) for origin in args.allow_origin] or [DEFAULT_ORIGIN]
    except ValueError as error:
        parser.error(str(error))
    server = CompanionServer(CompanionState(origins))
    print(f'OpenMemory local pairing page: http://127.0.0.1:{PORT}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
