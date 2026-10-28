import base64
import http.client
import json
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
from server import VaultStore, State, Server, Conflict, validate_envelope

SITE = 'https://open-memory-ai.vercel.app'
OTHER = 'http://127.0.0.1:3001'
PLAIN = {'version': 1, 'encrypted': False, 'data': [{'id': 'fictional-note', 'title': 'An independent browser note'}]}
ENCRYPTED = {'version': 1, 'encrypted': True, 'salt': base64.b64encode(b's'*16).decode(), 'iv': base64.b64encode(b'i'*12).decode(), 'ciphertext': base64.b64encode(b'c'*32).decode()}

class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / 'vault.sqlite3'
        self.store = VaultStore(self.path)
    def tearDown(self):
        self.directory.cleanup()
    def test_durable_restart_and_backup(self):
        self.assertIsNone(self.store.read())
        self.assertEqual(self.store.write(PLAIN, 0)['revision'], 1)
        self.assertEqual(VaultStore(self.path).read()['data'], PLAIN['data'])
        backup = Path(self.directory.name) / 'backup.sqlite3'
        self.store.backup(backup)
        self.store.write({**PLAIN, 'data': []}, 1)
        self.assertEqual(VaultStore(backup).read()['data'], PLAIN['data'])
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
    def test_backup_never_replaces_an_existing_file(self):
        target = Path(self.directory.name) / "existing-backup.sqlite3"
        target.write_bytes(b"keep this backup")
        with self.assertRaises(FileExistsError): self.store.backup(target)
        self.assertEqual(target.read_bytes(), b"keep this backup")
    def test_compare_and_swap_stops_lost_updates(self):
        self.store.write(PLAIN, 0)
        self.store.write({**PLAIN, 'data': [{'id':'chrome-note'}]}, 1)
        with self.assertRaises(Conflict):
            self.store.write({**PLAIN, 'data': [{'id':'brave-stale-note'}]}, 1)
        self.assertEqual(self.store.read()['data'], [{'id':'chrome-note'}])
    def test_atomic_competing_writers(self):
        self.store.write(PLAIN, 0)
        outcomes=[]
        def write():
            try: self.store.write(PLAIN, 1); outcomes.append('saved')
            except Conflict: outcomes.append('conflict')
        a,b=threading.Thread(target=write),threading.Thread(target=write)
        a.start(); b.start(); a.join(); b.join()
        self.assertCountEqual(outcomes,['saved','conflict'])
        self.assertEqual(self.store.read()['revision'],2)
    def test_encryption_cannot_be_downgraded_or_rekeyed_by_stale_clients(self):
        self.store.write(ENCRYPTED,0)
        for envelope in (PLAIN,{**ENCRYPTED,'salt':base64.b64encode(b'n'*16).decode()}):
            with self.assertRaises(Conflict): self.store.write(envelope,1)
        self.assertEqual(self.store.read()['ciphertext'],ENCRYPTED['ciphertext'])
        self.store.write({**ENCRYPTED,'iv':base64.b64encode(b'n'*12).decode()},1)
    def test_rejects_malformed_and_future_envelopes_without_mutation(self):
        self.store.write(PLAIN,0)
        for value in ({}, {**PLAIN,'version':True}, {**PLAIN,'data':'bad'}, {**PLAIN,'extra':'unknown'}, {**ENCRYPTED,'iv':'bad'}, {**ENCRYPTED,'data':[]}):
            with self.assertRaises(ValueError): self.store.write(value,1)
        self.assertEqual(self.store.read()['revision'],1)
    def test_does_not_follow_database_symlink(self):
        link = Path(self.directory.name) / 'link.sqlite3'
        link.symlink_to(self.path)
        with self.assertRaises(ValueError): VaultStore(link)

class HttpTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory()
        self.now=[1000]
        self.state=State(VaultStore(Path(self.directory.name)/'vault.sqlite3'),[SITE,OTHER],lambda:self.now[0])
        self.server=Server(self.state,port=0)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join(); self.directory.cleanup()
    def request(self,path='/vault',method='GET',data=None,token=None,site=SITE,extra=None):
        connection=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=3)
        headers={} if site is None else {'Origin':site}
        if token: headers['Authorization']='Bearer '+token
        if data is not None: headers['Content-Type']='application/json'
        if extra: headers.update(extra)
        connection.request(method,path,body=None if data is None else json.dumps(data),headers=headers)
        result=connection.getresponse(); raw=result.read(); code=result.status; response_headers=dict(result.getheaders()); connection.close()
        return code,json.loads(raw) if raw and result.getheader('Content-Type')=='application/json' else raw.decode(),response_headers
    def pair(self,site=SITE):
        code=self.state.reveal()
        result=self.request('/pair','POST',{'code':code},site=site)
        self.assertEqual(result[0],200)
        return result[1]['token']
    def test_two_browser_tokens_share_one_library(self):
        chrome,brave=self.pair(),self.pair()
        self.assertNotEqual(chrome,brave)
        self.assertEqual(self.request(token=chrome)[1]['envelope'],None)
        self.assertEqual(self.request(method='PUT',data={'envelope':PLAIN,'expectedRevision':0},token=chrome)[0],200)
        self.assertEqual(self.request(token=brave)[1]['envelope']['data'],PLAIN['data'])
        self.assertEqual(self.request(method='PUT',data={'envelope':PLAIN,'expectedRevision':0},token=brave)[0],409)
    def test_denies_unauthenticated_cross_origin_and_rebound_host(self):
        token=self.pair()
        self.assertEqual(self.request()[0],401)
        self.assertEqual(self.request(token=token,site=OTHER)[0],401)
        self.assertEqual(self.request(token=token,site='https://evil.example')[0],403)
        self.assertEqual(self.request(token=token,site=None)[0],403)
        self.assertEqual(self.request(token=token,extra={'Host':'evil.example'})[0],403)
        self.assertIsNone(self.state.store.read())
    def test_codes_single_use_expire_and_tokens_expire(self):
        code=self.state.reveal()
        result=self.request('/pair','POST',{'code':code})
        token=result[1]['token']
        self.assertEqual(self.request('/pair','POST',{'code':code})[0],401)
        self.now[0]+=3601
        self.assertEqual(self.request(token=token)[0],401)
        code=self.state.reveal(); self.now[0]+=301
        self.assertEqual(self.request('/pair','POST',{'code':code})[0],401)
    def test_no_grants_survive_service_restart(self):
        token=self.pair()
        restarted=State(self.state.store,[SITE])
        self.assertFalse(restarted.authorized('Bearer '+token,SITE))
    def test_pairing_rate_limit(self):
        for _ in range(10): self.assertEqual(self.request('/pair','POST',{'code':'wrong'})[0],401)
        self.assertEqual(self.request('/pair','POST',{'code':'wrong'})[0],429)
    def test_preflight_exact_origin_and_private_network_support(self):
        code,_,headers=self.request('/vault','OPTIONS',extra={'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'content-type,authorization'})
        self.assertEqual(code,204)
        self.assertEqual(headers['Access-Control-Allow-Origin'],SITE)
        self.assertEqual(headers['Access-Control-Allow-Private-Network'],'true')
        self.assertEqual(self.request('/vault','OPTIONS',site='https://evil.example')[0],403)
    def test_root_does_not_reveal_code_to_a_website_fetch(self):
        self.assertEqual(self.request('/?reveal=1')[0],403)
        self.assertEqual(self.request('/?reveal=1',site=None)[0],200)
    def test_oversized_write_and_incomplete_shape_do_not_replace_data(self):
        token=self.pair()
        self.assertEqual(self.request(method='PUT',data={'envelope':PLAIN,'expectedRevision':0},token=token,extra={'Content-Length':str(9*1024*1024)})[0],400)
        self.assertEqual(self.request(method='PUT',data={'envelope':PLAIN},token=token)[0],400)
        self.assertIsNone(self.state.store.read())

if __name__=='__main__': unittest.main()
