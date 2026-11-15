import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createAccessStore } from "../../src/access-store.mjs";

const preview = process.env.AUTH_MANAGEMENT_PREVIEW === "1";
const previewOrigin = "https://media-mogul.pi.jackharrhy.dev";
const previewMinutes = Number(process.env.AUTH_MANAGEMENT_PREVIEW_MINUTES || 55);
if (preview && (!Number.isInteger(previewMinutes) || previewMinutes < 1 || previewMinutes > 720)) {
  throw new Error("Preview duration must be 1–720 minutes");
}
const directory = await mkdtemp(`${tmpdir()}/auth-management-`);
const applications = JSON.parse(
  readFileSync(new URL("../../config/applications.json", import.meta.url)),
);
const services = JSON.parse(
  readFileSync(new URL("../../config/services.json", import.meta.url)),
);
const maps = applications.find((item) => item.id === "maps"),
  artbin = applications.find((item) => item.id === "artbin");
const users = [
  {
    id: "operator",
    userName: "operator",
    state: "USER_STATE_ACTIVE",
    human: {
      profile: { displayName: "Robin Operator" },
      email: { isEmailVerified: true },
    },
    details: { resourceOwner: "org" },
  },
  {
    id: "member",
    userName: "member",
    state: "USER_STATE_ACTIVE",
    human: {
      profile: { displayName: "Sam Member" },
      email: { isEmailVerified: true },
    },
    details: { resourceOwner: "org" },
  },
];
let grants = [
  {
    id: "owner-maps",
    userId: "operator",
    projectId: maps.projectId,
    state: "USER_GRANT_STATE_ACTIVE",
    roleKeys: ["admin"],
  },
  {
    id: "member-maps",
    userId: "member",
    projectId: maps.projectId,
    state: "USER_GRANT_STATE_ACTIVE",
    roleKeys: ["member", "private-extra"],
  },
];
for (const [id, role] of [
  ["fourm", "member"],
  ["burger", "member"],
  ["lists", "admin"],
  ["ref", "admin"],
  ["media-admin", "admin"],
]) {
  grants.push({
    id: `operator-${id}`,
    userId: "operator",
    projectId: applications.find((item) => item.id === id).projectId,
    state: "USER_GRANT_STATE_ACTIVE",
    roleKeys: [role],
  });
}
let writes = 0;
let identityWrites = 0;
let invitationLink;
const recipientEffects = [];
let recipientPassword;
const sessions = new Map();
const store = createAccessStore({
  filename: `${directory}/access.sqlite`,
  applications,
  services,
  native: {},
});
store.bootstrap({ administrator: "operator", grants });
store.close();
await writeFile(`${directory}/key.json`, '{"token":"synthetic-only"}', {
  mode: 0o600,
});
const nativeSnapshot = {
  service: "jellyfin",
  instance: "synthetic-server",
  state: "available",
  observedAt: new Date().toISOString(),
  accounts: [
    {
      nativeId: "11111111-2222-4333-8444-555555555555",
      name: "Morgan Native",
      disabled: false,
      administrator: false,
    },
    {
      nativeId: "synthetic-native-b",
      name: "Taylor Native",
      disabled: false,
      administrator: false,
    },
  ],
};
await writeFile(
  `${directory}/media-snapshot.json`,
  JSON.stringify(nativeSnapshot),
);
const seerrSnapshot = {
  ...nativeSnapshot,
  service: "seerr",
  accounts: [
    {
      nativeId: "42",
      name: "Casey Requests",
      disabled: false,
      administrator: false,
    },
    {
      nativeId: "160",
      name: "Unchanged Native",
      disabled: false,
      administrator: false,
    },
  ],
};
await writeFile(
  `${directory}/seerr-snapshot.json`,
  JSON.stringify(seerrSnapshot),
);
await writeFile(
  `${directory}/media-instances.json`,
  JSON.stringify([
    {
      service: "jellyfin",
      instance: "synthetic-server",
      name: "Synthetic Jellyfin",
      snapshotFile: `${directory}/media-snapshot.json`,
    },
    {
      service: "seerr",
      instance: "synthetic-server",
      name: "Synthetic Seerr",
      snapshotFile: `${directory}/seerr-snapshot.json`,
    },
  ]),
);
let nativeWrites = 0;
let nativeCreations = 0;
let createdNative;
const selectedLibrary = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const createdNativeId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
let seerrDeletes = 0;
let seerrImports = 0;
const importedSeerrUser = {
  id: 73,
  jellyfinUserId: createdNativeId,
  jellyfinUsername: "synthetic-recipient",
  permissions: 160,
  userType: 3,
};
let nativePolicy = {
  IsAdministrator: false,
  IsDisabled: false,
  AuthenticationProviderId: "synthetic-auth",
  PasswordResetProviderId: "synthetic-reset",
  EnableAllFolders: true,
};
const nativeServer = createServer(async (request, response) => {
  if (
    [
      "/api/v1/settings/main",
      "/api/v1/settings/jellyfin/users",
      `/api/v1/user/jellyfin/${createdNativeId}`,
      "/api/v1/user/import-from-jellyfin",
      "/api/v1/user/73",
    ].includes(request.url)
  ) {
    assert.equal(request.headers["x-api-key"], "synthetic-write-only");
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/api/v1/settings/main")
      response.end(
        JSON.stringify({
          mediaServerType: 2,
          defaultPermissions: 160,
          apiKey: "private-never-retained",
        }),
      );
    else if (request.url === "/api/v1/settings/jellyfin/users")
      response.end(
        JSON.stringify([
          { id: createdNativeId, username: "synthetic-recipient" },
        ]),
      );
    else if (request.url === `/api/v1/user/jellyfin/${createdNativeId}`)
      response.writeHead(404).end();
    else if (request.url === "/api/v1/user/import-from-jellyfin") {
      assert.equal(request.method, "POST");
      let body = "";
      for await (const chunk of request) body += chunk;
      assert.deepEqual(JSON.parse(body), {
        jellyfinUserIds: [createdNativeId],
      });
      seerrImports++;
      response.writeHead(201).end(JSON.stringify([importedSeerrUser]));
    } else response.end(JSON.stringify(importedSeerrUser));
    return;
  }
  if (request.url.startsWith("/api/v1/user/")) {
    assert.equal(request.headers["x-api-key"], "synthetic-write-only");
    assert(
      !request.url.includes("160"),
      "Unselected native-only account must remain untouched",
    );
    response.setHeader("Content-Type", "application/json");
    if (request.method === "GET" && request.url === "/api/v1/user/42")
      response.end(JSON.stringify({ id: 42, permissions: 32 }));
    else if (
      request.method === "GET" &&
      request.url === "/api/v1/user/42/requests?take=100&skip=0"
    )
      response.end(
        JSON.stringify({
          pageInfo: { results: 1 },
          results: [
            {
              id: 99,
              status: 2,
              updatedAt: "2026-01-01T00:00:00Z",
              requestedBy: { id: 42 },
            },
          ],
        }),
      );
    else if (request.method === "DELETE" && request.url === "/api/v1/user/42") {
      seerrDeletes++;
      response.writeHead(204).end();
    } else response.writeHead(404).end();
    return;
  }
  assert.equal(
    request.headers.authorization,
    'MediaBrowser Token="synthetic-write-only"',
  );
  const json = (value) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(value));
  };
  if (request.url === "/Library/VirtualFolders" && request.method === "GET") {
    json([{ ItemId: selectedLibrary, Name: "Synthetic Movies" }]);
    return;
  }
  if (request.url === "/Users" && request.method === "GET") {
    json([
      { Id: nativeSnapshot.accounts[0].nativeId, Name: "Morgan Native" },
      ...(createdNative ? [createdNative] : []),
    ]);
    return;
  }
  if (request.url === "/Users/New" && request.method === "POST") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    assert.equal(input.Name, "synthetic-recipient");
    assert(input.Password.length >= 48);
    assert.notEqual(input.Password, "Synthetic-native-passphrase-42");
    nativeCreations++;
    createdNative = {
      Id: createdNativeId,
      Name: input.Name,
      Policy: { ...nativePolicy, IsDisabled: false },
    };
    json(createdNative);
    return;
  }
  if (request.url === `/Users/${createdNativeId}` && request.method === "GET") {
    json(createdNative);
    return;
  }
  if (
    request.url === `/Users/${createdNativeId}/Policy` &&
    request.method === "POST"
  ) {
    let body = "";
    for await (const chunk of request) body += chunk;
    createdNative.Policy = JSON.parse(body);
    assert.equal(createdNative.Policy.IsAdministrator, false);
    assert.deepEqual(createdNative.Policy.EnabledFolders, [selectedLibrary]);
    response.writeHead(204).end();
    return;
  }
  if (
    request.url === `/Users/Password?userId=${createdNativeId}` &&
    request.method === "POST"
  ) {
    let body = "";
    for await (const chunk of request) body += chunk;
    assert.deepEqual(JSON.parse(body), {
      NewPw: "Synthetic-native-passphrase-42",
      ResetPassword: false,
    });
    assert.equal(createdNative.Policy.EnableAllFolders, false);
    response.writeHead(204).end();
    return;
  }
  const userPath = `/Users/${nativeSnapshot.accounts[0].nativeId}`;
  if (request.method === "GET" && request.url === userPath) {
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        Id: nativeSnapshot.accounts[0].nativeId,
        Policy: nativePolicy,
      }),
    );
  } else if (
    request.method === "POST" &&
    request.url === `${userPath}/Policy`
  ) {
    let body = "";
    for await (const chunk of request) body += chunk;
    const next = JSON.parse(body);
    assert.deepEqual(next, { ...nativePolicy, IsDisabled: true });
    nativePolicy = next;
    nativeWrites++;
    response.writeHead(204).end();
  } else response.writeHead(404).end();
});
await new Promise((resolve) => nativeServer.listen(0, "127.0.0.1", resolve));
await writeFile(`${directory}/native-write-token`, "synthetic-write-only", {
  mode: 0o600,
});
await writeFile(
  `${directory}/media-writes.json`,
  JSON.stringify([
    {
      service: "jellyfin",
      instance: "synthetic-server",
      baseUrl: `http://127.0.0.1:${nativeServer.address().port}`,
      writeTokenFile: `${directory}/native-write-token`,
    },
    {
      service: "seerr",
      instance: "synthetic-server",
      baseUrl: `http://127.0.0.1:${nativeServer.address().port}/api/v1`,
      writeTokenFile: `${directory}/native-write-token`,
    },
  ]),
);
const provider = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  const data = body ? JSON.parse(body) : {};
  let result;
  const sessionPath =
    request.url === "/v2/sessions/search"
      ? null
      : request.url.match(/^\/v2\/sessions\/([^/]+)$/);
  const userPath = request.url.match(/^\/management\/v1\/users\/([^/]+)$/);
  const identityPath = request.url.match(/^\/v2\/users\/([^/]+)(.*)$/);
  if (identityPath && identityPath[1] !== "new") {
    const user = users.find((item) => item.id === identityPath[1]);
    assert(user, "Only the explicitly created identity may be accessed");
    const action = identityPath[2];
    if (!action) result = { user: { ...user, userId: user.id } };
    else if (action === "/invite_code") {
      assert.equal(request.method, "POST");
      invitationLink = data.sendCode.urlTemplate
        .replace("{{.UserID}}", user.id)
        .replace("{{.Code}}", "synthetic-invitation-proof")
        .replace("{{.OrgID}}", "org");
      recipientEffects.push("send");
      result = {};
    } else if (action === "/invite_code/verify") {
      assert.equal(data.verificationCode, "synthetic-invitation-proof");
      recipientEffects.push("verify");
      result = {};
    } else if (action === "/password_reset") {
      assert.deepEqual(recipientEffects, ["send", "verify"]);
      assert.deepEqual(data, { returnCode: {} });
      recipientEffects.push("reset");
      result = { verificationCode: "synthetic-password-proof" };
    } else if (action === "/password") {
      assert.equal(data.verificationCode, "synthetic-password-proof");
      recipientPassword = data.newPassword.password;
      recipientEffects.push("password");
      result = {};
    } else assert.fail(`Unexpected identity endpoint: ${action}`);
  } else if (request.url === "/management/v1/policies/password/complexity") {
    result = { policy: { minLength: 12 } };
  } else if (request.url === "/v2/users/new" && request.method === "POST") {
    assert.equal(data.human.password, undefined);
    assert.deepEqual(data.human.email.returnCode, {});
    assert.equal(data.organizationId, "org");
    identityWrites++;
    users.push({
      id: data.userId,
      userName: data.username,
      state: "USER_STATE_ACTIVE",
      human: {
        profile: data.human.profile,
        email: { email: data.human.email.email },
      },
      details: { resourceOwner: "org" },
    });
    result = { id: data.userId };
  } else if (request.url === "/v2/sessions" && request.method === "POST") {
    const user = users.find(
      (candidate) => candidate.userName === data.checks.user.loginName,
    );
    if (
      !user ||
      data.checks.password.password !==
        (user.userName === "new-person"
          ? recipientPassword
          : "fixture-password")
    ) {
      response.writeHead(401);
      response.end("{}");
      return;
    }
    const id = `session-${sessions.size + 1}`;
    sessions.set(id, {
      id,
      factors: {
        user: { id: user.id },
        password: { verifiedAt: new Date().toISOString() },
      },
      expirationDate: new Date(Date.now() + 600000).toISOString(),
    });
    result = { sessionId: id, sessionToken: "synthetic-proof" };
  } else if (sessionPath && request.method === "DELETE") {
    sessions.delete(sessionPath[1]);
    result = {};
  } else if (sessionPath) {
    result = { session: sessions.get(sessionPath[1]) };
  } else if (request.url === "/v2/sessions/search") {
    const subject = data.queries[0].userIdQuery.id;
    result = {
      sessions: [...sessions.values()].filter(
        (session) => session.factors.user.id === subject,
      ),
    };
  } else if (request.url === "/management/v1/users/_search")
    result = { result: users };
  else if (userPath)
    result = { user: users.find((user) => user.id === userPath[1]) };
  else if (request.url === "/management/v1/users/grants/_search")
    result = {
      result: grants.filter(
        (grant) =>
          !data.queries?.some(
            (query) =>
              query.projectIdQuery &&
              query.projectIdQuery.projectId !== grant.projectId,
          ),
      ),
    };
  else if (
    request.url ===
    "/zitadel.authorization.v2.AuthorizationService/ListAuthorizations"
  ) {
    assert.equal(request.headers["connect-protocol-version"], "1");
    const ids = data.filters?.find((filter) => filter.inUserIds)?.inUserIds.ids;
    result = {
      authorizations: grants
        .filter((grant) => !ids || ids.includes(grant.userId))
        .map((grant) => ({
          id: grant.id,
          organization: { id: "org" },
          project: { id: grant.projectId },
          user: { id: grant.userId },
          state:
            grant.state === "USER_GRANT_STATE_ACTIVE"
              ? "STATE_ACTIVE"
              : "STATE_INACTIVE",
          roles: grant.roleKeys.map((key) => ({ key })),
        })),
    };
  } else if (
    request.url ===
    "/zitadel.authorization.v2.AuthorizationService/CreateAuthorization"
  ) {
    writes++;
    const id = `grant-${writes}`;
    grants.push({
      id,
      userId: data.userId,
      projectId: data.projectId,
      state: "USER_GRANT_STATE_ACTIVE",
      roleKeys: data.roleKeys,
    });
    result = { id };
  } else if (
    request.url ===
    "/zitadel.authorization.v2.AuthorizationService/UpdateAuthorization"
  ) {
    writes++;
    grants.find((grant) => grant.id === data.id).roleKeys = data.roleKeys;
    result = {};
  } else if (
    request.url ===
    "/zitadel.authorization.v2.AuthorizationService/DeleteAuthorization"
  ) {
    writes++;
    grants = grants.filter((grant) => grant.id !== data.id);
    result = {};
  } else {
    response.writeHead(404);
    response.end("{}");
    return;
  }
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(result));
});
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
const reservation = createServer();
await new Promise((resolve) =>
  reservation.listen(preview ? 19067 : 0, "127.0.0.1", resolve),
);
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
    "-keyout",
    `${directory}/tls.key`,
    "-out",
    `${directory}/tls.crt`,
  ],
  { stdio: "ignore" },
);
const proxy = createHttpsServer(
  {
    key: await readFile(`${directory}/tls.key`),
    cert: await readFile(`${directory}/tls.crt`),
  },
  (incoming, outgoing) => {
    const upstream = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: incoming.url,
        method: incoming.method,
        headers: incoming.headers,
      },
      (reply) => {
        outgoing.writeHead(reply.statusCode, reply.headers);
        reply.pipe(outgoing);
      },
    );
    upstream.on("error", () => {
      outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.pipe(upstream);
  },
);
await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
const origin = preview
  ? previewOrigin
  : `https://127.0.0.1:${proxy.address().port}`;
