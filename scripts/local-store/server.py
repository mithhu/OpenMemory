"""OpenMemory's optional loopback-only SQLite vault. No AI dependencies."""
from __future__ import annotations
import argparse
import base64
import hmac
import html
import json
import os
import secrets
import sqlite3
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

PORT = 8766
MAX_BODY = 8 * 1024 * 1024
DEFAULT_ORIGINS = ['https://open-memory-ai.vercel.app', 'http://127.0.0.1:3001', 'http://localhost:3001']


def origin(value):
    url = urlsplit(value)
    if url.scheme not in ('http', 'https') or not url.hostname or url.username or url.password or url.path or url.query or url.fragment or '*' in value:
        raise ValueError('Use an exact HTTP(S) website origin without path or wildcard')
    url.port  # Validate malformed ports.
    return value


def validate_envelope(value):
    if not isinstance(value, dict) or (type(value.get('version')) is not int or value.get('version') != 1) or type(value.get('encrypted')) is not bool:
        raise ValueError('Invalid vault envelope')
    allowed = {'version', 'encrypted', 'revision'}
    if value['encrypted']:
        allowed |= {'salt', 'iv', 'ciphertext'}
        for name in ('salt', 'iv', 'ciphertext'):
            if not isinstance(value.get(name), str):
                raise ValueError('Invalid encrypted envelope')
            try:
                decoded = base64.b64decode(value[name], validate=True)
            except Exception:
                raise ValueError('Invalid encrypted envelope')
            if (name == 'salt' and len(decoded) != 16) or (name == 'iv' and len(decoded) != 12) or (name == 'ciphertext' and len(decoded) < 16):
                raise ValueError('Invalid encrypted envelope')
    else:
        allowed.add('data')
        if not isinstance(value.get('data'), list) or len(value['data']) > 200 or any(not isinstance(item, dict) for item in value['data']):
            raise ValueError('Invalid memory collection')
    if set(value) - allowed:
        raise ValueError('Unexpected vault fields')
    if 'revision' in value and (type(value['revision']) is not int or value['revision'] < 0):
        raise ValueError('Invalid revision')
    return {key: data for key, data in value.items() if key != 'revision'}


class Conflict(Exception):
    pass


