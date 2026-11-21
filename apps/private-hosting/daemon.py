"""Single-writer supervisor for trusted, operator-registered HTTP processes."""
import argparse
from contextlib import closing, suppress
import fcntl
import http.client
import json
import os
from pathlib import Path
import re
import signal
import socket
import sqlite3
import subprocess
import sys
import time

APPS = ("atlas", "go-demo")


class UnixHTTP(http.client.HTTPConnection):
    def __init__(self, path):
        super().__init__("localhost", timeout=2)
        self.path = path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX)
        self.sock.settimeout(self.timeout)
        self.sock.connect(str(self.path))


def socket_path(path):
    if not re.fullmatch(r"/[A-Za-z0-9_./-]+", str(path)) or len(os.fsencode(path)) > 100:
        raise ValueError("invalid UNIX socket path")


def read_registry(path):
    data = json.loads(path.read_text())
    if set(data) != {"caddy", "ingress", "apps"} or set(data["apps"]) != set(APPS):
        raise ValueError("expected caddy, ingress and exactly atlas/go-demo specs")
    socket_path(data["ingress"])
    if not Path(data["caddy"]).is_absolute():
        raise ValueError("caddy executable must be absolute")
    ports, hosts = set(), set()
    for name, spec in data["apps"].items():
        if set(spec) != {"host", "port", "argv", "cwd", "env"}:
            raise ValueError(f"invalid fields for {name}")
        host, port, argv, env = (spec[key] for key in ("host", "port", "argv", "env"))
        label = r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
        if len(host) > 253 or not re.fullmatch(rf"{label}(?:\.{label})+", host) or host in hosts:
            raise ValueError(f"invalid or duplicate host for {name}")
        if type(port) is not int or not 1024 <= port <= 65535 or port in ports:
            raise ValueError(f"invalid or duplicate port for {name}")
        if not isinstance(argv, list) or not argv or not all(isinstance(x, str) and "\0" not in x for x in argv):
            raise ValueError(f"invalid argv for {name}")
        if not Path(argv[0]).is_absolute() or not Path(spec["cwd"]).is_absolute():
            raise ValueError(f"executable and cwd must be absolute for {name}")
        if not isinstance(env, dict) or "PORT" in env or not all(
            re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", key) and isinstance(value, str) and "\0" not in value
            for key, value in env.items()
        ):
            raise ValueError(f"invalid env for {name}")
        ports.add(port)
        hosts.add(host)
    return data


def stop_process(child, hard=False):
    with suppress(ProcessLookupError):
        os.killpg(child.pid, signal.SIGKILL if hard else signal.SIGTERM)
    if not hard:
        # Leave the leader unreaped until after signalling the whole group.
        deadline = time.monotonic() + 2
        while not exited(child) and time.monotonic() < deadline:
            time.sleep(0.05)
        with suppress(ProcessLookupError):
            os.killpg(child.pid, signal.SIGKILL)
    child.wait(timeout=2)


def exited(child):
    return os.waitid(os.P_PID, child.pid, os.WEXITED | os.WNOWAIT | os.WNOHANG) is not None


def healthy(port):
    with closing(http.client.HTTPConnection("127.0.0.1", port, timeout=0.25)) as conn:
        try:
            conn.request("GET", "/healthz")
            with conn.getresponse() as response:
                return response.status == 200
        except (OSError, http.client.HTTPException):
            return False


