import assert from "node:assert/strict";
import test from "node:test";
import { createAccessRoutes } from "../src/access-routes.mjs";

for (const service of ["jellyfin", "seerr"]) {
  test(`${service} inventory-only provisioning GET renders disabled without provider calls`, async () => {
    let rendered;
    const handler = createAccessRoutes({
      api: async () => {
        throw new Error("Unexpected provider call");
      },
      mediaInventory: {
        instances: () => [{ service, instance: "local", name: "Synthetic" }],
      },
      accountActions: {
        managedUser: async () => ({ id: "admin", state: "USER_STATE_ACTIVE" }),
      },
      access: {
        isAdministrator: () => true,
        media: { mappings: () => [] },
        provisioning: {
          libraries: async () => {
            throw new Error("Unexpected library read");
          },
          list: () => [],
        },
      },
      renderMediaProvisioning: (model) => {
        rendered = model;
        return "disabled";
      },
    });
    await handler({
      request: { method: "GET" },
      url: new URL(
        `https://auth.invalid/manage/media/provisioning?service=${service}&instance=local`,
      ),
      session: { userId: "admin" },
      context: { admin: true },
      sendRemix: async (render) => render("nonce"),
    });
    assert.equal(rendered.enabled, false);
    assert.deepEqual(rendered.libraries, []);
    assert.deepEqual(rendered.people, []);
  });
}
