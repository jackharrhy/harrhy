import assert from "node:assert/strict";
import { test } from "node:test";
import { loadWorkspaces, selectChecks } from "../affected.mjs";
import { selectPublishedApps } from "../publish-impact.mjs";

const fleet = ["ref", "radio", "worldview", "maps-collaboration"];

test("canonical runtime changes check Celld consumers without unrelated Node apps", () => {
  for (const path of ["celld.json", "scripts/celld-runtime.mjs"]) {
    const selected = selectChecks([path], loadWorkspaces());
    for (const app of [...fleet, "4orm"])
      assert.ok(selected.includes(`@harrhy/${app}`), app);
    assert.ok(!selected.includes("@harrhy/auth"));
    assert.ok(!selected.includes("@harrhy/cms"));
  }
});

test("canonical artifact changes publish only Dockerfiles consuming Celld", () => {
  const apps = [...fleet, "maps-service", "maps-compiler", "auth"];
  const lock = { packages: {} };
  assert.deepEqual(
    selectPublishedApps({
      apps,
      paths: ["celld.json"],
      beforeLock: lock,
      afterLock: lock,
      beforeRoot: {},
      afterRoot: {},
      dockerfiles: Object.fromEntries(
        fleet.map((app) => [app, "ARG CELLD_IMAGE=example"]),
      ),
    }),
    fleet,
  );
});
