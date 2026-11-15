import { it } from "remix/test";
import * as assert from "remix/assert";
import {
  centralSessionCookie,
  isEditor,
  requireSecrets,
  sameOrigin,
  sessionCookie,
} from "../auth.ts";
import type { Bindings } from "../types.ts";

it("accepts editor writes through a configured TLS proxy and secures the session cookie", async () => {
  const env = {
    HARRHY_CMS_ADMIN_PASSWORD: "test",
    HARRHY_CMS_SESSION_SECRET: "test-session-secret",
    HARRHY_CMS_PREVIEW_SECRET: "test-preview-secret",
    HARRHY_CMS_EDITOR_ORIGIN: "https://cms.example.test",
  } as Bindings;
  const request = new Request("http://localhost:8788/tea/login", {
    headers: { Origin: "https://cms.example.test" },
  });
  assert.equal(sameOrigin(request, env), true);
  assert.equal(
    sameOrigin(
      new Request(request.url, {
        headers: { Origin: "https://evil.example.test" },
      }),
      env,
    ),
    false,
  );
  const cookie = await sessionCookie(request, env);
  assert.equal(cookie.includes("; Secure"), true);
  assert.equal(
    await isEditor(
      new Request(request.url, { headers: { Cookie: cookie } }),
      env,
    ),
    true,
  );
});

it("requires an exact reviewed subject for a Central editor session and rejects old password cookies", async () => {
  const env = {
    HARRHY_CMS_ADMIN_PASSWORD: "unused",
    HARRHY_CMS_SESSION_SECRET: "test-session-secret",
    HARRHY_CMS_EDITOR_ORIGIN: "https://cms.example.test",
    HARRHY_AUTH_ISSUER: "https://auth.example.test",
    HARRHY_AUTH_CLIENT_ID: "client",
    HARRHY_AUTH_PROJECT_ID: "project",
    HARRHY_AUTH_ORGANIZATION_ID: "org",
    HARRHY_AUTH_OWNER_SUBJECT: "reviewed-owner",
  } as Bindings;
  requireSecrets(env, false, true, false);
  assert.throws(() => requireSecrets(env, false, true), /preview secrets/);
  const request = new Request("https://cms.example.test/tea");
  const oldCookie = await sessionCookie(request, env);
  assert.equal(
    await isEditor(
      new Request(request, { headers: { Cookie: oldCookie } }),
      env,
    ),
    false,
  );
  const centralCookie = await centralSessionCookie(
    request,
    env,
    "reviewed-owner",
  );
  assert.equal(
    await isEditor(
      new Request(request, { headers: { Cookie: centralCookie } }),
      env,
    ),
    true,
  );
  const changed = { ...env, HARRHY_AUTH_OWNER_SUBJECT: "another-owner" };
  assert.equal(
    await isEditor(
      new Request(request, { headers: { Cookie: centralCookie } }),
      changed,
    ),
    false,
  );
});
