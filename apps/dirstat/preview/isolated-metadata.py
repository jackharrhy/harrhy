"""Metadata-only traversal of /scan inside the DirStat read-only mount sandbox."""
import json
import os
import stat
import sys
import time

MAX_ENTRIES = 4096
MAX_BYTES = 32 * 1024 * 1024


def mount_id(fd):
    with open(f"/proc/self/fdinfo/{fd}", encoding="ascii") as info:
        return next(line.split()[1] for line in info if line.startswith("mnt_id:"))


def excluded(name):
    lower = name.lower()
    return (name.startswith(".") or lower in {
        "private", "personal", "secrets", "credentials", "venv",
        "dist", "target", "auth.json", "config.local.json", "vault", "keyrings", "ssh", "gnupg", "backup", "backups",
    } or any(token in lower for token in ("secret", "credential", "password", "token", "apikey", "api-key", "wallet", "keychain"))
        or lower.endswith((".pem", ".key", ".p12", ".sqlite", ".db", ".env")))


def scan(root):
    start = time.monotonic()
    root_mount = mount_id(root)
    root_device = os.fstat(root).st_dev
    entries = allocated = excluded_count = skipped = 0
    changes = []

    def visit(directory, parent, depth):
        nonlocal entries, allocated, excluded_count, skipped
        if depth >= 64:
            raise RuntimeError("depth limit")
        with os.scandir(directory) as listing:
            for item in listing:
                entries += 1
                if entries > MAX_ENTRIES or time.monotonic() - start >= 8:
                    raise RuntimeError("entry or time limit")
                name = item.name
                if excluded(name):
                    excluded_count += 1
                    continue
                fd = os.open(name, os.O_PATH | os.O_NOFOLLOW, dir_fd=directory)
                try:
                    info = os.fstat(fd)
                    if info.st_dev != root_device or mount_id(fd) != root_mount:
                        skipped += 1
                        continue
                    if not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode) and info.st_nlink == 1):
                        skipped += 1
                        continue
                    change = {"type": "file", "id": len(changes) + 1, "parent": parent, "name": name}
                    changes.append(change)
                    # Bound output before encoding; never publish a truncated tree.
                    if len(changes) > 256:
                        raise RuntimeError("detail limit")
                    if stat.S_ISDIR(info.st_mode):
                        sub = os.open(".", os.O_RDONLY | os.O_DIRECTORY, dir_fd=fd)
                        try:
                            visit(sub, change["id"], depth + 1)
                        finally:
                            os.close(sub)
                        change["type"] = "enter"
                    else:
                        size = info.st_blocks * 512
                        allocated += size
                        if allocated > MAX_BYTES:
                            raise RuntimeError("allocated byte limit")
                        change["bytes"] = size
                finally:
                    os.close(fd)

    visit(root, 0, 0)
    return {"changes": changes, "fileBytes": allocated, "files": sum(c["type"] == "file" for c in changes),
            "excluded": excluded_count, "skipped": skipped}


