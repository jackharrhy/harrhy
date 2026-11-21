import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";
import { loadAuthFetch } from "./fixtures/auth-fetch.mjs";
import { authClient, hiddenFields } from "./fixtures/auth-requests.mjs";

const login = (client, id) =>
  client.login("person", "fixture-password", `/login?authRequest=${id}`);

test("Radio requires explicit consent and cannot replace removed access after restart", async (t) => {
  const directory = await mkdtemp(`${tmpdir()}/radio-requests-`);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const app = {
    id: "radio",
    name: "Radio",
    projectId: "radio-project",
    clientIds: ["radio-client"],
    roles: ["member", "admin"],
    selfEnrollment: "verified-organization-human",
    clientRoleRequirements: { "radio-client": ["member", "admin"] },
  };
  await writeFile(`${directory}/applications.json`, JSON.stringify([app]));
  await writeFile(`${directory}/key.json`, '{"token":"fixture-only"}', {
    mode: 0o600,
  });
  let grants = [],
    writes = 0,
    callbacks = 0,
    consumerOrigin = "https://radio.test";
  const provider = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const data = body ? JSON.parse(body) : {};
    let value;
    if (request.url.startsWith("/v2/oidc/auth_requests/")) {
      if (request.method === "POST") {
        callbacks++;
        value = {
          callbackUrl: `${consumerOrigin}/callback?code=fixture&state=fixture`,
        };
      } else
        value = {
          authRequest: {
            clientId: "radio-client",
            redirectUri: `${consumerOrigin}/callback`,
            scope: ["openid", "profile"],
            creationDate: new Date().toISOString(),
          },
        };
    } else if (request.url === "/v2/sessions" && request.method === "POST")
      value = { sessionId: "proof", sessionToken: "fixture-proof" };
    else if (request.url === "/v2/sessions/proof")
      value = {
        session: {
          factors: {
            user: { id: "person" },
            password: { verifiedAt: new Date().toISOString() },
          },
          expirationDate: new Date(Date.now() + 600000).toISOString(),
        },
      };
    else if (request.url === "/management/v1/users/person")
      value = {
        user: {
          id: "person",
          state: "USER_STATE_ACTIVE",
          userName: "person",
          human: { profile: {}, email: { isEmailVerified: true } },
          details: { resourceOwner: "org" },
        },
      };
    else if (request.url === "/management/v1/users/grants/_search")
      value = { result: grants };
    else if (
      request.url === "/management/v1/users/person/grants" &&
      request.method === "POST"
    ) {
      assert.deepEqual(data, {
        projectId: app.projectId,
        roleKeys: ["member"],
      });
      writes++;
      grants = [
        {
          id: "fixture-grant",
          projectId: app.projectId,
          userId: "person",
          state: "USER_GRANT_STATE_ACTIVE",
          roleKeys: ["member"],
        },
      ];
      value = { userGrantId: "fixture-grant" };
    } else {
      response.writeHead(404);
      response.end("{}");
      return;
    }
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(value));
  });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  t.after(() => new Promise((resolve) => provider.close(resolve)));
  const origin = "https://auth.test";
  const env = {
    PUBLIC_ORIGIN: origin,
    ZITADEL_API_URL: `http://127.0.0.1:${provider.address().port}`,
    LOGIN_TOKEN_FILE: `${directory}/key.json`,
    MANAGEMENT_TOKEN_FILE: `${directory}/key.json`,
    ORGANIZATION_ID: "org",
    LORE_PROJECT_ID: "unused",
    LORE_CLIENT_ID: "unused",
    ADMIN_USER_ID: "operator",
    AUTH_APPLICATIONS_FILE: `${directory}/applications.json`,
    RADIO_ENROLLMENT_DB_FILE: `${directory}/membership.sqlite`,
  };
  const start = () => loadAuthFetch(env);
  let runtime = await start();
  t.after(() => runtime.close());
  const first = authClient({ origin, fetch: runtime.fetch });

  const afterLogin = await login(first, "first");
  const consent = await first.get(afterLogin.headers.get("location"));
  assert.match(consent, /Join Radio\?/);
  assert.match(consent, /upload tracks/);
  assert.equal(writes, 0);
  const form = { ...hiddenFields(consent, "/authorize"), decision: "approve" };
  assert.equal(form.authRequest, "first");
  const rejected = await first.request("/authorize", {
    form,
    requestOrigin: "https://wrong.example",
  });
  assert.equal(rejected.status, 403);
  assert.equal(writes, 0);
  const approved = await first.request("/authorize", { form });
  assert.equal(approved.status, 303);
  assert.equal(
    approved.headers.get("location"),
    `${consumerOrigin}/callback?code=fixture&state=fixture`,
  );
  assert.deepEqual(grants[0].roleKeys, ["member"]);
  assert.equal(writes, 1);
  const returning = await first.request("/login?authRequest=returning");
  assert.equal(
    (await first.request(returning.headers.get("location"))).headers.get(
      "location",
    ),
    approved.headers.get("location"),
  );
  assert.equal(writes, 1);
  assert.equal(callbacks, 2);
  grants = [];
  await runtime.close();
  runtime = await start();
  const fresh = authClient({ origin, fetch: runtime.fetch });
  const removed = await login(fresh, "removed");
  assert.match(
    await fresh.get(removed.headers.get("location"), 403),
    /membership is unavailable/,
  );
  assert.equal(writes, 1);
  assert.equal(callbacks, 2);
});
