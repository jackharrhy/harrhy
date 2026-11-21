import * as assert from "remix/assert";
import { it } from "remix/test";

import { createAppRouter } from "../../../router.ts";
import { routes } from "../../../routes.ts";

it("serves the development kitchen sink with a nonce and no caching", async () => {
  let router = createAppRouter(
    {
      listRooms: () => Promise.resolve([]),
      getRoom: () => Promise.resolve(null),
      createRoom: () => Promise.resolve("created"),
      fetchRoom: () =>
        Promise.resolve(
          new Response("Room service unavailable", { status: 503 }),
        ),
      uploadTrack: () =>
        Promise.resolve(
          new Response("Room service unavailable", { status: 503 }),
        ),
      serveTrack: () =>
        Promise.resolve(
          new Response("Room service unavailable", { status: 503 }),
        ),
    },
    {
      identity: {
        issuer: "https://auth.example.test",
        clientId: "radio-web",
        projectId: "radio-project",
        organizationId: "radio-org",
      },
      publicOrigin: "https://radio.example.test",
      sessionSecret: "test-session-secret-that-is-at-least-32-characters",
      secureCookies: false,
    },
  );
  let response = await router.fetch(
    new Request(`http://localhost${routes.dev.kitchenSink.href()}`),
  );
  let html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  const policy = response.headers.get("Content-Security-Policy") ?? "";
  const nonce = /script-src[^;]*'nonce-([^']+)'/.exec(policy)?.[1];
  assert.ok(nonce);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.match(policy, /ws:\/\/localhost/);
  assert.match(policy, /style-src-attr 'unsafe-inline'/);
  assert.doesNotMatch(policy, /script-src[^;]*unsafe-inline/);
  assert.ok(html.includes(`nonce="${nonce}"`));
});
