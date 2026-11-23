import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import type { TestContext } from "node:test";
import { createSlidesAuth } from "../auth.ts";

const env = {
  HARRHY_SLIDES_ORIGIN: "https://slides.example",
  HARRHY_SLIDES_SESSION_SECRET: "test-only-session-secret-not-for-production",
  HARRHY_AUTH_ISSUER: "https://auth.example",
  HARRHY_AUTH_CLIENT_ID: "slides",
  HARRHY_AUTH_PROJECT_ID: "project",
  HARRHY_AUTH_ORGANIZATION_ID: "org",
  HARRHY_AUTH_OWNER_SUBJECT: "owner-id",
};
const origin = env.HARRHY_SLIDES_ORIGIN;
const issuer = env.HARRHY_AUTH_ISSUER;
const request = (path: string, init?: RequestInit) =>
  new Request(new URL(path, origin), init);
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const discovery: Record<string, string> = { issuer };
for (const endpoint of [
  "authorization_endpoint",
  "token_endpoint",
  "userinfo_endpoint",
  "jwks_uri",
  "introspection_endpoint",
]) {
  discovery[endpoint] = `${issuer}/${endpoint}`;
}

const encode = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

async function flow(
  t: TestContext,
  subject = env.HARRHY_AUTH_OWNER_SUBJECT,
  role = "slides-presenter",
) {
  let authorization: URL | undefined;
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async (...[input, init]: Parameters<typeof globalThis.fetch>) => {
      const url = new URL(input instanceof Request ? input.url : input);
      assert.equal(url.origin, issuer);
      switch (url.pathname) {
        case "/.well-known/openid-configuration":
          return Response.json(discovery);
        case "/token_endpoint": {
          assert.ok(authorization && init?.body instanceof URLSearchParams);
          const verifier = init.body.get("code_verifier");
          assert.ok(verifier);
          assert.equal(
            init.body.get("redirect_uri"),
            `${origin}/auth/callback`,
          );
          assert.equal(
            createHash("sha256").update(verifier).digest("base64url"),
            authorization.searchParams.get("code_challenge"),
          );
          const iat = Math.floor(Date.now() / 1000);
          const jwt = `${encode({ alg: "RS256" })}.${encode({
            sub: subject,
            iss: issuer,
            aud: "slides",
            iat,
            exp: iat + 600,
            nonce: authorization.searchParams.get("nonce"),
          })}`;
          return Response.json({
            token_type: "Bearer",
            expires_in: 60,
            access_token: "fixture",
            id_token: `${jwt}.${sign("RSA-SHA256", Buffer.from(jwt), pair.privateKey).toString("base64url")}`,
          });
        }
        case "/jwks_uri":
          return Response.json({
            keys: [pair.publicKey.export({ format: "jwk" })],
          });
        case "/userinfo_endpoint":
          return Response.json({
            sub: subject,
            jack_auth_principal_type: "user",
            jack_auth_username: "jack",
            name: "Jack",
            "urn:zitadel:iam:org:project:project:roles": {
              [role]: { org: "auth.example" },
            },
          });
        default:
          assert.fail(`Unexpected endpoint: ${url}`);
      }
    },
  );
  const auth = createSlidesAuth(env);
  const login = await auth.login(
    request("/auth/login?returnTo=https://elsewhere.example"),
  );
  assert.equal(login.status, 303);
  const location = login.headers.get("location");
  assert.ok(location);
  authorization = new URL(location);
  assert.equal(
    authorization.searchParams.get("redirect_uri"),
    `${origin}/auth/callback`,
  );
  const transaction = login.headers.get("set-cookie");
  assert.ok(transaction);
  assert.match(
    transaction,
    /^__Host-slides_oauth_[\w-]+=.+; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=600$/,
  );
  const callback = `/auth/callback?code=fixture&state=${authorization.searchParams.get("state")}`;
  const transactionPair = transaction.split(";")[0];
  return {
    auth,
    fetch,
    callback,
    transactionPair,
    finish: () =>
      auth.callback(
        request(callback, { headers: { cookie: transactionPair } }),
      ),
  };
}

test("exact owner gets a signed, expiring presenter session", async (t) => {
  const { auth, finish } = await flow(t);
  const response = await finish();
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const [cleared, session] = response.headers.getSetCookie();
  assert.match(cleared, /Max-Age=0$/);
  assert.match(
    session,
    /^__Host-slides_session=.+; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=(59|60)$/,
  );
  const cookie = session.split(";")[0];
  const viewer = (value = cookie, url = "/") =>
    request(url, { headers: { cookie: value } });
  assert.equal(await auth.isPresenter(viewer()), true);
  assert.equal(await auth.isPresenter(viewer(`${cookie}x`)), false);
  assert.equal(await auth.isPresenter(viewer(`${cookie}; ${cookie}`)), false);
  assert.equal(
    await auth.isPresenter(viewer(cookie, "https://other.example")),
    false,
  );
  assert.equal(
    await createSlidesAuth({
      ...env,
      HARRHY_AUTH_OWNER_SUBJECT: "replacement",
    }).isPresenter(viewer()),
    false,
  );
  t.mock.method(Date, "now", () => new Date().getTime() + 61_000);
  assert.equal(await auth.isPresenter(viewer()), false);
});

test("same username and presenter role do not authorize another subject", async (t) => {
  const { finish } = await flow(t, "Owner-id");
  const response = await finish();
  assert.equal(response.status, 403);
  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.length, 1);
  assert.match(cookies[0], /Max-Age=0$/);
});

test("generic admin does not substitute for the dedicated Slides grant", async (t) => {
  const { finish } = await flow(t, env.HARRHY_AUTH_OWNER_SUBJECT, "admin");
  const response = await finish();
  assert.equal(response.status, 403);
  assert.equal(response.headers.getSetCookie().length, 1);
});

test("missing or tampered state transaction is rejected before code exchange", async (t) => {
  const { auth, callback, transactionPair, fetch } = await flow(t);
  for (const cookie of ["", `${transactionPair}x`]) {
    const response = await auth.callback(
      request(callback, { headers: { cookie } }),
    );
    assert.equal(response.status, 400);
    assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0$/);
  }
  assert.equal(fetch.mock.callCount(), 1);
});

test("incomplete auth fails closed; logout requires exact same-origin POST", async () => {
  const disabled = createSlidesAuth({ ...env, HARRHY_AUTH_OWNER_SUBJECT: "" });
  assert.equal(await disabled.isPresenter(request("/")), false);
  assert.equal((await disabled.login(request("/auth/login"))).status, 503);
  const auth = createSlidesAuth(env);
  assert.equal(auth.logout(request("/auth/logout")).status, 405);
  const wrongOrigins: HeadersInit[] = [
    {},
    { origin: "null" },
    { origin: "https://other.example" },
  ];
  for (const headers of wrongOrigins) {
    const response = auth.logout(
      request("/auth/logout", { method: "POST", headers }),
    );
    assert.equal(response.status, 403);
    assert.equal(response.headers.has("set-cookie"), false);
  }
  const response = auth.logout(
    request("/auth/logout", { method: "POST", headers: { origin } }),
  );
  assert.equal(response.status, 303);
  assert.match(
    response.headers.get("set-cookie") ?? "",
    /^__Host-slides_session=; .*Max-Age=0$/,
  );
});