const server = spawn(process.execPath, ["src/server.mjs"], {
  env: {
    PATH: process.env.PATH,
    HOME: directory,
    LISTEN_HOST: "127.0.0.1",
    PORT: String(port),
    PUBLIC_ORIGIN: origin,
    ZITADEL_API_URL: `http://127.0.0.1:${provider.address().port}`,
    LOGIN_TOKEN_FILE: `${directory}/key.json`,
    MANAGEMENT_TOKEN_FILE: `${directory}/key.json`,
    AUTH_PROVISIONING_TOKEN_FILE: `${directory}/key.json`,
    ACCESS_DB_FILE: `${directory}/access.sqlite`,
    AUTH_MEDIA_INSTANCES_FILE: `${directory}/media-instances.json`,
    AUTH_MEDIA_WRITES_FILE: `${directory}/media-writes.json`,
    ORGANIZATION_ID: "org",
    LORE_PROJECT_ID: "unused",
    LORE_CLIENT_ID: "unused",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stderr.on("data", (data) => (logs += data));
let browser;
const snapshots = process.env.AUTH_SCREENSHOT_DIR;
async function capture(page, name) {
  if (snapshots) {
    await mkdir(snapshots, { recursive: true });
    await page.screenshot({ path: `${snapshots}/${name}.png`, fullPage: true });
    await mkdir(`${snapshots}/assets/fonts`, { recursive: true });
    await writeFile(
      `${snapshots}/assets/style.css`,
      readFileSync(new URL("../../src/styles.css", import.meta.url)),
    );
    await writeFile(
      `${snapshots}/assets/fonts/inter-variable.woff2`,
      readFileSync(
        new URL("../../public/fonts/inter-variable.woff2", import.meta.url),
      ),
    );
    await writeFile(`${snapshots}/${name}.html`, await page.content());
  }
}
try {
  await once(server.stdout, "data");
  if (preview) {
    console.log(`Synthetic management preview ready: ${origin}`);
    await new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        process.off("SIGTERM", finish);
        process.off("SIGINT", finish);
        resolve();
      };
      const timer = setTimeout(finish, previewMinutes * 60 * 1000);
      process.once("SIGTERM", finish);
      process.once("SIGINT", finish);
    });
  } else {
  browser = await chromium.launch();
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.name));
  await page.goto(origin + "/login");
  await page.getByRole("heading", { name: "auth", exact: true }).waitFor();
  assert.equal(await page.locator("footer").count(), 0);
  assert.equal(
    await page.getByText("Your account, your apps.", { exact: true }).count(),
    0,
  );
  assert(
    (
      await page
        .locator("h1")
        .evaluate((node) => getComputedStyle(node).fontFamily)
    ).includes("Inter"),
  );
  await capture(page, "login-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "login-mobile");
  await page.setViewportSize({ width: 768, height: 1024 });
  await capture(page, "login-tablet");
  await page.emulateMedia({ colorScheme: "dark" });
  await capture(page, "login-dark");
  await page.emulateMedia({ colorScheme: "light" });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Username or email").fill("operator");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(origin + "/");
  assert.equal(await page.locator("h1").innerText(), "Your apps");
  await page.getByRole("link", { name: "Worldview", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Apps", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Media", exact: true }).waitFor();
  await page
    .getByRole("heading", { name: "Your tools", exact: true })
    .waitFor();
  await capture(page, "apps-desktop");
  await page
    .getByRole("link", { name: "Services", exact: true })
    .first()
    .click();
  await page.getByRole("heading", { name: "Services", exact: true }).waitFor();
  await page.getByRole("link", { name: "Worldview", exact: true }).click();
  await page.getByRole("heading", { name: "Worldview", exact: true }).waitFor();
  await page
    .getByRole("link", { name: "Services", exact: true })
    .last()
    .click();
  await page
    .getByRole("link", { name: "Service accounts", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Synthetic Jellyfin", exact: true })
    .click();
  assert.equal(
    await page.getByText("Not linked to Auth", { exact: true }).count(),
    2,
  );
  await capture(page, "media-desktop");
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await capture(page, `media-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const mediaForm = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Morgan Native", exact: true }),
    })
    .locator("form");
  await mediaForm.getByLabel("Existing Auth identity").selectOption("member");
  await mediaForm
    .getByLabel("Reason")
    .fill(
      "Verified synthetic exact IDs; preserve the other native-only account.",
    );
  await mediaForm
    .getByRole("button", { name: "Review identity link", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Review identity link", exact: true })
    .waitFor();
  await capture(page, "media-review");
  const mediaCsrf = await page.locator("input[name=csrf]").first().inputValue();
  const mediaOperation = await page
    .locator("input[name=operation]")
    .inputValue();
  const forgedMedia = await context.request.post(
    origin + "/manage/media/confirm",
    {
      headers: { origin: "https://wrong.example" },
      form: { csrf: mediaCsrf, operation: mediaOperation, confirmed: "true" },
    },
  );
  assert.equal(forgedMedia.status(), 403);
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Record reviewed identity link", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Identity link recorded", exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: "Return to native inventory", exact: true })
    .click();
  assert.equal(
    await page.getByText("Not linked to Auth", { exact: true }).count(),
    1,
  );
  assert.equal(
    await page
      .getByText("Linked", { exact: true })
      .count(),
    1,
  );
  assert.equal(writes, 0);
  assert.deepEqual(
    JSON.parse(await readFile(`${directory}/media-snapshot.json`, "utf8")),
    nativeSnapshot,
  );
  const nativeActionForm = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Morgan Native", exact: true }),
    })
    .locator("form");
  await nativeActionForm
    .getByLabel("Reason")
    .fill("Explicit synthetic native disable; preserve password and history.");
  await nativeActionForm
    .getByRole("button", { name: "Review native account disable", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Disable native account", exact: true })
    .waitFor();
  assert.equal(nativeWrites, 0);
  await capture(page, "media-disable-review");
  const nativeActionUrl = page.url();
  const nativeCsrf = await page
    .locator("input[name=csrf]")
    .first()
    .inputValue();
  const forgedNative = await context.request.post(
    `${nativeActionUrl}/confirm`,
    {
      headers: { origin: "https://wrong.example" },
      form: { csrf: nativeCsrf, confirmed: "true" },
    },
  );
  assert.equal(forgedNative.status(), 403);
  assert.equal(nativeWrites, 0);
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Disable native account", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Action status: disabled" })
    .waitFor();
  assert.equal(nativeWrites, 1);
  await context.request.post(`${nativeActionUrl}/confirm`, {
    headers: { origin },
    form: { csrf: nativeCsrf, confirmed: "true" },
  });
  assert.equal(nativeWrites, 1);
  await page.goto(origin + "/manage/media");
  await page.getByRole("link", { name: /jellyfin.*disable/ }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Action status: disabled" })
    .waitFor();
  await page
    .getByRole("link", { name: "Return to native inventory", exact: true })
    .click();
  await writeFile(
    `${directory}/media-snapshot.json`,
    JSON.stringify({ ...nativeSnapshot, observedAt: "2000-01-01T00:00:00Z" }),
  );
  await page.reload();
  await page
    .getByRole("status")
    .filter({ hasText: "Account list is out of date" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Review identity link", exact: true })
      .count(),
    0,
  );
  await writeFile(
    `${directory}/media-snapshot.json`,
    JSON.stringify(nativeSnapshot),
  );
  await page.goto(origin + "/manage/media");
  await page
    .getByRole("link", {
      name: "Verified synthetic exact IDs; preserve the other native-only account.",
      exact: true,
    })
    .click();
  await page
    .getByRole("heading", { name: "Identity link recorded", exact: true })
    .waitFor();
  await page.goto(origin + "/manage/media/seerr/synthetic-server");
  const seerrForm = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Casey Requests", exact: true }),
    })
    .locator("form");
  await seerrForm.getByLabel("Existing Auth identity").selectOption("member");
  await seerrForm
    .getByLabel("Reason")
    .fill("Explicit synthetic Seerr correspondence.");
  await seerrForm
    .getByRole("button", { name: "Review identity link", exact: true })
    .click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Record reviewed identity link", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Return to native inventory", exact: true })
    .click();
  const seerrActionForm = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Casey Requests", exact: true }),
    })
    .locator("form");
  await seerrActionForm
    .getByLabel("Reason")
    .fill("Intentional synthetic request moderation.");
  await seerrActionForm
    .getByRole("button", {
      name: "Review account and request removal",
      exact: true,
    })
    .click();
  await page
    .getByRole("heading", { name: "Remove account and requests", exact: true })
    .waitFor();
  await page
    .getByText("Intentional synthetic request moderation.", { exact: true })
    .waitFor();
  assert.equal(seerrDeletes, 0);
  await capture(page, "media-seerr-remove-review");
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await capture(page, `media-seerr-remove-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const seerrActionUrl = page.url();
  const seerrCsrf = await page.locator("input[name=csrf]").first().inputValue();
  const wrongCount = await context.request.post(`${seerrActionUrl}/confirm`, {
    headers: { origin },
    form: {
      csrf: seerrCsrf,
      confirmed: "true",
      destructiveConfirmation: "REMOVE 42 AND 0 REQUESTS",
    },
  });
  assert.equal(wrongCount.status(), 409);
  assert.equal(seerrDeletes, 0);
  await page
    .getByLabel(/Type REMOVE 42 AND 1 REQUESTS/)
    .fill("REMOVE 42 AND 1 REQUESTS");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Remove account and requests", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Action status: removed" })
    .waitFor();
  assert.equal(seerrDeletes, 1);
  await context.request.post(`${seerrActionUrl}/confirm`, {
    headers: { origin },
    form: {
      csrf: seerrCsrf,
      confirmed: "true",
      destructiveConfirmation: "REMOVE 42 AND 1 REQUESTS",
    },
  });
  assert.equal(seerrDeletes, 1);
  assert.deepEqual(
    JSON.parse(await readFile(`${directory}/seerr-snapshot.json`, "utf8")),
    seerrSnapshot,
  );
  await page.goto(origin + "/manage/services");
  await page.getByRole("link", { name: "Technical integrations" }).click();
  await page.getByRole("heading", { name: "Technical integrations" }).waitFor();
  await page.getByRole("link", { name: "People", exact: true }).first().click();
  await page.getByRole("link", { name: /Sam Member/ }).click();
  await capture(page, "person-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.getByText("Menu", { exact: true }).click();
  await page
    .locator(".mobile-nav a")
    .filter({ hasText: "Your apps" })
    .waitFor();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.getByText("Menu", { exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const previewCsrf = await page
    .locator("input[name=csrf]")
    .first()
    .inputValue();
  const beforePreviewWrites = writes;
  await page.getByRole("link", { name: "Preview auth", exact: true }).click();
  await page.getByText("Viewing Sam Member", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("link", { name: "People", exact: true }).count(),
    0,
  );
  assert.equal(await page.locator("form").count(), 0);
  assert.equal(await page.locator('a[href^="https://"]').count(), 0);
  await page
    .getByText("Temporary Auth preview · Read only", { exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: /Access details for/ })
    .first()
    .click();
  await page
    .locator("main")
    .getByRole("link", { name: "Your apps", exact: true })
    .click();
  assert.equal(new URL(page.url()).pathname, "/manage/people/member/preview");
  await capture(page, "user-preview");
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await page.getByRole("heading", { name: "Account", exact: true }).waitFor();
  assert.equal(await page.locator("form").count(), 0);
  const readonly = await context.request.post(
    origin + "/manage/people/member/preview",
    {
      headers: { origin },
      form: { csrf: previewCsrf },
    },
  );
  assert.equal(readonly.status(), 403);
  assert.equal(writes, beforePreviewWrites);
  await page.getByRole("link", { name: "Exit preview", exact: true }).click();
  await page.getByRole("link", { name: "Groups", exact: true }).first().click();
  await page.getByRole("link", { name: "Create group", exact: true }).click();
  await page.getByLabel("Group name").fill("Cartography collaborators");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Synthetic group for the browser acceptance.");
  await page.locator(`[name=bindings][value="maps|member"]`).check();
  await page.locator('[name=bindings][value="artbin|member"]').check();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Prove explicit group creation.");
  await page.getByRole("button", { name: "Review group", exact: true }).click();
  assert.equal(writes, 0);
  await page
    .getByRole("button", { name: "Apply reviewed change", exact: true })
    .click();
  assert.equal(writes, 0);
  await page.getByRole("link", { name: "People", exact: true }).first().click();
  await page.getByRole("link", { name: /Sam Member/ }).click();
  const membership = page
    .locator("form")
    .filter({ has: page.locator('[name=type][value="membership.add"]') });
  await membership
    .getByLabel("Add to group")
    .selectOption({ label: "Cartography collaborators" });
  await membership.getByLabel("Reason").fill("Prove one group assignment.");
  await membership.getByRole("button", { name: "Review membership" }).click();
  await capture(page, "review-desktop");
  assert.equal(writes, 0);
  await page.getByRole("button", { name: "Apply reviewed change" }).click();
  assert.equal(writes, 1);
  assert(
    grants.some(
      (grant) =>
        grant.userId === "member" && grant.projectId === artbin.projectId,
    ),
  );
  assert.deepEqual(
    grants.find((grant) => grant.id === "member-maps").roleKeys,
    ["member", "private-extra"],
  );
  await page.goto(origin + "/manage/activity");
  await page.getByRole("heading", { name: "Activity & cleanup" }).waitFor();
  await page.getByRole("link", { name: /Prove one group assignment/ }).click();
  await page.getByRole("heading", { name: "Access operation" }).waitFor();
  await page.getByText("External cleanup", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Groups", exact: true }).first().click();
  await capture(page, "groups-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "groups-mobile");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + "/account/sessions");
  await page.getByRole("heading", { name: "Sessions", exact: true }).waitFor();
  assert.equal(
    await page.getByText("This browser", { exact: true }).count(),
    1,
  );
  await page.goto(origin + "/manage/people/new");
  await page.getByLabel("Username", { exact: true }).fill("new-person");
  await page
    .getByLabel("Display name", { exact: true })
    .fill("Synthetic New Person");
  await page
    .getByLabel("Invitation recipient", { exact: true })
    .fill("synthetic@example.invalid");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Explicit synthetic onboarding review");
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  await page
    .getByRole("button", { name: "Review person", exact: true })
    .click();
  await page.getByText("Awaiting creation review", { exact: true }).waitFor();
  assert.equal(identityWrites, 0);
  await capture(page, "identity-review-desktop");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Create identity", exact: true })
    .click();
  await page
    .getByText("Identity created; invitation not sent", { exact: true })
    .waitFor();
  assert.equal(identityWrites, 1);
  await page.getByLabel("Retype the exact invitation recipient").waitFor();
  await capture(page, "identity-created-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await capture(page, "identity-created-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.equal(
    (
      await context.request.post(origin + "/invitation", {
        headers: { origin: "https://wrong.invalid" },
        form: { csrf: "wrong" },
      })
    ).status(),
    403,
  );
  assert.equal(identityWrites, 1);
  const reviewUrl = page.url();
  await page
    .getByLabel("Retype the exact invitation recipient")
    .fill("synthetic@example.invalid");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Send invitation", exact: true })
    .click();
  await page
    .getByText("Invitation requested; recipient setup pending", { exact: true })
    .waitFor();
  assert.deepEqual(recipientEffects, ["send"]);
  const recipientContext = await browser.newContext({
    ignoreHTTPSErrors: true,
  });
  const recipient = await recipientContext.newPage();
  const invitationRedirect = await recipientContext.request.get(
    invitationLink,
    {
      maxRedirects: 0,
    },
  );
  assert.equal(invitationRedirect.status(), 303);
  assert.equal(invitationRedirect.headers()["referrer-policy"], "no-referrer");
  const recipientReferrers = [];
  recipient.on("request", (request) => {
    recipientReferrers.push(request.headers().referer || "");
  });
  await recipient.goto(invitationLink);
  await recipient.waitForURL(origin + "/invitation");
  assert.deepEqual(recipientEffects, ["send"]);
  await recipient
    .locator('input[name="password"]')
    .fill("Synthetic-passphrase-42");
  await recipient
    .locator('input[name="confirmation"]')
    .fill("Synthetic-passphrase-42");
  await recipient
    .getByRole("button", { name: "Finish account setup", exact: true })
    .click();
  await recipient.getByText("Account ready", { exact: true }).waitFor();
  assert.deepEqual(recipientEffects, ["send", "verify", "reset", "password"]);
  await page.goto(reviewUrl);
  await page.getByText("Recipient password set", { exact: true }).waitFor();
  await recipient.goto(origin + "/login");
  await recipient.getByLabel("Username or email").fill("new-person");
  await recipient
    .getByLabel("Password", { exact: true })
    .fill("Synthetic-passphrase-42");
  await recipient.getByRole("button", { name: "Sign in", exact: true }).click();
  await recipient.waitForURL(origin + "/");
  assert.equal(
    grants.filter((grant) => grant.userId === users.at(-1).id).length,
    0,
  );
  assert(!logs.includes("synthetic-invitation-proof"));
  assert(!logs.includes("Synthetic-passphrase-42"));
  assert(
    recipientReferrers.every(
      (value) => !value.includes("synthetic-invitation-proof"),
    ),
  );
  await recipientContext.close();
  await page.goto(origin + "/manage/media");
  await page
    .getByRole("link", {
      name: "Create service account",
      exact: true,
    })
    .click();
  await capture(page, "media-provisioning-initial");
  assert.equal(
    await page
      .getByRole("heading", { name: "Create native account", exact: true })
      .count(),
    1,
    await page.locator("main").innerText(),
  );
  await page
    .getByLabel("Jellyfin instance", { exact: true })
    .selectOption("synthetic-server");
  await page
    .getByRole("button", { name: "Load available libraries", exact: true })
    .click();
  await page
    .getByLabel("Existing Auth identity", { exact: true })
    .selectOption(users.at(-1).id);
  await page
    .getByLabel("New native username", { exact: true })
    .fill("synthetic-recipient");
  await page.getByLabel("Synthetic Movies", { exact: true }).check();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Explicit synthetic new-account review; no incumbent changes.");
  await capture(page, "media-provisioning-form");
  await page
    .getByRole("button", { name: "Review new native account", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Review native creation", exact: true })
    .waitFor();
  assert.equal(nativeCreations, 0);
  const creationUrl = page.url();
  const creationCsrf = await page.locator("main input[name=csrf]").inputValue();
  const forgedCreation = await context.request.post(`${creationUrl}/confirm`, {
    headers: { origin: "https://wrong.example" },
    form: {
      csrf: creationCsrf,
      confirmed: "true",
      password: "Synthetic-native-passphrase-42",
    },
  });
  assert.equal(forgedCreation.status(), 403);
  assert.equal(nativeCreations, 0);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await capture(page, `media-provisioning-review-${width}`);
  }
  await page
    .getByLabel("Separate native password", { exact: true })
    .fill("Synthetic-native-passphrase-42");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Create native account", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Creation status: created" })
    .waitFor();
  assert.equal(nativeCreations, 1);
  await context.request.post(`${creationUrl}/confirm`, {
    headers: { origin },
    form: {
      csrf: creationCsrf,
      confirmed: "true",
      password: "Synthetic-native-passphrase-42",
    },
  });
  assert.equal(nativeCreations, 1);
  assert.equal(
    grants.filter((grant) => grant.userId === users.at(-1).id).length,
    0,
  );
  assert(!logs.includes("Synthetic-native-passphrase-42"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  nativeSnapshot.accounts.push({
    nativeId: createdNativeId,
    name: "synthetic-recipient",
    disabled: false,
    administrator: false,
  });
  await writeFile(
    `${directory}/media-snapshot.json`,
    JSON.stringify(nativeSnapshot),
  );
  await page.goto(origin + "/manage/media/jellyfin/synthetic-server");
  const createdMappingForm = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "synthetic-recipient",
        exact: true,
      }),
    })
    .locator("form");
  await createdMappingForm
    .getByLabel("Existing Auth identity")
    .selectOption(users.at(-1).id);
  await createdMappingForm
    .getByLabel("Reason")
    .fill("Separate explicit exact-ID mapping after new native creation.");
  await createdMappingForm
    .getByRole("button", { name: "Review identity link", exact: true })
    .click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Record reviewed identity link", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Identity link recorded", exact: true })
    .waitFor();
  await page.goto(origin + "/manage/media/provisioning");
  await page
    .getByLabel("Seerr instance", { exact: true })
    .selectOption("synthetic-server");
  await page
    .getByLabel("Confirmed Jellyfin mapping", { exact: true })
    .selectOption(
      JSON.stringify([
        "synthetic-server",
        createdNativeId,
        origin,
        users.at(-1).id,
      ]),
    );
  await page
    .getByLabel("Import reason", { exact: true })
    .fill(
      "Explicit one-account import with reviewed request and auto-approve 160.",
    );
  await page
    .getByRole("button", { name: "Review Seerr exact-ID import", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Seerr request and auto-approve · 160",
      exact: true,
    })
    .waitFor();
  assert.equal(seerrImports, 0);
  assert.equal(await page.locator("input[type=password]").count(), 0);
  const importUrl = page.url();
  const importCsrf = await page.locator("main input[name=csrf]").inputValue();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await capture(page, `media-seerr-import-${width}`);
  }
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Create native account", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Creation status: created" })
    .waitFor();
  assert.equal(seerrImports, 1);
  await context.request.post(`${importUrl}/confirm`, {
    headers: { origin },
    form: { csrf: importCsrf, confirmed: "true" },
  });
  assert.equal(seerrImports, 1);
  assert.equal(importedSeerrUser.permissions, 160);
  assert(!logs.includes("private-never-retained"));
  assert.equal(
    grants.filter((grant) => grant.userId === users.at(-1).id).length,
    0,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  const memberContext = await browser.newContext({ ignoreHTTPSErrors: true });
  const memberPage = await memberContext.newPage();
  await memberPage.goto(origin + "/login");
  await memberPage.getByLabel("Username or email").fill("member");
  await memberPage
    .getByLabel("Password", { exact: true })
    .fill("fixture-password");
  await memberPage
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await memberPage.waitForURL(origin + "/");
  assert.equal(
    await memberPage.getByRole("link", { name: "People", exact: true }).count(),
    0,
  );
  assert.equal(
    (
      await memberContext.request.get(
        origin + "/manage/media/jellyfin/synthetic-server",
      )
    ).status(),
    403,
  );
  assert.equal(
    (await memberContext.request.get(origin + "/manage/onboarding")).status(),
    403,
  );
  const denied = await memberContext.request.get(origin + "/manage/people");
  assert.equal(denied.status(), 403);
  assert.equal(
    (
      await memberContext.request.get(
        origin + "/manage/people/operator/preview",
      )
    ).status(),
    403,
  );
  const forged = await context.request.post(origin + "/manage/changes/apply", {
    headers: { origin: "https://wrong.example" },
    form: { operation: "made-up", csrf: "wrong" },
  });
  assert.equal(forged.status(), 403);
  assert.deepEqual(errors, []);
  console.log(
    "PASS access UI Chromium: HTTPS reviewed creation, separate invitation, recipient proof/password and normal sign-in without grants; compact login, directory, groups preview/apply, role preservation, sessions, member denial, forged Origin, mobile layout.",
  );
  assert(!logs.includes("SyntaxError"), "Server syntax failure");
  await memberContext.close();
  await context.close();
  }
} finally {
  await browser?.close();
  server.kill();
  await once(server, "exit");
  await new Promise((resolve) => proxy.close(resolve));
  await new Promise((resolve) => provider.close(resolve));
  await new Promise((resolve) => nativeServer.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
