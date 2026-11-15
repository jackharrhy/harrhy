import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createAccessStore } from "../../src/access-store.mjs";

export async function createManagementFixture({ publicOrigin, port = 0 } = {}) {
  const directory = await mkdtemp(`${tmpdir()}/auth-management-`);
  let server, provider, nativeServer, proxy;
  async function close() {
    if (server && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, "exit");
      server.kill();
      await exited;
    }
    for (const listener of [proxy, provider, nativeServer])
      if (listener?.listening)
        await new Promise((resolve) => listener.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
  try {
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
    nativeServer = createServer(async (request, response) => {
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
        else if (
          request.method === "DELETE" &&
          request.url === "/api/v1/user/42"
        ) {
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
      if (
        request.url === "/Library/VirtualFolders" &&
        request.method === "GET"
      ) {
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
      if (
        request.url === `/Users/${createdNativeId}` &&
        request.method === "GET"
      ) {
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
        assert.deepEqual(createdNative.Policy.EnabledFolders, [
          selectedLibrary,
        ]);
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
    await new Promise((resolve) =>
      nativeServer.listen(0, "127.0.0.1", resolve),
    );
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
    provider = createServer(async (request, response) => {
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
      } else if (
        request.url === "/management/v1/policies/password/complexity"
      ) {
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
        const ids = data.filters?.find((filter) => filter.inUserIds)?.inUserIds
          .ids;
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
      reservation.listen(port, "127.0.0.1", resolve),
    );
    const listenPort = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    if (!publicOrigin) {
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
      proxy = createHttpsServer(
        {
          key: await readFile(`${directory}/tls.key`),
          cert: await readFile(`${directory}/tls.crt`),
        },
        (incoming, outgoing) => {
          const upstream = httpRequest(
            {
              hostname: "127.0.0.1",
              port: listenPort,
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
    }
    const origin = publicOrigin || `https://127.0.0.1:${proxy?.address().port}`;
    server = spawn(process.execPath, ["src/server.mjs"], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      env: {
        PATH: process.env.PATH,
        HOME: directory,
        LISTEN_HOST: "127.0.0.1",
        PORT: String(listenPort),
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

    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => finish(new Error("Fixture Auth startup timed out")),
        15000,
      );
      const ready = () => finish();
      const exited = () =>
        finish(new Error("Fixture Auth exited before startup"));
      const failed = () => finish(new Error("Fixture Auth could not start"));
      function finish(error) {
        clearTimeout(timer);
        server.stdout.off("data", ready);
        server.off("exit", exited);
        server.off("error", failed);
        if (error) reject(error);
        else resolve();
      }
      server.stdout.once("data", ready);
      server.once("exit", exited);
      server.once("error", failed);
    });
    return {
      origin,
      directory,
      users,
      recipientEffects,
      nativeSnapshot,
      seerrSnapshot,
      selectedLibrary,
      createdNativeId,
      importedSeerrUser,
      artbin,
      get writes() {
        return writes;
      },
      get identityWrites() {
        return identityWrites;
      },
      get invitationLink() {
        return invitationLink;
      },
      get recipientPassword() {
        return recipientPassword;
      },
      get nativeWrites() {
        return nativeWrites;
      },
      get nativeCreations() {
        return nativeCreations;
      },
      get seerrDeletes() {
        return seerrDeletes;
      },
      get seerrImports() {
        return seerrImports;
      },
      get logs() {
        return logs;
      },
      get createdNative() {
        return createdNative;
      },
      get grants() {
        return grants;
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
