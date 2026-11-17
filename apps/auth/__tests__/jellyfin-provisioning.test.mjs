import assert from "node:assert/strict";
import test from "node:test";
import {
  createJellyfinProvisioning,
  newJellyfinPlaybackPolicy,
} from "../src/jellyfin-provisioning.ts";

const id = "77777777-1111-4111-8111-111111111111";
const folder = "88888888-1111-4111-8111-111111111111";
function fixture({ failAt, drift = false } = {}) {
  const effects = [];
  let account;
  const adapter = createJellyfinProvisioning(
    {
      baseUrl: "https://native.invalid/jellyfin",
      writeTokenFile: "/synthetic/write",
    },
    {
      readToken: async () => "synthetic-token",
      fetcher: async (url, options) => {
        const route = `${options.method} ${url.pathname.replace("/jellyfin/", "")}`;
        assert.equal(options.redirect, "error");
        assert.equal(url.origin, "https://native.invalid");
        if (route === "GET Library/VirtualFolders")
          return Response.json([{ ItemId: folder, Name: "Reviewed library" }]);
        if (route === "GET Users") return Response.json([]);
        if (route === `GET Users/${id}`) return Response.json(account);
        assert.ok(effects.includes("claimed"));
        effects.push(route);
        if (route === "POST Users/New") {
          const body = JSON.parse(options.body);
          assert.equal(body.Name, "synthetic-new");
          assert.ok(body.Password.length >= 64);
          assert.notEqual(body.Password, "synthetic-final-password");
          account = {
            Id: id,
            Name: body.Name,
            Policy: {
              IsAdministrator: false,
              AuthenticationProviderId: "installed-native",
              PasswordResetProviderId: "installed-reset",
            },
          };
          if (failAt === "create") throw Error("secret transport detail");
          return Response.json(account);
        }
        assert.ok(effects.includes(`recorded:${id}`));
        if (route === `POST Users/${id}/Policy`) {
          account.Policy = JSON.parse(options.body);
          if (drift) account.Policy.EnableAllFolders = true;
          if (failAt === "policy") throw Error("secret transport detail");
        } else if (route === "POST Users/Password") {
          assert.equal(url.searchParams.get("userId"), id);
          assert.deepEqual(JSON.parse(options.body), {
            NewPw: "synthetic-final-password",
            ResetPassword: false,
          });
          if (failAt === "password") throw Error("secret transport detail");
        } else assert.fail(route);
        return new Response(null, { status: 204 });
      },
    },
  );
  return {
    adapter,
    effects,
    changeAccount: (change) => change(account),
    options: {
      password: "synthetic-final-password",
      claimEffect: async () => {
        effects.push("claimed");
      },
      recordNativeId: async (nativeId) => {
        if (failAt === "receipt") throw Error("disk unavailable");
        effects.push(`recorded:${nativeId}`);
      },
    },
  };
}

test("new account receives only explicit playback libraries before its separate native credential", async () => {
  const { adapter, effects, options } = fixture();
  const review = await adapter.preview({
    username: "synthetic-new",
    folderIds: [folder],
  });
  assert.deepEqual(await adapter.provision(review, options), {
    state: "created",
    nativeId: id,
    mapping: "separate-exact-id-review",
  });
  assert.deepEqual(effects, [
    "claimed",
    "POST Users/New",
    `recorded:${id}`,
    `POST Users/${id}/Policy`,
    "POST Users/Password",
  ]);
  const policy = newJellyfinPlaybackPolicy(
    {
      Id: id,
      Policy: {
        IsAdministrator: false,
        AuthenticationProviderId: "native",
        PasswordResetProviderId: "reset",
      },
    },
    [folder],
  );
  assert.equal(policy.EnableAllFolders, false);
  assert.deepEqual(policy.EnabledFolders, [folder]);
  for (const key of [
    "IsAdministrator",
    "EnableContentDeletion",
    "EnableContentDownloading",
    "EnablePublicSharing",
    "EnableLiveTvAccess",
    "EnableSharedDeviceControl",
    "EnableRemoteControlOfOtherUsers",
    "EnableCollectionManagement",
  ])
    assert.equal(policy[key], false);
});

test("all uncertain stages stop without releasing credentials, retries or deletion", async () => {
  for (const failAt of ["create", "receipt", "policy", "password"]) {
    const { adapter, effects, options } = fixture({ failAt });
    const review = await adapter.preview({
      username: "synthetic-new",
      folderIds: [folder],
    });
    const result = await adapter.provision(review, options);
    assert.equal(result.state, "effect-unknown");
    assert.equal(result.nativeId, failAt === "create" ? undefined : id);
    assert.equal(
      effects.filter((effect) => effect === "POST Users/New").length,
      1,
    );
    if (failAt !== "password")
      assert.ok(!effects.includes("POST Users/Password"));
    assert.ok(!JSON.stringify(result).includes("secret"));
  }
  const { adapter, effects, options } = fixture({ drift: true });
  const review = await adapter.preview({
    username: "synthetic-new",
    folderIds: [folder],
  });
  assert.equal(
    (await adapter.provision(review, options)).state,
    "effect-unknown",
  );
  assert.ok(!effects.includes("POST Users/Password"));
});

test("stale review, invalid selection and failed durable claim cause zero native writes", async () => {
  const { adapter, effects, options } = fixture();
  await assert.rejects(
    adapter.preview({ username: "synthetic-new", folderIds: [id] }),
    { status: 400 },
  );
  await assert.rejects(
    adapter.preview({ username: "bad username", folderIds: [folder] }),
    { status: 400 },
  );
  const review = await adapter.preview({
    username: "synthetic-new",
    folderIds: [folder],
  });
  await assert.rejects(
    adapter.provision(review, { ...options, password: "short" }),
    { status: 400 },
  );
  await assert.rejects(
    adapter.provision({ ...review, profile: "all-folders" }, options),
  );
  await assert.rejects(
    adapter.provision(review, {
      ...options,
      claimEffect: async () => {
        throw Error("db unavailable");
      },
    }),
  );
  assert.deepEqual(effects, []);
});

test("finish-link verification is exact-ID read-only, tolerates login counters but rejects policy or name drift", async () => {
  const { adapter, effects, options, changeAccount } = fixture();
  const review = await adapter.preview({
    username: "synthetic-new",
    folderIds: [folder],
  });
  await adapter.provision(review, options);
  const writes = [...effects];
  changeAccount((account) => {
    account.Policy.InvalidLoginAttemptCount = 2;
  });
  await adapter.inspectCreated(id, review);
  changeAccount((account) => {
    account.Policy.EnableContentDownloading = true;
  });
  await assert.rejects(adapter.inspectCreated(id, review));
  changeAccount((account) => {
    account.Policy.EnableContentDownloading = false;
    account.Name = "another";
  });
  await assert.rejects(adapter.inspectCreated(id, review));
  await assert.rejects(adapter.inspectCreated("not-an-exact-id", review));
  assert.deepEqual(effects, writes);
});
