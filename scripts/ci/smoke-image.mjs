import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { nodeImageApps, runtimeApps } from "./node-image-impact.mjs";

const [app, image] = process.argv.slice(2);
assert.ok(image, "An image to smoke is required");
function smoke(script, ...args) {
  execFileSync(
    process.execPath,
    [fileURLToPath(new URL(script, import.meta.url)), app, image, ...args],
    { stdio: "inherit" },
  );
}

if (nodeImageApps.includes(app)) {
  smoke("./node-image-smoke.mjs");
  if (app === "maps-compiler") smoke("./node-image-smoke.mjs", "gower");
} else if (app === "world") {
  execFileSync(
    "sh",
    [
      fileURLToPath(
        new URL("../../apps/world/__tests__/image-smoke.sh", import.meta.url),
      ),
      image,
    ],
    { stdio: "inherit" },
  );
} else if (runtimeApps.includes(app)) {
  smoke("./selected-image-smoke.mjs");
} else {
  throw new Error(`No smoke check for ${app}`);
}
