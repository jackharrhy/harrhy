import assert from "node:assert/strict";
import test from "node:test";
import {
  createJellyfinLifecycle,
  reviewJellyfinDisable,
} from "../src/jellyfin-lifecycle.mjs";

const nativeId = "77777777-1111-4111-8111-111111111111";
const user = () => ({
  Id: nativeId,
  Policy: {
    IsAdministrator: false,
    IsDisabled: false,
    AuthenticationProviderId: "native",
    PasswordResetProviderId: "native",
    EnabledFolders: ["films"],
    EnableAllFolders: false,
    EnableContentDeletion: false,
  },
});
function fixture({ failWrite = false, drift = false } = {}) {
  let account = user();
  const effects = [];
  const adapter = createJellyfinLifecycle(
    {
      baseUrl: "https://native.invalid/jellyfin",
      writeTokenFile: "/synthetic/write-token",
    },
    {
      readToken: async () => "synthetic-token",
      fetcher: async (url, options) => {
        assert.equal(options.redirect, "error");
        assert.equal(url.origin, "https://native.invalid");
        if (options.method === "GET") {
          assert.equal(url.pathname, `/jellyfin/Users/${nativeId}`);
          return Response.json(account);
        }
        assert.equal(options.method, "POST");
        assert.equal(url.pathname, `/jellyfin/Users/${nativeId}/Policy`);
        assert.equal(effects.at(-1), "claimed");
        effects.push("write");
        account.Policy = JSON.parse(options.body);
        if (drift) account.Policy.EnableContentDeletion = true;
        if (failWrite) throw new Error("uncertain transport");
        return new Response(null, { status: 204 });
      },
    },
  );
  return { adapter, effects, account };
}

test("reviewed disable preserves full policy, claims before write and verifies; revocation is never claimed", async () => {
  const { adapter, effects, account } = fixture();
  const before = structuredClone(account.Policy);
  const review = await adapter.inspect(nativeId);
  const result = await adapter.disable(review, async () =>
    effects.push("claimed"),
  );
  assert.deepEqual(result, {
    state: "disabled",
    sessionRevocation: "manual-required",
  });
  assert.deepEqual(account.Policy, { ...before, IsDisabled: true });
  assert.deepEqual(effects, ["claimed", "write"]);
  const disabled = await adapter.inspect(nativeId);
  assert.equal(
    (await adapter.disable(disabled, () => assert.fail("no effect"))).state,
    "already-disabled",
  );
});

test("changed native policy and failed durable claim prevent mutation", async () => {
  const { adapter, effects, account } = fixture();
  const review = await adapter.inspect(nativeId);
  account.Policy.EnabledFolders.push("private");
  await assert.rejects(
    adapter.disable(review, () => assert.fail("stale review")),
  );
  assert.deepEqual(effects, []);
  await assert.rejects(
    adapter.disable(await adapter.inspect(nativeId), async () => {
      throw Error("db unavailable");
    }),
  );
  assert.deepEqual(effects, []);
});

test("transport uncertainty and read-after-write policy drift remain effect-unknown", async () => {
  for (const options of [{ failWrite: true }, { drift: true }]) {
    const { adapter, effects } = fixture(options);
    assert.equal(
      (
        await adapter.disable(await adapter.inspect(nativeId), async () =>
          effects.push("claimed"),
        )
      ).state,
      "effect-unknown",
    );
    assert.deepEqual(effects, ["claimed", "write"]);
  }
});

test("administrator and incomplete policy are never eligible", () => {
  const admin = user();
  admin.Policy.IsAdministrator = true;
  assert.throws(() => reviewJellyfinDisable(admin));
  const missing = user();
  delete missing.Policy.AuthenticationProviderId;
  assert.throws(() => reviewJellyfinDisable(missing));
  assert.throws(() =>
    reviewJellyfinDisable({ Id: "../other", Policy: user().Policy }),
  );
});
