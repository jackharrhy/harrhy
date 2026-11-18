import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("../", import.meta.url));
const nodeRoot = dirname(dirname(process.execPath));

// Only source, dependencies and system libraries enter the fixture namespace.
// There is no host HOME, credential store, data directory or outbound network.
export function sandbox(args, { chromium } = {}) {
  const mounts = [
    "--unshare-all",
    "--die-with-parent",
    "--new-session",
    "--clearenv",
    "--ro-bind",
    "/usr",
    "/usr",
    "--symlink",
    "usr/bin",
    "/bin",
    "--symlink",
    "usr/lib",
    "/lib",
    "--symlink",
    "usr/lib64",
    "/lib64",
    "--dir",
    "/etc",
    "--ro-bind",
    "/etc/ld.so.cache",
    "/etc/ld.so.cache",
    "--ro-bind",
    "/etc/fonts",
    "/etc/fonts",
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    "--tmpfs",
    "/tmp",
    "--dir",
    "/tmp/home",
    "--ro-bind",
    nodeRoot,
    "/node",
    "--ro-bind",
    app,
    "/workspace",
    "--setenv",
    "HOME",
    "/tmp/home",
    "--setenv",
    "PATH",
    "/node/bin:/usr/bin:/bin",
    "--setenv",
    "P2_RADIUS",
    "0",
    "--setenv",
    "P2_FAKE",
    "1",
    "--chdir",
    "/workspace",
  ];
  if (chromium)
    mounts.push(
      "--ro-bind",
      dirname(chromium),
      "/chromium",
      "--setenv",
      "CHROMIUM_BIN",
      `/chromium/${chromium.split("/").at(-1)}`,
      "--setenv",
      "P2_BROWSER_TESTS",
      "1",
    );
  const result = spawnSync(
    "bwrap",
    [...mounts, "/node/bin/node", "--import", "./src/source.ts", ...args],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Isolated fixture exited ${result.status ?? result.signal}`,
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  sandbox(process.argv.slice(2), { chromium: process.env.CHROMIUM_BIN });
