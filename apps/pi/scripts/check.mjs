import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sandbox } from "./sandbox.mjs";

const app = fileURLToPath(new URL("../", import.meta.url));
function run(command, args, cwd = app) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} exited ${result.status ?? result.signal}`);
}

run("npm", ["ci", "--ignore-scripts"], resolve(app, "upstream"));
run(process.execPath, [
  "upstream/apps/p2/node_modules/typescript/bin/tsc",
  "--noEmit",
  "-p",
  "upstream/apps/p2/tsconfig.json",
]);
run(
  process.execPath,
  ["packages/ai/scripts/check-model-data.ts"],
  resolve(app, "upstream"),
);
run(process.execPath, ["--test", "__tests__/provenance.test.mjs"]);
sandbox([
  "--test",
  "--test-concurrency=1",
  "test/p2/web-sources.test.ts",
  "test/p2/ingress.test.ts",
  "test/p2/stimuli-lifecycle.test.ts",
  "test/p2/schedules-recovery.test.ts",
]);
const cache = resolve(homedir(), ".cache/ms-playwright");
const chromium =
  process.env.CHROMIUM_BIN ??
  (existsSync(cache)
    ? readdirSync(cache)
        .filter((name) => name.startsWith("chromium-"))
        .toSorted()
        .toReversed()
        .map((name) => resolve(cache, name, "chrome-linux64/chrome"))
        .find(existsSync)
    : undefined);
if (!chromium || !existsSync(chromium))
  throw new Error(
    "Browser checks require CHROMIUM_BIN or Playwright Chromium; no skipped-browser success.",
  );
sandbox(
  [
    "--test",
    "--test-concurrency=1",
    "test/p2/ui-exact-conversation.test.ts",
    "test/p2/ui-web-surface.test.ts",
  ],
  { chromium },
);
