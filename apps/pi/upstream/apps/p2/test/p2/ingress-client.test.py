"""Disposable HTTP wire fixtures for the standalone client; no real credentials or sessions."""
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import tempfile
from threading import Thread
import unittest

CLIENT = Path(__file__).resolve().parents[2] / 'scripts' / 'ingress.py'
EVENT = 'client-wire-test'
TEXT = 'Substantive review é'
RECEIPT = {'state': 'admitted', 'eventId': EVENT,
           'contentHash': hashlib.sha256(TEXT.encode()).hexdigest(), 'submissionId': 1}


class IngressClientTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.token = Path(self.directory.name) / 'token'
        self.token.write_text('disposable-fixture-token')

    def server(self, status, body, location=None):
        calls = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                calls.append(self.headers.get('Authorization'))
                self.send_response(status)
                if location:
                    self.send_header('Location', location)
                self.end_headers()
                self.wfile.write(body)

            do_POST = do_GET

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()

        def close():
            server.shutdown()
            server.server_close()
            thread.join()

        self.addCleanup(close)
        return f'http://127.0.0.1:{server.server_port}', calls

    def run_client(self, url, receipt=False):
        return subprocess.run(['python3', str(CLIENT), EVENT, '--url', url,
                               '--token-file', str(self.token),
                               *(['--receipt'] if receipt else ['--text', TEXT])],
                              capture_output=True, text=True, timeout=10)

    def test_refuses_all_redirects_without_forwarding_authorization(self):
        target, target_calls = self.server(200, json.dumps(RECEIPT).encode())
        for code in [301, 302, 303, 307, 308]:
            with self.subTest(code=code):
                origin, origin_calls = self.server(code, b'', target)
                result = self.run_client(origin)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(origin_calls, ['Bearer disposable-fixture-token'])
                self.assertEqual(target_calls, [])
                self.assertEqual(result.stdout, '')

    def test_validates_success_receipts_for_send_and_readback(self):
        url, _ = self.server(200, json.dumps(RECEIPT).encode())
        for readback in [False, True]:
            result = self.run_client(url, readback)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout), RECEIPT)
        bad = [b'not JSON', b'[]', b'{}', b'null']
        for field, value in [('state', 'completed'), ('eventId', 'another-event'),
                             ('contentHash', 'invalid'), ('submissionId', True),
                             ('submissionId', '1'), ('submissionId', 0),
                             ('unexpected', 'field')]:
            bad.append(json.dumps({**RECEIPT, field: value}).encode())
        for body in bad:
            for readback in [False, True]:
                with self.subTest(body=body, readback=readback):
                    url, _ = self.server(200, body)
                    result = self.run_client(url, readback)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertEqual(result.stdout, '')
        url, _ = self.server(200, json.dumps({**RECEIPT, 'contentHash': '0' * 64}).encode())
        self.assertNotEqual(self.run_client(url).returncode, 0)
        url, _ = self.server(201, json.dumps(RECEIPT).encode())
        self.assertNotEqual(self.run_client(url).returncode, 0)


if __name__ == '__main__':
    unittest.main()
