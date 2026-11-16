import assert from "node:assert/strict";
import test from "node:test";
import { createMediaProvisioningAdapters } from "../src/media-provisioning-adapters.ts";

test("provisioning is default closed and uses only explicit Jellyfin write capabilities", () => {
  assert.throws(
    () =>
      createMediaProvisioningAdapters()({
        service: "jellyfin",
        instance: "local",
      }),
    { status: 503 },
  );
  const config = {
    service: "jellyfin",
    instance: "local",
    baseUrl: "http://native.invalid",
    writeTokenFile: "/private/write-token",
  };
  const adapters = createMediaProvisioningAdapters([config]);
  assert.equal(typeof adapters(config).libraries, "function");
  assert.throws(() => adapters({ ...config, service: "seerr" }), {
    status: 503,
  });
  assert.throws(() => adapters({ ...config, instance: "other" }), {
    status: 503,
  });
  assert.throws(() =>
    createMediaProvisioningAdapters([
      {
        ...config,
        writeTokenFile: undefined,
        tokenFile: "/private/read-token",
      },
    ]),
  );
  const withSeerr = createMediaProvisioningAdapters([
    { ...config, service: "seerr" },
  ]);
  assert.throws(
    () => withSeerr({ service: "unsupported", instance: config.instance }),
    { status: 503 },
  );
  assert.throws(() => createMediaProvisioningAdapters([config, config]));
  assert.throws(() =>
    createMediaProvisioningAdapters([{ ...config, service: "navidrome" }]),
  );
});
