import assert from "node:assert/strict";
import test from "node:test";
import { createSeerrProvisioning } from "../src/seerr-provisioning.ts";

const jellyfinNativeId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
function fixture() {
  const effects = [];
  const settings = {
    mediaServerType: 2,
    defaultPermissions: 160,
    apiKey: "private-not-retained",
  };
  const native = [{ id: jellyfinNativeId, username: "Synthetic Recipient" }];
  const created = {
    id: 7,
    jellyfinUserId: jellyfinNativeId,
    jellyfinUsername: native[0].username,
    permissions: 160,
    userType: 3,
  };
  let existing = null;
  let fail = false;
  const adapter = createSeerrProvisioning(
    {
      baseUrl: "https://seerr.invalid/api/v1",
      writeTokenFile: "/private/write",
    },
    {
      readToken: async () => "synthetic-write",
      fetcher: async (url, options) => {
        assert.equal(options.headers["X-Api-Key"], "synthetic-write");
        assert.equal(options.redirect, "error");
        if (url.pathname === "/api/v1/settings/main")
          return Response.json(settings);
        if (url.pathname === "/api/v1/settings/jellyfin/users")
          return Response.json(native);
        if (url.pathname === `/api/v1/user/jellyfin/${jellyfinNativeId}`)
          return existing
            ? Response.json(existing)
            : new Response(null, { status: 404 });
        if (url.pathname === "/api/v1/user/import-from-jellyfin") {
          assert.equal(options.method, "POST");
          assert.equal(effects.at(-1), "claim");
          assert.deepEqual(JSON.parse(options.body), {
            jellyfinUserIds: [jellyfinNativeId],
          });
          effects.push("import");
          if (fail) throw new Error("secret-native-response");
          return Response.json([created], { status: 201 });
        }
        assert.equal(url.pathname, "/api/v1/user/7");
        assert.equal(effects.at(-1), "receipt:7");
        return Response.json(created);
      },
    },
  );
  return {
    adapter,
    effects,
    settings,
    native,
    created,
    setExisting: (value) => {
      existing = value;
    },
    setFailure: () => {
      fail = true;
    },
  };
}
const confirm = (subject, review) =>
  subject.adapter.provision(review, {
    claimEffect: async () => subject.effects.push("claim"),
    recordNativeId: async (id) => subject.effects.push(`receipt:${id}`),
  });
test("Seerr import selects one exact configured-server native ID with reviewed 160 and checkpoints returned ID", async () => {
  const f = fixture();
  const review = await f.adapter.preview({ jellyfinNativeId });
  assert.equal(review.permissionMeaning, "request-and-auto-approve");
  assert(!JSON.stringify(review).includes("private-not-retained"));
  assert.deepEqual(await confirm(f, review), {
    state: "created",
    nativeId: "7",
    mapping: "separate-exact-id-review",
  });
  assert.deepEqual(f.effects, ["claim", "import", "receipt:7"]);
});
test("Seerr missing native ID, existing association, changed defaults and wrong media server prevent any import", async () => {
  for (const mutate of [
    (f) => f.native.splice(0),
    (f) => f.setExisting({ id: 7 }),
    (f) => {
      f.settings.defaultPermissions = 32;
    },
    (f) => {
      f.settings.mediaServerType = 3;
    },
  ]) {
    const f = fixture();
    const review = await f.adapter.preview({ jellyfinNativeId });
    mutate(f);
    await assert.rejects(confirm(f, review));
    assert.deepEqual(f.effects, []);
  }
});
test("Seerr post-claim uncertainty and permission races are never repaired or retried", async () => {
  for (const mutate of [
    (f) => f.setFailure(),
    (f) => {
      f.created.permissions = 2;
    },
    (f) => {
      f.created.userType = 2;
    },
    (f) => {
      f.created.jellyfinUserId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    },
  ]) {
    const f = fixture();
    const review = await f.adapter.preview({ jellyfinNativeId });
    mutate(f);
    const result = await confirm(f, review);
    assert.equal(result.state, "effect-unknown");
    assert.equal(f.effects.filter((effect) => effect === "import").length, 1);
    assert(!JSON.stringify(result).includes("secret"));
  }
});