def sanitized_scan(root):
    started = time.monotonic()
    last_frame = started
    device, mount = os.fstat(root).st_dev, mount_id(root)
    entries = skipped = total = files = sampled = 0
    next_id = 1
    events = []
    deltas = {}
    sizes = []
    reasons = set()
    gaps = dict.fromkeys(("Mount boundaries", "Sensitive paths", "Unreadable metadata", "Special entries", "Depth limit", "Hardlink duplicates"), 0)
    hardlinks = set()
    hidden = 0
    fs = os.fstatvfs(root)
    disk = {"capacity": fs.f_blocks * fs.f_frsize, "used": (fs.f_blocks - fs.f_bfree) * fs.f_frsize,
            "available": fs.f_bavail * fs.f_frsize}
    print(json.dumps({"disk": disk}), flush=True)

    def sensitive(name):
        lower = name.lower()
        return lower in {".ssh", ".gnupg", ".aws", ".kube", ".docker", ".config", ".local", ".mozilla", ".pki", ".git", ".netrc", ".npmrc", ".pypirc", ".bash_history", ".zsh_history", "shadow", "gshadow", "private", "keyrings", "secrets", "vault", "backups", "auth.json", "passwd", "sudoers", "sudoers.d", "machine-id"} or any(word in lower for word in ("secret", "credential", "password", "token", "api-key", "apikey", "keychain", "wallet", "id_rsa", "id_ed25519", "ssh_host")) or lower.startswith(".env") or lower.endswith((".pem", ".key", ".p12", ".pfx", ".kdbx", ".sqlite", ".db"))

    def flush(force=False):
        nonlocal last_frame
        now = time.monotonic()
        if force or now - last_frame >= .1 or len(events) + len(deltas) + len(sizes) >= 128:
            print(json.dumps({"events": events, "sizes": sizes, "deltas": [[id, size, count] for id, (size, count) in deltas.items()], "visited": entries,
                              "fileBytes": total}, ensure_ascii=True), flush=True)
            events.clear()
            sizes.clear()
            deltas.clear()
            last_frame = now

    def node(parent, name, kind, visible=True, size=0):
        nonlocal next_id
        id = next_id
        next_id += 1
        events.append([id, parent, name, kind, size, visible])
        return id

    def visit(directory, parent=0, depth=0, collapsed=None, system_var=False):
        nonlocal entries, skipped, total, files, sampled, hidden
        with os.scandir(directory) as listing:
            for item in listing:
                if entries >= 8_000_000:
                    raise RuntimeError("Entry resource ceiling")
                entries += 1
                flush()
                name = item.name
                if depth == 0 and name in {"proc", "sys", "dev", "run"}:
                    gaps["Mount boundaries"] += 1
                    skipped += 1
                    continue
                if sensitive(name) or (depth == 0 and name == "root") or (system_var and name in {"lib", "log", "spool"}):
                    gaps["Sensitive paths"] += 1
                    skipped += 1
                    continue
                if depth >= 128:
                    raise RuntimeError("Depth resource ceiling")
                try:
                    fd = os.open(name, os.O_PATH | os.O_NOFOLLOW, dir_fd=directory)
                    try:
                        info = os.fstat(fd)
                        if info.st_dev != device or mount_id(fd) != mount:
                            gaps["Mount boundaries"] += 1
                            skipped += 1
                            continue
                        if name.startswith("."):
                            hidden += 1
                        if stat.S_ISDIR(info.st_mode):
                            bundled = name in ("node_modules", "venv", ".venv")
                            child = node(parent, name, "summary" if bundled else "directory", collapsed is None)
                            before = total
                            sub = os.open(".", os.O_RDONLY | os.O_DIRECTORY, dir_fd=fd)
                            try: visit(sub, child, depth + 1, collapsed if collapsed is not None else child if bundled else None, depth == 0 and name == "var")
                            finally: os.close(sub)
                            sizes.append([child, total - before])
                        elif stat.S_ISREG(info.st_mode):
                            if info.st_nlink > 1:
                                if info.st_ino in hardlinks:
                                    node(parent, name, "file", False, 0)
                                    gaps["Hardlink duplicates"] += 1
                                    skipped += 1
                                    continue
                                hardlinks.add(info.st_ino)
                            size = info.st_blocks * 512
                            if total + size > 512 * 1024 ** 3:
                                raise RuntimeError("Allocation resource ceiling")
                            total += size
                            files += 1
                            visible = collapsed is None and sampled < 15000 and (depth == 0 or name.startswith(".") or files <= 500 or files % 16 == 0)
                            file_id = node(parent, name, "file", visible, size)
                            if visible:
                                sampled += 1
                            id = file_id if visible else parent if collapsed is None else collapsed
                            old_bytes, old_count = deltas.get(id, (0, 0))
                            deltas[id] = (old_bytes + size, old_count + 1)
                        else:
                            gaps["Special entries"] += 1
                            skipped += 1
                    finally:
                        os.close(fd)
                except OSError:
                    gaps["Unreadable metadata"] += 1
                    skipped += 1
                    reasons.add("Unreadable metadata")

    visit(root)
    flush(True)
    return {"done": True, "visited": entries, "fileBytes": total, "files": files, "sampled": sampled,
            "elapsedMs": round((time.monotonic() - started) * 1000), "reasons": sorted(reasons), "skipped": skipped, "gaps": gaps, "hidden": hidden}


if __name__ == "__main__":
    root = os.open("/scan", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    if not os.fstatvfs(root).f_flag & os.ST_RDONLY:
        os.close(root)
        raise SystemExit("scanner requires a read-only mount")
    identity = os.fstat(root)
    if len(sys.argv) not in (3, 4) or (identity.st_dev, identity.st_ino) != tuple(map(int, sys.argv[1:3])):
        os.close(root)
        raise SystemExit("mounted root identity mismatch")
    try:
        result = json.dumps(sanitized_scan(root) if sys.argv[3:] == ["--sanitized"] else scan(root), ensure_ascii=True)
        if len(result) > 65536:
            raise RuntimeError("recording byte limit")
        print(result)
    except (OSError, RuntimeError) as error:
        # Do not disclose entry names from OS error strings.
        print(json.dumps({"abortReason": str(error) if isinstance(error, RuntimeError) else "metadata unavailable"}))
        raise SystemExit(1)
    finally:
        os.close(root)
