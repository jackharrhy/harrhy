import assert from "node:assert/strict";
import test from "node:test";
import { createMediaLifecycle } from "../src/media-lifecycle.mjs";

test("native write authority is absent by default and never uses roster token fields", () => {
  assert.throws(
    () => createMediaLifecycle()({ service: "jellyfin", instance: "local" }),
    /not configured/,
  );
  assert.throws(() =>
    createMediaLifecycle([
      {
        service: "jellyfin",
        instance: "local",
        baseUrl: "https://native.invalid",
        tokenFile: "/reader",
      },
    ]),
  );
  assert.throws(
    () => createMediaLifecycle([{ service: "navidrome", instance: "local" }]),
    /Invalid media write/,
  );
  const config = {
    service: "seerr",
    instance: "local",
    baseUrl: "https://native.invalid/api/v1",
    writeTokenFile: "/writer",
  };
  const resolve = createMediaLifecycle([config]);
  assert.equal(typeof resolve(config).removeAccountAndRequests, "function");
  assert.throws(
    () => resolve({ ...config, instance: "other" }),
    /not configured/,
  );
  assert.throws(() => createMediaLifecycle([config, config]), /Duplicate/);
});