class VaultStore:
    def __init__(self, path):
        self.path = Path(path).expanduser().absolute()
        if self.path.is_symlink():
            raise ValueError('Database must not be a symbolic link')
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        db = self.connect()
        try:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('CREATE TABLE IF NOT EXISTS vault (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, envelope TEXT NOT NULL)')
            db.commit()
        finally:
            db.close()
        os.chmod(self.path, 0o600)

    def connect(self):
        db = sqlite3.connect(str(self.path), timeout=5)
        db.execute('PRAGMA synchronous=FULL')
        return db

    def read(self):
        db = self.connect()
        try:
            row = db.execute('SELECT revision, envelope FROM vault WHERE id=1').fetchone()
            return {**json.loads(row[1]), 'revision': row[0]} if row else None
        finally:
            db.close()

    def write(self, envelope, expected):
        if type(expected) is not int or expected < 0 or expected >= 9007199254740991:
            raise ValueError('Invalid expected revision')
        clean = validate_envelope(envelope)
        db = self.connect()
        try:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT revision, envelope FROM vault WHERE id=1').fetchone()
            revision = row[0] if row else 0
            if revision != expected:
                raise Conflict('Library changed in another browser. Reload before saving; your draft has not been saved.')
            previous = json.loads(row[1]) if row else None
            if previous and previous['encrypted'] and (not clean['encrypted'] or clean['salt'] != previous['salt']):
                raise Conflict('Library encryption changed. Reload and unlock before saving.')
            result = {**clean, 'revision': revision + 1}
            db.execute('INSERT INTO vault VALUES(1, ?, ?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision, envelope=excluded.envelope', (revision + 1, json.dumps(clean, allow_nan=False)))
            db.commit()
            return result
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def backup(self, destination):
        descriptor = os.open(str(destination), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.close(descriptor)
        source = self.connect()
        target = sqlite3.connect(str(destination))
        try:
            source.backup(target)
            os.chmod(destination, 0o600)
        finally:
            target.close()
            source.close()


class State:
    def __init__(self, store, origins, clock=time.time):
        self.store, self.origins, self.clock = store, set(origins), clock
        self.lock = threading.Lock()
        self.code, self.code_expiry = '', 0
        self.sessions = {}
        self.attempts = []

    def reveal(self):
        with self.lock:
            self.code, self.code_expiry = secrets.token_urlsafe(24), self.clock() + 300
            return self.code

    def pair(self, code, site):
        with self.lock:
            now = self.clock()
            self.attempts = [stamp for stamp in self.attempts if stamp > now - 60]
            if len(self.attempts) >= 10:
                raise PermissionError('Too many pairing attempts. Wait one minute.')
            self.attempts.append(now)
            if not isinstance(code, str) or len(code) > 128 or not self.code or now >= self.code_expiry or not hmac.compare_digest(code, self.code):
                return None
            self.code = ''
            self.sessions = {key: grant for key, grant in self.sessions.items() if grant[1] > now}
            if len(self.sessions) >= 128:
                raise PermissionError('Too many active pairings. Restart the local service.')
            token, expiry = secrets.token_urlsafe(32), int(now + 3600)
            self.sessions[token] = (site, expiry)
            return {'token': token, 'expiresAt': expiry}

    def authorized(self, authorization, site):
        if not isinstance(authorization, str) or not authorization.startswith('Bearer '):
            return False
        with self.lock:
            grant = self.sessions.get(authorization[7:])
            return bool(grant and grant[0] == site and grant[1] > self.clock())


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, *args):
        pass  # Never log pairing codes, tokens, URLs or memories.

    @property
    def state(self):
        return self.server.state

    def permitted(self, require_origin=True):
        hosts, origins = self.headers.get_all('Host', []), self.headers.get_all('Origin', [])
        if len(hosts) != 1 or hosts[0] not in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}') or len(origins) > 1:
            return False
        if origins:
            return origins[0] in self.state.origins
        return not require_origin and (self.headers.get('Sec-Fetch-Site') not in ('cross-site', 'same-site') or (self.headers.get('Sec-Fetch-Mode') == 'navigate' and self.headers.get('Sec-Fetch-Dest') == 'document'))

    def respond(self, code, data, content='application/json'):
        payload = data.encode() if isinstance(data, str) else json.dumps(data, allow_nan=False).encode()
        self.send_response(code)
        site = self.headers.get('Origin')
        if site in self.state.origins:
            self.send_header('Access-Control-Allow-Origin', site)
            self.send_header('Vary', 'Origin')
        self.send_header('Content-Type', content)
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; form-action 'none'")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        methods = {'/status': 'GET', '/pair': 'POST', '/vault': 'GET, PUT'}
        requested = self.headers.get('Access-Control-Request-Method')
        headers = {v.strip().lower() for v in self.headers.get('Access-Control-Request-Headers', '').split(',') if v.strip()}
        if not self.permitted() or self.path not in methods or requested not in methods[self.path].split(', ') or not headers.issubset({'content-type', 'authorization'}):
            return self.respond(403, {'error': 'Request not allowed'})
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
        self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', methods[self.path])
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()

    def do_GET(self):
        if self.path in ('/', '/?reveal=1'):
            if not self.permitted(False) or self.headers.get('Origin'):
                return self.respond(403, {'error': 'Open this page directly on your Mac'})
            code = self.state.reveal() if self.path == '/?reveal=1' else None
            detail = '<p>Pair only with your trusted OpenMemory website. Code expires in five minutes and is single-use.</p>'
            detail += f'<p>Pairing code: <strong>{html.escape(code)}</strong></p>' if code else '<p><a href="/?reveal=1">Reveal a new pairing code</a></p>'
            return self.respond(200, '<!doctype html><meta charset="utf-8"><title>OpenMemory local storage</title><h1>Store on this Mac</h1><p>SQLite library: ' + html.escape(str(self.state.store.path)) + '</p>' + detail, 'text/html; charset=utf-8')
        if not self.permitted():
            return self.respond(403, {'error': 'Website not allowed'})
        if self.path == '/status':
            return self.respond(200, {'service': 'openmemory-local-storage', 'version': 1, 'ready': True})
        if self.path != '/vault':
            return self.respond(404, {'error': 'Not found'})
        if not self.state.authorized(self.headers.get('Authorization'), self.headers.get('Origin')):
            return self.respond(401, {'error': 'Pair this browser with the storage service again'})
        try:
            return self.respond(200, {'envelope': self.state.store.read()})
        except (sqlite3.Error, ValueError):
            return self.respond(500, {'error': 'Could not read the local database. Existing data has not been replaced.'})

    def body(self):
        lengths = self.headers.get_all('Content-Length', [])
        if len(lengths) != 1 or not lengths[0].isdigit() or self.headers.get('Transfer-Encoding') or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            raise ValueError('Send a JSON request with a single Content-Length')
        size = int(lengths[0])
        if size <= 0 or size > MAX_BODY:
            raise ValueError('Request is too large or empty')
        raw = self.rfile.read(size)
        if len(raw) != size:
            raise ValueError('Incomplete request')
        return json.loads(raw.decode(), parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Invalid JSON number')))

    def mutate(self, pairing):
        if not self.permitted() or self.path != ('/pair' if pairing else '/vault'):
            return self.respond(403, {'error': 'Request not allowed'})
        if not pairing and not self.state.authorized(self.headers.get('Authorization'), self.headers.get('Origin')):
            return self.respond(401, {'error': 'Pair this browser with the storage service again'})
        try:
            data = self.body()
            if not isinstance(data, dict):
                raise ValueError('Invalid request')
            if pairing:
                if set(data) != {'code'}:
                    raise ValueError('Invalid pairing request')
                result = self.state.pair(data['code'], self.headers['Origin'])
                return self.respond(200 if result else 401, result or {'error': 'Pairing code is invalid or expired'})
            if set(data) != {'envelope', 'expectedRevision'}:
                raise ValueError('Invalid write request')
            return self.respond(200, {'envelope': self.state.store.write(data['envelope'], data['expectedRevision'])})
        except Conflict as error:
            return self.respond(409, {'error': str(error)})
        except PermissionError as error:
            return self.respond(429, {'error': str(error)})
        except (ValueError, UnicodeError):
            return self.respond(400, {'error': 'Invalid request. Existing data has not been replaced.'})
        except sqlite3.Error:
            return self.respond(500, {'error': 'Could not write the local database. Your draft has not been saved.'})

    def do_POST(self):
        return self.mutate(True)

    def do_PUT(self):
        return self.mutate(False)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, state, port=PORT):
        self.state = state
        super().__init__(('127.0.0.1', port), Handler)


def main():
    default = Path.home() / ('Library/Application Support/OpenMemory' if sys.platform == 'darwin' else '.local/share/OpenMemory') / 'openmemory.sqlite3'
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, default=default)
    parser.add_argument('--allow-origin', action='append', default=[])
    parser.add_argument('--backup', type=Path, help='Create a consistent SQLite backup at a new path and exit')
    args = parser.parse_args()
    os.umask(0o077)
    try:
        origins = [origin(value) for value in (args.allow_origin or DEFAULT_ORIGINS)]
        if args.backup and (not args.database.exists() or args.backup.exists()):
            parser.error('Backup requires an existing database and a new destination file')
        store = VaultStore(args.database)
        if args.backup:
            store.backup(args.backup)
            print(f'Backup saved: {args.backup}', flush=True)
            return
        server = Server(State(store, origins))
    except (OSError, ValueError, sqlite3.Error) as error:
        parser.exit(1, f'Could not start local storage: {error}. If port {PORT} is in use, check the existing service.\n')
    print(f'OpenMemory storage pairing: http://127.0.0.1:{PORT}/\nDatabase: {store.path}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
