import assert from "node:assert/strict";
import test from "node:test";
import { authClient, hiddenFields } from "./fixtures/auth-requests.mjs";
import { authorizationFixture } from "./fixtures/authorization-server.mjs";

async function start(t) {
  const fixture = await authorizationFixture();
  let app = await fixture.start();
  t.after(async () => {
    await app.close();
    await fixture.close();
  });
  return {
    ...fixture,
    client: () =>
      authClient({
        origin: fixture.origin,
        fetch: (request) => app.fetch(request),
      }),
    async restart() {
      await app.close();
      app = await fixture.start();
    },
  };
}

async function authorization(client, response) {
  assert.equal(response.status, 303);
  const location = response.headers.get("location");
  return location.startsWith("/") ? client.request(location) : response;
}

function callback(fixture, response, query = "code=fixture-code") {
  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    `${fixture.callbackOrigin}/callback?${query}&state=fixture-state`,
  );
}

test("authorization routes gate held and stale requests, force fresh login, and preserve silent session policy", async (t) => {
  const fixture = await start(t);
  const client = fixture.client();
  fixture.configure({ client: "cms" });
  await client.get("/login?authRequest=held", 403);
  fixture.configure({ client: "artbin", creationDate: "2000-01-01T00:00:00Z" });
  await client.get("/login?authRequest=stale", 400);
  assert.equal(fixture.counts().completions, 0);
  const silent = { client: "rotund-portal", prompt: ["PROMPT_NONE"] };
  fixture.configure(silent);
  callback(
    fixture,
    await client.request("/login?authRequest=anonymous"),
    "error=login_required",
  );
  assert.equal(fixture.counts().credentialAttempts, 0);
  const app = { client: "artbin" };
  fixture.configure(app);
  const login = (id) =>
    client.login(
      "fixture-user",
      "fixture-password",
      `/login?authRequest=${id}`,
    );
  callback(fixture, await authorization(client, await login("first")));
  for (const [id, requested] of Object.entries({
    forced: { prompt: ["PROMPT_LOGIN"] },
    "zero-age": { maxAge: "0s" },
  })) {
    fixture.configure({
      ...app,
      ...requested,
      creationDate: new Date().toISOString(),
    });
    const before = fixture.counts().completions;
    assert.match(
      await client.get(`/login?authRequest=${id}`),
      /name="password"/,
    );
    assert.equal(fixture.counts().completions, before);
    callback(fixture, await authorization(client, await login(id)));
  }
  fixture.configure({ ...app, maxAge: "60s" });
  callback(
    fixture,
    await authorization(
      client,
      await client.request("/login?authRequest=recent"),
    ),
  );
  fixture.configure({ ...app, prompt: ["PROMPT_SELECT_ACCOUNT"] });
  const before = fixture.counts();
  callback(
    fixture,
    await client.request("/login?authRequest=selection"),
    "error=account_selection_required",
  );
  fixture.configure(silent);
  callback(fixture, await client.request("/login?authRequest=returning"));
  fixture.configure({ ...silent, sessionRejected: true });
  callback(
    fixture,
    await client.request("/login?authRequest=session-rejected"),
    "error=login_required",
  );
  assert.equal(fixture.counts().completions, before.completions + 1);
  assert.equal(fixture.counts().credentialAttempts, before.credentialAttempts);
});

test("Ref consent keeps requested archive scope visible and cannot be silently approved", async (t) => {
  const fixture = await start(t);
  const client = fixture.client();
  fixture.configure({ client: "ref" });
  callback(
    fixture,
    await authorization(
      client,
      await client.login(
        "fixture-user",
        "fixture-password",
        "/login?authRequest=ref",
      ),
    ),
  );
  const consent = { client: "ref", consent: true };
  fixture.configure({ ...consent, creationDate: "2000-01-01T00:00:00Z" });
  await client.get("/login?authRequest=stale-consent", 400);
  fixture.configure(consent);
  const page = await client.get("/authorize?authRequest=archive");
  assert.match(page, /Administrator, archive-read/);
  assert.match(page, /Deny/);
  const approval = { ...hiddenFields(page, "/authorize"), decision: "approve" };
  const before = fixture.counts().completions;
  fixture.configure({ ...consent, prompt: ["PROMPT_NONE"] });
  callback(
    fixture,
    await client.request("/authorize?authRequest=archive"),
    "error=login_required",
  );
  callback(
    fixture,
    await client.request("/authorize", { form: approval }),
    "error=login_required",
  );
  assert.equal(fixture.counts().completions, before);
  fixture.configure(consent);
  callback(fixture, await client.request("/authorize", { form: approval }));
  assert.equal(fixture.counts().completions, before + 1);
});

test("a login form from before restart rejects without credentials and reissues a blank form with the same intent", async (t) => {
  const fixture = await start(t);
  const client = fixture.client();
  const path = "/login?authRequest=restart";
  const form = hiddenFields(await client.get(path), "/login");
  const password = "fixture-password";
  await fixture.restart();
  const response = await client.request("/login", {
    form: { ...form, username: "fixture-user", password },
  });
  assert.equal(response.status, 403);
  assert.equal(fixture.counts().credentialAttempts, 0);
  const html = await response.text();
  assert(!html.includes(password));
  const fresh = hiddenFields(html, "/login");
  assert.notEqual(fresh.csrf, form.csrf);
  assert.equal(fresh.returnTo, form.returnTo);
  const retry = await client.request("/login", {
    form: { ...fresh, username: "fixture-user", password },
  });
  callback(fixture, await authorization(client, retry));
  assert.equal(fixture.counts().credentialAttempts, 1);
});

test("password reset strips the code, rejects mismatch locally and allows a safe provider-validation retry", async (t) => {
  const fixture = await start(t);
  const client = fixture.client();
  const path = "/reset-password";
  const landing = await client.request(
    `${path}?userID=reset-fixture&code=recovery-code`,
  );
  assert.equal(landing.status, 303);
  assert.equal(landing.headers.get("location"), path);
  let html = await client.get(path);
  assert.match(
    html,
    /14–200 characters; include an uppercase letter, a lowercase letter, a number, a symbol/,
  );
  for (const [password, confirmation, reason, calls] of [
    [
      "lowercasepassword123!",
      "lowercasepassword123!",
      /Include an uppercase letter/,
      1,
    ],
    ["ValidPassword123", "ValidPassword123", /Include a symbol/, 2],
    ["ValidPassword123!", "DifferentPassword123!", /passwords do not match/, 2],
    ["ValidPassword123!", "ValidPassword123!", /Password updated/, 3],
  ]) {
    const response = await client.request(path, {
      form: { ...hiddenFields(html, path), password, confirmation },
    });
    html = await response.text();
    assert.match(html, reason);
    assert(!html.includes(password));
    assert.equal(fixture.counts().resetCalls, calls);
  }
});
