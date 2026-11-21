import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createOwnerGate } from "../app/owner.ts";
import worker from "../worker.ts";

const origin = new URL("https://pi.example.test");
const env = {
  HARRHY_CLANK_ORIGIN: origin.origin,
  ASSETS: {
    async fetch() {
      throw new Error("must not fetch assets");
    },
  },
};

test("anonymous requests cannot read the page or bundle", async () => {
  for (const path of ["/clank", "/clank/assets/clank.js"]) {
    const response = await worker.fetch(new Request(new URL(path, origin)), env);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(await response.text(), "Owner sign-in required");
  }
});

test("Pi decides owner vs guest; invalid upstream response fails closed", async () => {
  const gate = createOwnerGate(origin, async (url, init) => {
    assert.equal(String(url), "https://pi.example.test/owner/check");
    assert.equal(init?.redirect, "error");
    const cookie = new Headers(init?.headers).get("Cookie");
    if (cookie === "fixture=guest") return new Response(null, { status: 401 });
    return Response.json({ owner: cookie === "fixture=owner" });
  });
  for (const [role, expected] of [
    ["owner", 200],
    ["guest", 401],
    ["invalid", 503],
  ] as const) {
    assert.equal(
      await gate(
        new Request(new URL("/clank", origin), { headers: { Cookie: `fixture=${role}` } }),
      ),
      expected,
    );
  }
});

test("foreign-origin requests never forward cookies", async () => {
  const gate = createOwnerGate(origin, async () => assert.fail("unexpected upstream request"));
  assert.equal(
    await gate(
      new Request(new URL("/clank", origin), {
        headers: { Cookie: "fixture=owner", Origin: "https://other.example.test" },
      }),
    ),
    401,
  );
});
