// Opt-in isolated native contract check. Never reads host or production configuration.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createJellyfinNativeFixture } from "./fixtures/jellyfin-native.mjs";
import { createJellyfinLifecycle } from "../src/jellyfin-lifecycle.mjs";
import { normalizeJellyfinUsers } from "../src/jellyfin-inventory.mjs";

let fixture;
let phase = "start";
try {
  fixture = await createJellyfinNativeFixture();
  const { baseUrl, api, session, token, libraries, adapter } = fixture;
  phase = "review";
  const review = await adapter.preview({
    username: "synthetic-recipient",
    folderIds: [libraries[0].ItemId],
  });
  const effects = [];
  const recipientPassword = randomBytes(32).toString("base64url");
  phase = "provision";
  const result = await adapter.provision(review, {
    password: recipientPassword,
    claimEffect: async () => effects.push("claimed"),
    recordNativeId: async (id) => effects.push(id),
  });
  assert.equal(
    result.state,
    "created",
    "isolated provisioning did not complete",
  );
  assert.deepEqual(effects, ["claimed", result.nativeId]);
  phase = "recipient-sign-in";
  const recipient = await api("Users/AuthenticateByName", {
    method: "POST",
    body: { Username: "synthetic-recipient", Pw: recipientPassword },
  });
  assert.equal(recipient.User.Id, result.nativeId);
  assert.equal(recipient.User.Policy.IsAdministrator, false);
  assert.equal(recipient.User.Policy.EnableAllFolders, false);
  assert.deepEqual(recipient.User.Policy.EnabledFolders, [libraries[0].ItemId]);
  const users = await api("Users", { token });
  assert.equal(users.length, 2);
  assert.equal(normalizeJellyfinUsers(users).length, 2);
  phase = "synthetic-disable";
  const lifecycle = createJellyfinLifecycle(
    { baseUrl, writeTokenFile: "/synthetic/in-memory-only" },
    { readToken: async () => token },
  );
  const disableReview = await lifecycle.inspect(result.nativeId);
  assert.equal(
    (await lifecycle.disable(disableReview, async () => {})).state,
    "disabled",
  );
  assert.deepEqual(
    (await api("Users", { token })).find((user) => user.Id === session.User.Id)
      .Policy,
    session.User.Policy,
  );
  console.log(
    "PASS isolated pinned Jellyfin12.4: compact-ID inventory, reviewed selected-library creation, claim/ID checkpoint, policy verification, separate native password, real recipient sign-in and reviewed synthetic disable; owner unchanged.",
  );
} catch {
  throw new Error(
    `Isolated Jellyfin provisioning contract failed during ${phase}; no provider response or credentials are logged.`,
  );
} finally {
  fixture?.close();
}
