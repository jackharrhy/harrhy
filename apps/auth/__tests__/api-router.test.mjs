import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createApiRouter } from "../src/api-router.mjs";
import { createEnrollmentCompletion } from "../src/enrollment-completion.mjs";

const applications = JSON.parse(
  readFileSync(new URL("../config/applications.json", import.meta.url)),
);
const fourm = applications.find((app) => app.id === "fourm");
const origin = "https://auth.test";

async function send(router, path, init, status) {
  const response = await router.fetch(new Request(origin + path, init));
  assert.equal(response.status, status);
  assert.equal(response.headers.get("set-cookie"), null);
  return response;
}

test("forwarded authorization policy enforces PKCE and reports the staged client boundary", async () => {
  const router = createApiRouter({ applications, origin });
  const path = "/internal/oidc/authorize-policy";
  const authorize = "/oauth/v2/authorize";
  const client = fourm.pkceClientIds[0];
  const forwarded = (clientId) => ({
    headers: {
      "x-forwarded-uri": `${authorize}?client_id=${clientId}&response_type=code`,
      "x-forwarded-method": "GET",
    },
  });
  await send(router, path, forwarded(client), 400);
  await send(
    router,
    path,
    {
      method: "POST",
      headers: { "x-forwarded-uri": authorize, "x-forwarded-method": "POST" },
      body: new URLSearchParams({
        client_id: client,
        response_type: "code",
        code_challenge: "a".repeat(43),
        code_challenge_method: "S256",
      }),
    },
    200,
  );
  const [stagedClient, boundary] = Object.entries(
    fourm.authRequestNotBefore,
  )[0];
  const staged = await send(router, path, forwarded(stagedClient), 400);
  assert.equal(staged.headers.get("x-jack-auth-not-before"), boundary);
});

const unexpected = () => assert.fail("Rejected input must not reach upstream");
const post = (body, headers) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

test("enrollment completion requires POST and bearer proof and accepts no nominated project", async () => {
  const enrollmentKey = "fixture-only-enrollment-key".repeat(3);
  const enrollmentCompletion = createEnrollmentCompletion({
    api: unexpected,
    request: unexpected,
    application: fourm,
    applications,
    organizationId: "fixture",
    key: enrollmentKey,
  });
  const router = createApiRouter({
    enrollmentCompletion,
    enrollmentKey,
    applications,
    origin,
  });
  const path = "/enroll/complete";
  const event = {
    requestId: "request_12345678901234567890",
    subject: "fixture-user",
  };
  await send(router, path, {}, 405);
  await send(router, path, post(event), 401);
  await send(
    router,
    path,
    post(
      { ...event, projectId: "lore" },
      {
        authorization: `Bearer ${enrollmentKey}`,
      },
    ),
    400,
  );
});
