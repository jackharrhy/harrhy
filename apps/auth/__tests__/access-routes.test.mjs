import test from "node:test";
import assert from "node:assert/strict";
import { createAccessRoutes } from "../src/access-routes.mjs";

test("concurrent suspension requests recheck the queued actor and preserve an active administrator", async () => {
  const users = ["alpha", "bravo"].map((id) => ({
    id,
    state: "USER_STATE_ACTIVE",
    human: {},
    details: { resourceOwner: "org" },
  }));
  const model = {
    memberships: users.map((user) => ({
      subject: user.id,
      group: "auth-administrators",
    })),
  };
  let writes = 0;
  const handler = createAccessRoutes({
    api: async () => ({ result: structuredClone(users) }),
    applications: [],
    services: [],
    integrations: [],
    organizationId: "org",
    access: {
      isAdministrator: (subject) =>
        model.memberships.some((item) => item.subject === subject),
      observeUnmanaged: () => {},
      read: () => model,
      domains: () => [],
      recordAccount: () => {},
    },
    native: { list: async () => [] },
    endUserSessions: async () => {},
    accountActions: {
      managedUser: async (id) =>
        structuredClone(users.find((user) => user.id === id)),
      setActive: async (id, active) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        writes++;
        users.find((user) => user.id === id).state = active
          ? "USER_STATE_ACTIVE"
          : "USER_STATE_INACTIVE";
      },
    },
  });
  const request = (actor, target) =>
    handler({
      request: { method: "POST" },
      url: new URL(`https://auth.example/manage/users/${target}/status`),
      form: new URLSearchParams({ active: "false" }),
      session: { userId: actor },
      context: { admin: true },
      redirect: () => {},
    });
  const result = await Promise.allSettled([
    request("alpha", "bravo"),
    request("bravo", "alpha"),
  ]);
  assert.equal(result[0].status, "fulfilled");
  assert.equal(result[1].reason.status, 403);
  assert.equal(
    users.find((user) => user.id === "alpha").state,
    "USER_STATE_ACTIVE",
  );
  assert.equal(writes, 1);
  await assert.rejects(request("alpha", "alpha"), { status: 409 });
  assert.equal(writes, 1);
});

const readerOnlyApi = async () => {
  throw new Error("management reader must not provision");
};
const syntheticProvisioningApi = async () => {};

test("new-person route reserves review only, uses explicit provisioning authority and never the old immediate creator", async () => {
  const effects = [];
  let configured = false;
  const handler = () =>
    createAccessRoutes({
      api: readerOnlyApi,
      organizationId: "org",
      issuer: "https://issuer.invalid",
      provisioningApi: configured ? syntheticProvisioningApi : null,
      access: {
        isAdministrator: () => true,
        onboarding: {
          preview: (value) => {
            effects.push(value);
            return { id: "review-id" };
          },
        },
      },
      accountActions: {
        managedUser: async () => ({
          id: "operator",
          state: "USER_STATE_ACTIVE",
        }),
      },
      rateLimit: () => {},
    });
  const input = {
    request: { method: "POST" },
    url: new URL("https://auth.invalid/manage/users"),
    session: { userId: "operator" },
    context: { admin: true },
    form: new URLSearchParams({
      username: "new-person",
      name: "Synthetic Person",
      email: "person@example.invalid",
      reason: "Reviewed request",
      password: "must-be-ignored",
    }),
    redirect: (path) => effects.push(path),
  };
  await assert.rejects(handler()(input), { status: 503 });
  assert.equal(effects.length, 0);
  configured = true;
  await handler()(input);
  assert.equal(effects.length, 2);
  assert.equal(effects[0].username, "new-person");
  assert.equal(effects[0].password, undefined);
  assert.equal(effects[1], "/manage/onboarding/review-id");
});

const serviceAccountInput = (method, path) => ({
  request: { method },
  url: new URL(path, "https://auth.invalid"),
  session: { userId: "operator" },
  context: { admin: true },
  form: new URLSearchParams({
    reason: "reviewed",
    subject: "subject",
    nativeId: "native",
  }),
  sendRemix: async (render) => render("nonce"),
});

test("configured digit-containing service IDs work for inventory and mapping preview, not unconfigured scopes", async () => {
  const selected = {
    service: "forum2",
    instance: "local",
    name: "Synthetic Forum",
  };
  const snapshot = {
    ...selected,
    state: "available",
    observedAt: new Date().toISOString(),
    accounts: [],
  };
  const scopes = [];
  let reviewed;
  const handler = createAccessRoutes({
    api: async () => ({ result: [] }),
    organizationId: "org",
    issuer: "https://issuer.invalid",
    mediaInventory: {
      instances: () => [selected],
      read: async (service, instance) => {
        scopes.push([service, instance]);
        return snapshot;
      },
    },
    access: {
      isAdministrator: () => true,
      media: {
        mappings: () => [],
        preview: (value) => {
          reviewed = value;
          return value;
        },
      },
    },
    accountActions: {
      managedUser: async () => ({ id: "operator", state: "USER_STATE_ACTIVE" }),
    },
    rateLimit: () => {},
    renderConnectedAccounts: (_instances, instance) => {
      assert.equal(instance, selected);
      return "inventory";
    },
    renderAccountLinkReview: () => "review",
  });
  assert.equal(
    await handler(serviceAccountInput("GET", "/manage/media/forum2/local")),
    true,
  );
  assert.equal(
    await handler(
      serviceAccountInput("POST", "/manage/media/forum2/local/preview"),
    ),
    true,
  );
  assert.equal(reviewed.mapping.service, "forum2");
  assert.deepEqual(scopes, [
    ["forum2", "local"],
    ["forum2", "local"],
  ]);
  await assert.rejects(
    handler(serviceAccountInput("GET", "/manage/media/forum3/local")),
    {
      status: 404,
    },
  );
});
