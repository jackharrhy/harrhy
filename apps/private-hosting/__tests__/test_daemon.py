from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import http.client
import json
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest

import daemon

APP = Path(__file__).resolve().parents[1]
CADDY = os.environ.get("HARRHY_PRIVATE_HOSTING_TEST_CADDY")


def registry(root, ports):
    return {"caddy": CADDY or "/unused/caddy", "ingress": str(root / "ingress" / "http.sock"), "apps": {
        "atlas": {"host": "atlas.test", "port": ports[0], "argv": [sys.executable, str(APP / "__tests__/atlas_fixture.py")], "cwd": str(root), "env": {}},
        "go-demo": {"host": "demo.test", "port": ports[1], "argv": [str(root / "demo")], "cwd": str(root), "env": {}},
    }}


class StateTest(unittest.TestCase):
    def test_registry_rejects_duplicate_names_and_ports(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config = registry(root, (12345, 12346))
            path = root / "registry.json"
            path.write_text(json.dumps(config))
            self.assertEqual(daemon.read_registry(path), config)
            for key in ("host", "port"):
                with self.subTest(key=key):
                    invalid = registry(root, (12345, 12346))
                    invalid["apps"]["go-demo"][key] = invalid["apps"]["atlas"][key]
                    path.write_text(json.dumps(invalid))
                    with self.assertRaises(ValueError):
                        daemon.read_registry(path)

    def test_reopen_state_preserves_atlas_stop_but_not_demo_start(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config = registry(root, (12345, 12346))
            db_path = root / "test.sqlite3"
            with closing(sqlite3.connect(db_path)) as db:
                supervisor = daemon.Supervisor(config, root, db)
                self.assertEqual(supervisor.wanted(), {"atlas"})
                with db:
                    db.execute("UPDATE apps SET enabled=(name='go-demo')")
            with closing(sqlite3.connect(db_path)) as db:
                self.assertEqual(daemon.Supervisor(config, root, db).wanted(), set())


@unittest.skipUnless(CADDY, "set HARRHY_PRIVATE_HOSTING_TEST_CADDY to run real Caddy + Go smoke")
class IntegrationTest(unittest.TestCase):
    def test_lifecycle_over_unix_ingress(self):
        with tempfile.TemporaryDirectory(prefix="ph-") as tmp:
            root = Path(tmp)
            if not shutil.which("go"):
                self.fail("Go compiler required for real Caddy smoke")
            subprocess.run(["go", "build", "-o", str(root / "demo"), "./demo/main.go"], cwd=APP, check=True, timeout=60)
            with socket.socket() as first, socket.socket() as second:
                for sock in (first, second):
                    sock.bind(("127.0.0.1", 0))
                config = registry(root, (first.getsockname()[1], second.getsockname()[1]))
            (root / "ingress").mkdir()
            path = root / "registry.json"
            path.write_text(json.dumps(config))
            ctl = [sys.executable, str(APP / "daemon.py"), "--runtime", str(root / "run")]
            run = ctl + ["run", "--config", str(path), "--state", str(root / "state")]

            def command(*args):
                return json.loads(subprocess.check_output(ctl + list(args), timeout=10, stderr=subprocess.DEVNULL))

            def fetch(host):
                with closing(daemon.UnixHTTP(config["ingress"])) as conn:
                    conn.request("GET", "/", headers={"Host": host})
                    with conn.getresponse() as response:
                        return response.status, response.read()

            def eventually(check):
                deadline = time.monotonic() + 10
                while time.monotonic() < deadline:
                    try:
                        if check():
                            return
                    except (OSError, http.client.HTTPException, subprocess.CalledProcessError):
                        pass
                    time.sleep(0.05)
                self.fail("condition did not become true in time")

            def stop(proc):
                proc.terminate()
                self.assertEqual(proc.wait(timeout=10), 0)

            with (root / "test.log").open("w+") as log:
                proc = subprocess.Popen(run, stdout=log, stderr=log)
                try:
                    eventually(lambda: fetch("atlas.test")[0] == 404)
                    self.assertEqual(fetch("demo.test")[0], 404)
                    duplicate = subprocess.run(run, capture_output=True, timeout=5)
                    self.assertNotEqual(duplicate.returncode, 0)
                    self.assertIn(b"Resource temporarily unavailable", duplicate.stderr)
                    (root / "ready").touch()
                    eventually(lambda: fetch("atlas.test") == (200, b"Synthetic Atlas"))
                    self.assertEqual(fetch("unknown.test")[0], 404)
                    self.assertEqual(Path(config["ingress"]).stat().st_mode & 0o777, 0o660)
                    (root / "ready").unlink()
                    eventually(lambda: fetch("atlas.test")[0] == 404)
                    self.assertTrue(command("status")["apps"]["atlas"]["running"])
                    (root / "ready").touch()
                    eventually(lambda: fetch("atlas.test")[0] == 200)
                    command("start", "go-demo")
                    eventually(lambda: fetch("demo.test")[0] == 200)
                    with closing(daemon.UnixHTTP(config["ingress"])) as conn:
                        conn.request("GET", "/stream", headers={"Host": "atlas.test"})
                        with conn.getresponse() as stream, ThreadPoolExecutor() as executor:
                            self.assertEqual(stream.readline(), b"data: opened\n")
                            self.assertEqual(stream.readline(), b"\n")
                            stopped = executor.submit(command, "stop", "atlas")
                            with self.assertRaises(http.client.IncompleteRead):
                                stream.read()
                            # Observe the origin taking its delayed SIGTERM path;
                            # the control reply must not report stop until it exits.
                            eventually(lambda: (root / "signal").exists())
                            self.assertFalse(stopped.done())
                            self.assertFalse(stopped.result(timeout=8)["apps"]["atlas"]["running"])
                    eventually(lambda: fetch("atlas.test")[0] == 404 and fetch("demo.test")[0] == 200)
                    self.assertFalse(list((root / "run").rglob("autosave.json")))
                except BaseException:
                    log.seek(0)
                    print(log.read())
                    raise
                finally:
                    stop(proc)
                proc = subprocess.Popen(run, stdout=log, stderr=log)
                try:
                    eventually(lambda: fetch("demo.test")[0] == 404)
                    self.assertEqual(fetch("atlas.test")[0], 404)
                    self.assertTrue(all(not app["running"] and not app["enabled"] for app in command("status")["apps"].values()))
                finally:
                    stop(proc)
