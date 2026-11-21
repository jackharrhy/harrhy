"""Fixed-root traversal preflight. No network listener or production scan entrypoint."""
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

APPROVED_ROOT = Path("/")
WALKER = Path(__file__).with_name("isolated-metadata.py").resolve()


def pin_root(path):
    if path.resolve(strict=True) != path:
        raise ValueError("noncanonical root")
    expected = path.stat(follow_symlinks=False)
    if not stat.S_ISDIR(expected.st_mode):
        raise ValueError("not a real directory")
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    opened = os.fstat(fd)
    if (opened.st_dev, opened.st_ino) != (expected.st_dev, expected.st_ino):
        os.close(fd)
        raise ValueError("root replaced during validation")
    return fd


def run_fixture(path):
    """Exercise the same mount and process boundary on disposable content only."""
    if path == APPROVED_ROOT or path in APPROVED_ROOT.parents:
        raise ValueError("refusing to mount the approved root during preflight")
    return run_isolated(path, [])


def run_isolated(path, args, stream=False):
    fd = pin_root(path)
    try:
        identity = os.fstat(fd)
        command = [
            "/usr/bin/bwrap", "--unshare-all", "--die-with-parent", "--cap-drop", "ALL",
            "--clearenv", "--ro-bind", "/usr", "/usr", "--symlink", "usr/lib", "/lib",
            "--symlink", "usr/lib64", "/lib64", "--proc", "/proc",
            "--ro-bind", str(path), "/scan",
            "--ro-bind", str(WALKER), "/walker.py", "--remount-ro", "/",
            "/usr/bin/python3", "-I", "-B", "/walker.py", str(identity.st_dev), str(identity.st_ino), *args,
        ]
        return subprocess.run(command, cwd="/", env={}, stdout=None if stream else subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=240, check=True).stdout
    finally:
        os.close(fd)


if __name__ == "__main__":
    if sys.argv[1:] == ["--sanitized"]:
        try:
            run_isolated(APPROVED_ROOT, ["--sanitized"], stream=True)
        except subprocess.TimeoutExpired:
            print(json.dumps({"abortReason": "Wall-clock resource ceiling"}), flush=True)
            raise SystemExit(1)
        raise SystemExit(0)
    if sys.argv[1:] != ["--check"]:
        raise SystemExit("expected --check or --sanitized")
    os.close(pin_root(APPROVED_ROOT))
    print("Approved root pinned and validated; no contents enumerated")
