import assert from "node:assert/strict";
import test from "node:test";
import { createSeerrLifecycle } from "../src/seerr-lifecycle.mjs";

function fixture({ count = 101, failDelete = false } = {}) {
  const effects = [];
  const user = {
    id: 7,
    permissions: 160,
    email: "not-retained@example.invalid",
  };
  const requests = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    status: 2,
    updatedAt: "2026-01-01T00:00:00Z",
    requestedBy: { id: 7, email: user.email },
  }));
  const adapter = createSeerrLifecycle(
    {
      baseUrl: "https://seerr.invalid/api/v1",
      writeTokenFile: "/private/write",
    },
    {
      readToken: async () => "synthetic",
      fetcher: async (url, options) => {
        assert.equal(options.redirect, "error");
        assert.equal(options.headers["X-Api-Key"], "synthetic");
        assert.equal(url.origin, "https://seerr.invalid");
        if (options.method === "DELETE") {
          assert.equal(url.pathname, "/api/v1/user/7");
          assert.equal(effects.at(-1), "claim");
          effects.push("delete");
          if (failDelete) throw new Error("partial unknown");
          return new Response(null, { status: 204 });
        }
        if (url.pathname.endsWith("/requests")) {
          const skip = Number(url.searchParams.get("skip"));
          return Response.json({
            pageInfo: { results: requests.length },
            results: requests.slice(skip, skip + 100),
          });
        }
        return Response.json(user);
      },
    },
  );
  return { adapter, requests, effects, user };
}

test("Seerr removal reviews complete pagination, retains only impact evidence and claims before delete", async () => {
  const { adapter, effects } = fixture();
  const review = await adapter.inspect("7");
  assert.equal(review.requestCount, 101);
  assert.equal(review.permissions, 160);
  assert.equal(JSON.stringify(review).includes("email"), false);
  assert.equal(review.conditionalDelete, false);
  assert.deepEqual(
    await adapter.removeAccountAndRequests(review, () => effects.push("claim")),
    { state: "removed", sessionRevocation: "not-claimed" },
  );
  assert.deepEqual(effects, ["claim", "delete"]);
});

test("Seerr changed impact and privileged targets fail before claim", async () => {
  const { adapter, requests, user, effects } = fixture({ count: 1 });
  const review = await adapter.inspect("7");
  requests[0].status = 3;
  await assert.rejects(
    adapter.removeAccountAndRequests(review, () => effects.push("claim")),
  );
  user.permissions = 2;
  await assert.rejects(adapter.inspect("7"));
  await assert.rejects(adapter.inspect("1"));
  await assert.rejects(adapter.inspect("07"));
  assert.deepEqual(effects, []);
});

test("Seerr delete failure is effect unknown; failed durable claim never deletes", async () => {
  const { adapter, effects } = fixture({ count: 0, failDelete: true });
  const review = await adapter.inspect("7");
  await assert.rejects(
    adapter.removeAccountAndRequests(review, () => {
      throw new Error("claim unavailable");
    }),
  );
  assert.deepEqual(effects, []);
  assert.equal(
    (
      await adapter.removeAccountAndRequests(review, () =>
        effects.push("claim"),
      )
    ).state,
    "effect-unknown",
  );
  assert.deepEqual(effects, ["claim", "delete"]);
});
