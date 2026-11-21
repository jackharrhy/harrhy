import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { loadAuthFetch } from "./auth-fetch.mjs";

export async function authorizationFixture() {
  const directory = await mkdtemp(`${tmpdir()}/auth-browser-`);
  const key = `${directory}/credential.json`;
  await writeFile(key, JSON.stringify({ token: "fixture-only" }), {
    mode: 0o600,
  });
  const applications = JSON.parse(
    await readFile(new URL("../../config/applications.json", import.meta.url)),
  );
  let callbackOrigin,
    currentClient = applications.find((app) => app.id === "fourm").clientIds[0],
    creationDateOverride,
    delegated = false,
    promptOverride,
    maxAgeOverride,
    scopeOverride;
  let providerRejection;
  let rejectProviderSession = false;
  let credentialAttempts = 0;
  let completions = 0,
    resetCalls = 0,
    loginRequired = 0;
  const provider = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const json = body ? JSON.parse(body) : {};
    let result;
    if (request.url === "/management/v1/policies/password/complexity") {
      result = {
        policy: {
          minLength: "14",
          hasUppercase: true,
          hasLowercase: true,
          hasNumber: true,
          hasSymbol: true,
        },
      };
    } else if (request.url === "/v2/users/reset-fixture/password") {
      resetCalls++;
      assert.equal(json.verificationCode, "recovery-code");
      if (!/[A-Z]/.test(json.newPassword.password)) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            code: 3,
            message: "Password must contain upper case (DOMAIN-VoaRj)",
          }),
        );
        return;
      }
      if (!/[!@#$%]/.test(json.newPassword.password)) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            code: 3,
            message: "Password must contain symbol (DOMAIN-ZDLwA)",
          }),
        );
        return;
      }
      result = {};
    } else if (request.url.startsWith("/v2/oidc/auth_requests/")) {
      if (providerRejection && request.method === "GET") {
        response.writeHead(404, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            code: providerRejection,
            message: "private-provider-body",
          }),
        );
        return;
      }
      if (request.method === "POST") {
        if (json.error?.error === "ERROR_REASON_LOGIN_REQUIRED") {
          loginRequired++;
          result = {
            callbackUrl: `${callbackOrigin}/callback?error=login_required&state=fixture-state`,
          };
        } else if (
          json.error?.error === "ERROR_REASON_ACCOUNT_SELECTION_REQUIRED"
        )
          result = {
            callbackUrl: `${callbackOrigin}/callback?error=account_selection_required&state=fixture-state`,
          };
        else {
          completions++;
          result = {
            callbackUrl: `${callbackOrigin}/callback?code=fixture-code&state=fixture-state`,
          };
        }
      } else {
        const app = applications.find((a) =>
          a.clientIds.includes(currentClient),
        );
        const scopes = delegated
          ? [
              "openid",
              `urn:zitadel:iam:org:project:id:${app.projectId}:aud`,
              "urn:zitadel:iam:org:projects:roles",
              "urn:zitadel:iam:org:project:role:admin",
              ...(app.id === "ref"
                ? ["urn:zitadel:iam:org:project:role:archive-read"]
                : []),
            ]
          : ["openid"];
        result = {
          authRequest: {
            creationDate: creationDateOverride || new Date().toISOString(),
            clientId: delegated ? "dynamic" : currentClient,
            prompt: promptOverride || [],
            maxAge: maxAgeOverride,
            redirectUri: `${callbackOrigin}/callback`,
            scope: scopeOverride || scopes,
          },
        };
      }
    } else if (request.url === "/v2/sessions/search") result = { sessions: [] };
    else if (request.url === "/v2/sessions" && request.method === "POST") {
      credentialAttempts++;
      if (json.checks.password.password !== "fixture-password") {
        response.writeHead(401);
        response.end("{}");
        return;
      }
      result = { sessionId: "session", sessionToken: "fixture-proof" };
    } else if (
      request.url === "/v2/sessions/session" &&
      rejectProviderSession
    ) {
      response.writeHead(404);
      response.end("{}");
      return;
    } else if (request.url === "/v2/sessions/session")
      result = {
        session: {
          factors: {
            user: { id: "fixture-user" },
            password: { verifiedAt: new Date().toISOString() },
          },
          expirationDate: new Date(Date.now() + 600_000).toISOString(),
        },
      };
    else if (request.url === "/management/v1/users/fixture-user") {
      result = {
        user: {
          id: "fixture-user",
          state: "USER_STATE_ACTIVE",
          userName: "fixture-user",
          human: { profile: {}, email: { isEmailVerified: true } },
          details: { resourceOwner: "fixture" },
        },
      };
    } else if (request.url === "/management/v1/users/grants/_search") {
      const projectId = json.queries?.find((query) => query.projectIdQuery)
        ?.projectIdQuery.projectId;
      result = {
        result: [
          {
            id: "fixture-grant",
            userId: "fixture-user",
            projectId,
            state: "USER_GRANT_STATE_ACTIVE",
            roleKeys:
              applications.find((app) => app.id === "ref").projectId ===
              projectId
                ? ["admin", "archive-read", "archive-restore"]
                : [
                    applications.some(
                      (app) =>
                        ["marky", "radio"].includes(app.id) &&
                        app.clientIds.includes(currentClient),
                    )
                      ? "member"
                      : "admin",
                  ],
          },
        ],
      };
    } else {
      response.writeHead(404);
      response.end("{}");
      return;
    }
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(result));
  });

  const consumer = createServer((request, response) => {
    const url = new URL(request.url, callbackOrigin);
    assert.equal(url.pathname, "/callback");
    assert.equal(url.searchParams.get("code"), "fixture-code");
    assert.equal(url.searchParams.get("state"), "fixture-state");
    response.setHeader("Content-Type", "text/html");
    response.end("<h1>Consumer session established</h1>");
  });
  await Promise.all(
    [provider, consumer].map(async (server) => {
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
    }),
  );
  callbackOrigin = `http://127.0.0.1:${consumer.address().port}`;
  const env = {
    LISTEN_HOST: "127.0.0.1",
    NODE_ENV: "test",
    ZITADEL_API_URL: `http://127.0.0.1:${provider.address().port}`,
    LOGIN_TOKEN_FILE: key,
    MANAGEMENT_TOKEN_FILE: key,
    ACCESS_DB_FILE: `${directory}/access.sqlite`,
    RADIO_ENROLLMENT_DB_FILE: `${directory}/radio-memberships.sqlite`,
    ORGANIZATION_ID: "fixture",
    LORE_PROJECT_ID: "fixture",
    LORE_CLIENT_ID: "fixture",
    ADMIN_USER_ID: "fixture-admin",
  };
  const origin = "https://auth.test";
  return {
    origin,
    callbackOrigin,
    env,
    start: () => loadAuthFetch({ ...env, PUBLIC_ORIGIN: origin }),
    configure({
      client = "fourm",
      creationDate,
      consent = false,
      prompt,
      maxAge,
      scope,
      rejection,
      sessionRejected = false,
    } = {}) {
      currentClient = applications.find((app) => app.id === client)
        .clientIds[0];
      creationDateOverride = creationDate;
      delegated = consent;
      promptOverride = prompt;
      maxAgeOverride = maxAge;
      scopeOverride = scope;
      providerRejection = rejection;
      rejectProviderSession = sessionRejected;
    },
    counts: () => ({
      credentialAttempts,
      completions,
      loginRequired,
      resetCalls,
    }),
    async close() {
      await Promise.all(
        [provider, consumer].map(
          (server) =>
            new Promise((resolve) => {
              server.close(resolve);
              server.closeAllConnections();
            }),
        ),
      );
      await rm(directory, { recursive: true, force: true });
    },
  };
}
