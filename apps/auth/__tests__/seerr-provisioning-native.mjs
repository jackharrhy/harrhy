// Opt-in isolated native contract check. Never reads host or production configuration.
import assert from "node:assert/strict";
import { createSeerrProvisioning } from "../src/seerr-provisioning.mjs";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createJellyfinProvisioning } from "../src/jellyfin-provisioning.mjs";
import { createJellyfinLifecycle } from "../src/jellyfin-lifecycle.mjs";
import { normalizeJellyfinUsers } from "../src/jellyfin-inventory.mjs";

const image =
  "jellyfin/jellyfin@sha256:fea863d0cd9ec445985d9c75fc6ed64e38a1d2766cf0c250a33d553f4fc1b771";
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
let owned = false;
let phase = "start";
let lastStatus;
try {
  docker("network", "create", network);
  networkOwned = true;
  docker(
    "run",
    "--detach",
    "--rm",
    "--name",
    name,
    "--network",
    network,
    "--publish",
    "127.0.0.1::8096",
    "--tmpfs",
    "/config",
    "--tmpfs",
    "/cache",
    "--tmpfs",
    "/synthetic-media",
    image,
  );
  owned = true;
  const bindings = JSON.parse(
    docker(
      "inspect",
      "--format",
      '{{json (index .NetworkSettings.Ports "8096/tcp")}}',
      name,
    ),
  );
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].HostIp, "127.0.0.1");
  const baseUrl = `http://127.0.0.1:${bindings[0].HostPort}`;
  async function api(path, { method = "GET", body, token, json = true } = {}) {
    const response = await fetch(`${baseUrl}/${path}`, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: {
        Accept: 'application/json; profile="PascalCase"',
        ...(body ? { "Content-Type": "application/json" } : {}),
        Authorization: `MediaBrowser Client="Auth isolated contract", Device="Synthetic", DeviceId="synthetic-contract", Version="1"${token ? `, Token="${token}"` : ""}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    lastStatus = response.status;
    assert.ok(response.ok, `native request failed in ${phase}`);
    return json ? response.json() : undefined;
  }
  phase = "startup";
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      await api("Startup/Configuration");
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  assert.ok(ready, "isolated provider startup timed out");
  assert.equal((await api("System/Info/Public")).Version, "12.4.0");
  const password = randomBytes(32).toString("base64url");
  phase = "startup-configuration";
  await api("Startup/Configuration", {
    method: "POST",
    body: {
      ServerName: "Synthetic provisioning contract",
      UICulture: "en-US",
      MetadataCountryCode: "US",
      PreferredMetadataLanguage: "en",
    },
    json: false,
  });
  phase = "startup-user";
  await api("Startup/User");
  await api("Startup/User", {
    method: "POST",
    body: { Name: "synthetic-owner", Password: password },
    json: false,
  });
  phase = "startup-complete";
  await api("Startup/Complete", { method: "POST", json: false });
  phase = "owner-sign-in";
  const session = await api("Users/AuthenticateByName", {
    method: "POST",
    body: { Username: "synthetic-owner", Pw: password },
  });
  assert.ok(session.AccessToken);
  const token = session.AccessToken;
  phase = "library";
  await api(
    "Library/VirtualFolders?name=Synthetic&collectionType=movies&refreshLibrary=false",
    {
      method: "POST",
      body: { LibraryOptions: { PathInfos: [{ Path: "/synthetic-media" }] } },
      token,
      json: false,
    },
  );
  const libraries = await api("Library/VirtualFolders", { token });
  assert.equal(libraries.length, 1);
  const adapter = createJellyfinProvisioning(
    { baseUrl, writeTokenFile: "/synthetic/in-memory-only" },
    { readToken: async () => token },
  );
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
      hostname: name,
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
    users.find((user) => user.Id === session.User.Id).Policy.IsAdministrator,
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
  if (seerrOwned) docker("stop", "--time", "5", seerrName);
  if (owned) docker("stop", "--time", "5", name);
  if (networkOwned) docker("network", "rm", network);
}
