"""Disposable Atlas stand-in with a controllable health endpoint and open stream."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import signal
import time


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/healthz":
            self.send_response(200 if Path("ready").exists() else 503)
            self.end_headers()
        elif self.path == "/stream":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            self.wfile.write(b"data: opened\n\n")
            self.wfile.flush()
            time.sleep(20)
        else:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Synthetic Atlas")


def stop(*_):
    # Keep the origin alive briefly after SIGTERM; the proxy must close first.
    Path("signal").touch()
    time.sleep(0.8)
    raise SystemExit


signal.signal(signal.SIGTERM, stop)
ThreadingHTTPServer(("127.0.0.1", int(os.environ["PORT"])), Handler).serve_forever()