class Supervisor:
    def __init__(self, config, runtime, db):
        self.specs = config["apps"]
        self.caddy = config["caddy"]
        self.ingress = Path(config["ingress"])
        self.admin = runtime / "admin.sock"
        self.runtime = runtime
        self.db = db
        self.proxy = None
        self.proxy_retry = 0
        self.published = None
        self.children = {}
        self.retry = dict.fromkeys(APPS, 0)
        self.deadlines = {}
        self.base = {"admin": {"listen": "unix/" + str(self.admin), "config": {"persist": False}}}
        self.bootstrap = runtime / "bootstrap.json"
        self.bootstrap.write_text(json.dumps(self.base))
        with db:
            db.execute("CREATE TABLE IF NOT EXISTS apps (name TEXT PRIMARY KEY, enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)))")
            db.executemany("INSERT OR IGNORE INTO apps VALUES (?, ?)", [("atlas", 1), ("go-demo", 0)])
            db.execute("UPDATE apps SET enabled=0 WHERE name='go-demo'")

    def wanted(self):
        return {name for (name,) in self.db.execute("SELECT name FROM apps WHERE enabled=1")}

    def config(self, ready):
        routes = []
        for name in sorted(ready):
            spec = self.specs[name]
            routes.append({"match": [{"host": [spec["host"]]}], "terminal": True, "handle": [{
                "handler": "reverse_proxy", "upstreams": [{"dial": f"127.0.0.1:{spec['port']}"}],
            }]})
        routes.append({"handle": [{"handler": "static_response", "status_code": 404}]})
        return {**self.base, "apps": {"http": {"servers": {"private": {
            "listen": ["unix/" + str(self.ingress) + "|0660"],
            "automatic_https": {"disable": True}, "routes": routes,
        }}}}}

    def close_proxy(self):
        if self.proxy is not None:
            stop_process(self.proxy, hard=True)
            self.proxy = None
        self.published = None
        for path in (self.admin, self.ingress):
            # Paths are exclusive to this instance; never delete a non-socket.
            if path.is_socket():
                path.unlink()

    def publish(self, ready):
        # Reload alone cannot bound every in-flight response. Recycle the
        # dedicated data plane on removal before signalling any backend.
        if self.proxy is not None and (exited(self.proxy) or (self.published or set()) - ready):
            self.close_proxy()
        if self.proxy is None:
            if time.monotonic() < self.proxy_retry:
                return
            self.close_proxy()
            self.proxy = subprocess.Popen(
                [self.caddy, "run", "--config", str(self.bootstrap)], stdin=subprocess.DEVNULL,
                env={"XDG_CONFIG_HOME": str(self.runtime), "XDG_DATA_HOME": str(self.runtime)},
                start_new_session=True,
            )
        if ready != self.published and self.admin.is_socket():
            with closing(UnixHTTP(self.admin)) as conn:
                conn.request("POST", "/load", json.dumps(self.config(ready)), {"Content-Type": "application/json"})
                with conn.getresponse() as response:
                    if response.status != 200:
                        raise OSError(f"Caddy rejected config: HTTP {response.status}")
            self.published = ready

    def reconcile(self):
        wanted = self.wanted()
        ready = set()
        retire = set(self.children) - wanted
        now = time.monotonic()
        for name in sorted(wanted):
            spec = self.specs[name]
            child = self.children.get(name)
            if child is None and now >= self.retry[name]:
                try:
                    with socket.socket() as probe:
                        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                        probe.bind(("127.0.0.1", spec["port"]))
                    child = self.children[name] = subprocess.Popen(
                        spec["argv"], cwd=spec["cwd"],
                        env={"PATH": os.defpath, **spec["env"], "PORT": str(spec["port"])},
                        stdin=subprocess.DEVNULL, start_new_session=True,
                    )
                    self.deadlines[name] = now + 20
                except (OSError, ValueError) as error:
                    print(f"{name}: launch failed ({type(error).__name__})", file=sys.stderr)
                    self.retry[name] = now + 5
            if child is None:
                continue
            if not exited(child) and healthy(spec["port"]) and not exited(child):
                ready.add(name)
                self.deadlines[name] = now + 20
            elif exited(child) or now >= self.deadlines[name]:
                retire.add(name)
                self.retry[name] = now + 5
        try:
            self.publish(ready)
        except (OSError, http.client.HTTPException) as error:
            print(f"Caddy unavailable; closing ingress ({error})", file=sys.stderr)
            # A lost acknowledgement may still mean the load committed.
            self.close_proxy()
            self.proxy_retry = time.monotonic() + 2
        for name in sorted(retire):
            stop_process(self.children[name])
            del self.children[name]

    def status(self):
        wanted = self.wanted()
        return {"ingress_ready": self.published is not None, "apps": {
            name: {"enabled": name in wanted, "running": name in self.children,
                   "published": name in (self.published or ()), "host": spec["host"]}
            for name, spec in self.specs.items()
        }}

    def command(self, command):
        if command == ["status"]:
            return self.status()
        if len(command) != 2 or command[0] not in ("start", "stop") or command[1] not in APPS:
            return {"error": "expected status or start/stop with atlas/go-demo"}
        action, name = command
        with self.db:
            self.db.execute("UPDATE apps SET enabled=? WHERE name=?", (action == "start", name))
        if action == "start":
            self.retry[name] = 0
        self.reconcile()
        return self.status()


def serve(args):
    os.umask(0o077)
    config = read_registry(args.config)
    control_path = args.runtime / "control.sock"
    socket_path(control_path)
    if not args.state.is_absolute():
        raise ValueError("state path must be absolute")
    for directory in (args.state, args.runtime):
        directory.mkdir(mode=0o700, exist_ok=True)
        if directory.stat().st_uid != os.getuid() or directory.stat().st_mode & 0o077:
            raise ValueError("state and runtime must be owned by the service UID and private")
    if Path(config["ingress"]).parent.resolve() in (args.runtime.resolve(), args.state.resolve()):
        raise ValueError("ingress must use its own operator-provisioned directory")
    shutdown = False

    def finish(*_):
        nonlocal shutdown
        shutdown = True

    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, finish)
    with (args.state / "daemon.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        with closing(sqlite3.connect(args.state / "hosting.sqlite3")) as db, socket.socket(socket.AF_UNIX) as control:
            control_path.unlink(missing_ok=True)
            control.bind(str(control_path))
            control.listen(8)
            control.settimeout(0.4)
            supervisor = Supervisor(config, args.runtime, db)
            try:
                while not shutdown:
                    supervisor.reconcile()
                    try:
                        client, _ = control.accept()
                    except TimeoutError:
                        continue
                    with client:
                        client.settimeout(0.25)
                        try:
                            with client.makefile("rb") as reader:
                                request = reader.readline(128)
                            if not request.endswith(b"\n"):
                                continue
                            reply = supervisor.command(request.decode("ascii").split())
                        except UnicodeError:
                            continue
                        except (TimeoutError, ConnectionError):
                            continue
                        with suppress(OSError):
                            client.sendall(json.dumps(reply).encode() + b"\n")
            finally:
                supervisor.close_proxy()
                for child in supervisor.children.values():
                    stop_process(child)
                control_path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime", required=True, type=Path)
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("run")
    run.add_argument("--state", required=True, type=Path)
    run.add_argument("--config", required=True, type=Path)
    commands.add_parser("status")
    for action in ("start", "stop"):
        commands.add_parser(action).add_argument("app", choices=APPS)
    args = parser.parse_args()
    if args.command == "run":
        serve(args)
        return 0
    with socket.socket(socket.AF_UNIX) as client:
        client.settimeout(15)
        client.connect(str(args.runtime / "control.sock"))
        request = " ".join(filter(None, (args.command, getattr(args, "app", None))))
        client.sendall(request.encode() + b"\n")
        with client.makefile("rb") as reply:
            result = json.loads(reply.readline(4096))
    print(json.dumps(result, indent=2))
    return int("error" in result)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, TypeError, AttributeError, sqlite3.Error, subprocess.TimeoutExpired) as exc:
        sys.exit(f"private-hosting: {exc}")
