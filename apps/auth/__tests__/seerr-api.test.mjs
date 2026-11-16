import assert from "node:assert/strict";
import test from "node:test";
import { createSeerrApi } from "../src/seerr-api.mjs";

test("Seerr accepts installed base64 API keys, rejects header controls and bounds response bodies", async () => {
  const config = {
    baseUrl: "https://seerr.invalid/api/v1",
    writeTokenFile: "/private/write",
  };
  let calls = 0;
  const request = createSeerrApi(config, {
    readToken: async () => "c3ludGhldGljKysvPQ==\n",
    fetcher: async (url, options) => {
      calls++;
      assert.equal(url.pathname, "/api/v1/settings/main");
      assert.equal(options.headers["X-Api-Key"], "c3ludGhldGljKysvPQ==");
      return Response.json({ defaultPermissions: 160 });
    },
  });
  assert.deepEqual(await request("settings/main"), { defaultPermissions: 160 });
  for (const token of ["", "bad\r\nheader", "a".repeat(4097)]) {
    await assert.rejects(
      createSeerrApi(config, {
        readToken: async () => token,
        fetcher: async () => {
          calls++;
        },
      })("settings/main"),
    );
  }
  assert.equal(calls, 1);
  await assert.rejects(
    createSeerrApi(config, {
      readToken: async () => "synthetic",
      fetcher: async () => Response.json({ data: "x".repeat(1024 * 1024) }),
    })("settings/main"),
  );
});
