// Opt-in isolated native contract check. Never reads host or production configuration.
import assert from "node:assert/strict";
import { createSeerrProvisioning } from "../src/seerr-provisioning.mjs";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createJellyfinNativeFixture } from "./fixtures/jellyfin-native.mjs";
import { createJellyfinLifecycle } from "../src/jellyfin-lifecycle.mjs";
import { normalizeJellyfinUsers } from "../src/jellyfin-inventory.mjs";

const name = `harrhy-seerr-import-test-${randomBytes(6).toString("hex")}`;
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const network = `${name}-network`;
const seerrName = `${name}-seerr`;
let networkOwned = false;
let seerrOwned = false;
let fixture;
let phase = "start";
let lastStatus;
try {
  docker("network", "create", network);
  networkOwned = true;
  fixture = await createJellyfinNativeFixture({ network });
  const { baseUrl, api, session, token, password, libraries, adapter } =
    fixture;
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

  phase = "seerr-start";
  docker(
    "run",
    "--detach",
    "--rm",
    "--name",
    seerrName,
    "--network",
    network,
    "--publish",
    "127.0.0.1::5055",
    "--tmpfs",
    "/app/config:uid=1000,gid=1000",
    "ghcr.io/seerr-team/seerr@sha256:aadee014b40e28cf9aa4928bc9d1183a6eb08f8c44d543cddc9efdcb16549be2",
  );
  seerrOwned = true;
  const seerrBindings = JSON.parse(
    docker(
      "inspect",
      "--format",
      '{{json (index .NetworkSettings.Ports "5055/tcp")}}',
      seerrName,
    ),
  );
  assert.equal(seerrBindings.length, 1);
  assert.equal(seerrBindings[0].HostIp, "127.0.0.1");
  const seerrBase = `http://127.0.0.1:${seerrBindings[0].HostPort}/api/v1`;
  let cookie;
  async function seerrApi(
    path,
    { method = "GET", body, sessionCookie = cookie } = {},
  ) {
    const response = await fetch(`${seerrBase}/${path}`, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        Accept: "application/json",
        ...(sessionCookie ? { Cookie: sessionCookie } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    lastStatus = response.status;
    assert.ok(response.ok, `isolated native Seerr failed in ${phase}`);
    const cookies = response.headers.getSetCookie();
    if (cookies.length)
      cookie = cookies.map((value) => value.split(";")[0]).join("; ");
    return response.json();
  }
  let seerrReady = false;
  for (let attempt = 0; attempt < 180; attempt++) {
    try {
      await seerrApi("status");
      seerrReady = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  assert.ok(seerrReady, "isolated Seerr startup timed out");
  phase = "seerr-owner-setup";
  const seerrOwner = await seerrApi("auth/jellyfin", {
    method: "POST",
    body: {
      username: "synthetic-owner",
      password,
      hostname: fixture.name,
      port: 8096,
      useSsl: false,
      urlBase: "",
      serverType: 2,
    },
  });
  assert.equal(seerrOwner.id, 1);
  phase = "seerr-synthetic-defaults";
  const main = await seerrApi("settings/main", {
    method: "POST",
    body: { defaultPermissions: 160 },
  });
  assert.equal(main.mediaServerType, 2);
  assert.equal(main.defaultPermissions, 160);
  assert.ok(main.apiKey);
  const importer = createSeerrProvisioning(
    { baseUrl: seerrBase, writeTokenFile: "/synthetic/in-memory-only" },
    {
      readToken: async () => main.apiKey,
      fetcher: async (url, options) => {
        const response = await fetch(url, options);
        lastStatus = response.status;
        return response;
      },
    },
  );
  phase = "seerr-review";
  const importReview = await importer.preview({
    jellyfinNativeId: result.nativeId,
  });
  assert.equal(importReview.permissions, 160);
  const importEffects = [];
  phase = "seerr-import";
  const imported = await importer.provision(importReview, {
    claimEffect: async () => importEffects.push("claim"),
    recordNativeId: async (id) => importEffects.push(id),
  });
  assert.equal(imported.state, "created");
  assert.deepEqual(importEffects, ["claim", imported.nativeId]);
  const unchangedOwner = await seerrApi("user/1");
  assert.equal(unchangedOwner.permissions, 2);
  assert.equal(unchangedOwner.jellyfinUserId, session.User.Id);
  const importedRequests = await seerrApi(
    `user/${imported.nativeId}/requests?take=100&skip=0`,
  );
  assert.equal(importedRequests.pageInfo.results, 0);
  phase = "seerr-recipient-login";
  const recipientSeerr = await seerrApi("auth/jellyfin", {
    method: "POST",
    sessionCookie: "",
    body: { username: "synthetic-recipient", password: recipientPassword },
  });
  assert.equal(String(recipientSeerr.id), imported.nativeId);
  assert.equal(recipientSeerr.permissions, 160);
  assert.equal(recipientSeerr.userType, 3);
  phase = "seerr-duplicate-rejection";
  await assert.rejects(importer.preview({ jellyfinNativeId: result.nativeId }));

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
  assert.equal(
    (await api("Users", { token })).find((user) => user.Id === session.User.Id)
      .Policy.IsAdministrator,
    true,
  );
  console.log(
    "PASS isolated pinned Seerr3.5.2 + Jellyfin12.4: exact-ID import160, returned-ID receipt, real native recipient login, existing-association rejection; compact-ID inventory, reviewed selected-library creation, claim/ID checkpoint, policy verification, separate native password, real recipient sign-in and reviewed synthetic disable; owner unchanged.",
  );
} catch {
  throw new Error(
    `Isolated Seerr/Jellyfin provisioning contract failed during ${phase} (last HTTP status ${lastStatus ?? "none"}); no provider response or credentials are logged.`,
  );
} finally {
  try {
    if (seerrOwned) docker("stop", "--time", "5", seerrName);
  } finally {
    try {
      fixture?.close();
    } finally {
      if (networkOwned) docker("network", "rm", network);
    }
  }
}
