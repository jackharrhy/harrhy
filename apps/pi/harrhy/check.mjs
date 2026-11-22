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

run(process.execPath, ["harrhy/install.mjs"]);
run(process.execPath, [
  "compat/host/node_modules/typescript/bin/tsc",
  "--noEmit",
  "-p",
  "tsconfig.json",
]);
run(
  process.execPath,
  ["packages/ai/scripts/check-model-data.ts"],
  resolve(app, "compat"),
);
run(process.execPath, ["--test", "__tests__/provenance.test.mjs"]);
sandbox([
  "--test",
  "--test-concurrency=1",
  "__tests__/p2/web-sources.test.ts",
  "__tests__/p2/fetch.test.ts",
  "__tests__/p2/theme-branding.test.ts",
  "__tests__/p2/goal.test.ts",
  "__tests__/p2/guest-upgrades.test.ts",
  "__tests__/p2/session-admission.test.ts",
  "__tests__/p2/session-admission-restart.test.ts",
  "__tests__/p2/message-citations.test.ts",
  "__tests__/p2/sharing-db.test.ts",
  "__tests__/p2/ingress.test.ts",
  "__tests__/p2/atlas-feedback.test.ts",
  "__tests__/p2/github-checks.test.ts",
  "__tests__/p2/projects-reopen.test.ts",
  "__tests__/p2/repositories.test.ts",
  "__tests__/p2/work-context-previews.test.ts",
  "__tests__/p2/stimuli-lifecycle.test.ts",
  "__tests__/p2/addressed-stimuli.test.ts",
  "__tests__/p2/local-inbox.test.ts",
  "__tests__/p2/schedules-recovery.test.ts",
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
    "__tests__/p2/ui-exact-conversation.test.ts",
    "__tests__/p2/ui-sidebar.test.ts",
    "__tests__/p2/ui-web-surface.test.ts",
    "__tests__/p2/ui-repositories.test.ts",
    "__tests__/p2/ui-theme-branding.test.ts",
    "__tests__/p2/ui-github-checks.test.ts",
    "__tests__/p2/activity-model.test.ts",
    "__tests__/p2/files.test.ts",
    "__tests__/p2/history.test.ts",
    "__tests__/p2/tree.test.ts",
    "__tests__/p2/plugins.test.ts",
    "__tests__/p2/stimuli-migration.test.ts",
  ],
  { chromium },
);
