import assert from "node:assert/strict";
import test from "node:test";
import { createAccessRoutes } from "../src/access-routes.mjs";

function fixture() {
  const calls = [];
  let administrator = true;
  const mapping = {
    service: "seerr",
    instance: "local",
    nativeId: "42",
    issuer: "https://auth.invalid",
    subject: "person",
  };
  const action = {
    id: "11111111-1111-4111-8111-111111111111",
    actor: "admin",
    state: "review",
  };
  const routes = createAccessRoutes({
    accountActions: {
      managedUser: async (id) => ({ id, state: "USER_STATE_ACTIVE" }),
    },
    access: {
      isAdministrator: () => administrator,
      media: { mappings: () => [mapping] },
      mediaActions: {
        get: () => action,
        preview: async (value) => {
          calls.push(["preview", value]);
          return action;
        },
        confirm: async (value) => {
          calls.push(["confirm", value]);
          return action;
        },
        recover: async (value) => {
          calls.push(["recover", value]);
          return action;
        },
      },
    },
    rateLimit: () => {},
    renderAccountAction: (value) => {
      calls.push(["render", value]);
      return "html";
    },
  });
  const invoke = async (
    path,
    { actor = "admin", admin = true, method = "POST", fields = {} } = {},
  ) => {
    administrator = admin;
    return routes({
      request: { method },
      url: new URL(path, "https://auth.invalid"),
      form: new URLSearchParams(fields),
      session: { userId: actor },
      context: { admin },
      redirect: (location) => calls.push(["redirect", location]),
      sendRemix: async (render) => render("nonce"),
    });
  };
  return { invoke, calls, mapping, action };
}

test("media write routes require fresh administrator membership and the original actor", async () => {
  const { invoke, calls, action } = fixture();
  await assert.rejects(
    invoke(`/manage/media/actions/${action.id}/confirm`, { admin: false }),
    { status: 403 },
  );
  await assert.rejects(
    invoke(`/manage/media/actions/${action.id}/confirm`, { actor: "other" }),
    { status: 404 },
  );
  await assert.rejects(invoke(`/manage/media/actions/${action.id}/confirm`), {
    status: 400,
  });
  assert.deepEqual(calls, []);
});

test("media routes use only confirmed exact mappings and forward explicit destructive confirmation", async () => {
  const { invoke, calls, mapping, action } = fixture();
  const fields = {
    ...mapping,
    reason: "Reviewed moderation",
    operation: "remove-account-and-requests",
  };
  await assert.rejects(
    invoke("/manage/media/actions/preview", {
      fields: { ...fields, nativeId: "43" },
    }),
    { status: 409 },
  );
  assert.deepEqual(calls, []);
  await invoke("/manage/media/actions/preview", { fields });
  assert.deepEqual(calls[0], [
    "preview",
    {
      actor: "admin",
      mapping,
      reason: fields.reason,
      operation: fields.operation,
    },
  ]);
  await invoke(`/manage/media/actions/${action.id}/confirm`, {
    fields: {
      confirmed: "true",
      destructiveConfirmation: "REMOVE 42 AND 3 REQUESTS",
    },
  });
  assert.deepEqual(calls[2], [
    "confirm",
    {
      id: action.id,
      actor: "admin",
      destructiveConfirmation: "REMOVE 42 AND 3 REQUESTS",
    },
  ]);
  await invoke(`/manage/media/actions/${action.id}`, { method: "GET" });
  assert.equal(calls[4][0], "render");
});
