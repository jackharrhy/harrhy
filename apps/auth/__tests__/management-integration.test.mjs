import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { authClient, hiddenFields } from "./fixtures/auth-requests.mjs";
import { createManagementFixture } from "./fixtures/management-server.mjs";

const instance = "synthetic-server";
const base = (service) => `/manage/media/${service}/${instance}`;
const jellyfin = "11111111-2222-4333-8444-555555555555";

async function submit(client, html, path, values, expected, options = {}) {
  const body = new URLSearchParams(hiddenFields(html, path, options.fields));
  for (const [key, value] of Object.entries(values)) {
    body.delete(key);
    for (const item of [].concat(value)) body.append(key, item);
  }
  const response = await client.request(path, {
    form: body,
    requestOrigin: options.origin,
  });
  assert.equal(
    response.status,
    expected,
    `${path}: ${(await response.clone().text()).slice(-700)}`,
  );
  return response;
}

async function linkAccount(client, service, id) {
  const detail = `${base(service)}/accounts/${id}`;
  const form = await client.get(`${detail}/link`);
  const review = await submit(
    client,
    form,
    `${base(service)}/preview`,
    {
      subject: "member",
      reason: "Reviewed exact identity correspondence",
    },
    200,
  );
  const html = await review.text();
  const confirm = { confirmed: "true" };
  await submit(client, html, "/manage/media/confirm", confirm, 403, {
    origin: "https://wrong.test",
  });
  const result = await submit(
    client,
    html,
    "/manage/media/confirm",
    confirm,
    200,
  );
  assert.match(await result.text(), /Identity link recorded/);
  return detail;
}

test("real management routes separate review from grants and enforce administrator access", async (t) => {
  const fixture = await createManagementFixture({ inProcess: true });
  t.after(fixture.close);
  const operator = authClient(fixture);
  const member = authClient(fixture);
  await operator.login("operator");
  await member.login("member");
  for (const path of [
    "/manage/people",
    "/manage/people/operator/preview",
    "/manage/onboarding",
    base("jellyfin"),
  ])
    await member.get(path, 403);
  const preview = "/manage/changes/preview";
  const apply = "/manage/changes/apply";
  const group = await operator.get("/manage/groups/new");
  let review = await submit(
    operator,
    group,
    preview,
    {
      name: "Cartography collaborators",
      description: "Fixture group",
      bindings: ["maps|member", "artbin|member"],
      reason: "Reviewed group creation",
    },
    200,
    { fields: { type: "group.save" } },
  );
  assert.equal(fixture.writes, 0);
  await submit(operator, await review.text(), apply, {}, 303);
  assert.equal(fixture.writes, 0);
  const person = await operator.get("/manage/people/member");
  const groupId = person.match(
    /<option value="([^"]+)">Cartography collaborators<\/option>/,
  )?.[1];
  assert.ok(groupId);
  review = await submit(
    operator,
    person,
    preview,
    { group: groupId, reason: "Reviewed membership" },
    200,
    { fields: { type: "membership.add" } },
  );
  assert.equal(fixture.writes, 0);
  const receipt = await review.text();
  await submit(operator, receipt, apply, {}, 403, {
    origin: "https://wrong.test",
  });
  assert.equal(fixture.writes, 0);
  await submit(operator, receipt, apply, {}, 303);
  assert.equal(fixture.writes, 1);
  assert(
    fixture.grants.some(
      (grant) =>
        grant.userId === "member" &&
        grant.projectId === fixture.artbin.projectId,
    ),
  );
  assert.deepEqual(
    fixture.grants.find((grant) => grant.id === "member-maps").roleKeys,
    ["member", "private-extra"],
  );
});

test("mapping and destructive native operations require separate same-origin confirmations", async (t) => {
  const fixture = await createManagementFixture({ inProcess: true });
  t.after(fixture.close);
  const client = authClient(fixture);
  await client.login("operator");
  assert.match(
    await client.get(`${base("jellyfin")}?q=Morgan`),
    /Morgan Native/,
  );
  assert.match(
    await client.get(`${base("jellyfin")}?q=no-matching-user`),
    /No accounts match these filters/,
  );
  await client.get(`${base("jellyfin")}/accounts/missing`, 404);
  for (const [service, id, counter, receipt] of [
    ["jellyfin", jellyfin, "nativeWrites", "disabled"],
    ["seerr", "42", "seerrDeletes", "removed"],
  ]) {
    const detail = await linkAccount(client, service, id);
    assert.equal(fixture.writes, 0);
    const review = await submit(
      client,
      await client.get(`${detail}/action`),
      "/manage/media/actions/preview",
      { reason: "Reviewed native change" },
      303,
    );
    const path = review.headers.get("location");
    const html = await client.get(path);
    const confirm = `${path}/confirm`;
    const values = { confirmed: "true" };
    if (service === "seerr") {
      await submit(
        client,
        html,
        confirm,
        { ...values, destructiveConfirmation: "REMOVE 42 AND 0 REQUESTS" },
        409,
      );
      values.destructiveConfirmation = "REMOVE 42 AND 1 REQUESTS";
    }
    await submit(client, html, confirm, values, 403, {
      origin: "https://wrong.test",
    });
    assert.equal(fixture[counter], 0);
    const applied = await submit(client, html, confirm, values, 303);
    assert.match(
      await client.get(applied.headers.get("location")),
      new RegExp(`Action status: ${receipt}`),
    );
    await client.request(confirm, {
      form: { ...hiddenFields(html, confirm), ...values },
    });
    assert.equal(fixture[counter], 1);
  }
});

test("provisioning capabilities are isolated from lifecycle writes and deny unsupported services", async (t) => {
  for (const mode of ["disabled", "provisioning-only", "empty-override"]) {
    await t.test(mode, async (caseTest) => {
      const enabled = mode === "provisioning-only";
      const fixture = await createManagementFixture({
        inProcess: true,
        mediaWrites: mode === "empty-override",
        mediaProvisioningOnly: enabled,
        mediaProvisioningDisabled: mode === "empty-override",
      });
      caseTest.after(fixture.close);
      const client = authClient(fixture);
      await client.login("operator");
      const getSetup = (service) =>
        client.get(
          `/manage/media/provisioning?service=${service}&instance=${instance}`,
        );
      assert.match(
        await getSetup("seerr"),
        /Account creation is not enabled for Synthetic Seerr/,
      );
      const setup = await getSetup("jellyfin");
      if (enabled) {
        assert.match(setup, /name="folderId"/);
        const detail = await linkAccount(client, "jellyfin", jellyfin);
        await submit(
          client,
          await client.get(`${detail}/action`),
          "/manage/media/actions/preview",
          { reason: "Provisioning must not enable lifecycle" },
          502,
        );
      } else {
        assert.match(
          setup,
          /Account creation is not enabled for Synthetic Jellyfin/,
        );
        assert.doesNotMatch(setup, /<form[^>]*action="[^"]*provisioning/);
      }
      for (const counter of [
        "nativeCreations",
        "nativeWrites",
        "seerrImports",
        "seerrDeletes",
      ])
        assert.equal(fixture[counter], 0);
    });
  }
});

test("identity creation, invitation and proof-bound password setup are separate durable effects", async (t) => {
  const fixture = await createManagementFixture({ inProcess: true });
  t.after(fixture.close);
  const operator = authClient(fixture);
  const recipient = authClient(fixture);
  await operator.login("operator");
  const email = "synthetic@example.invalid";
  const form = await operator.get("/manage/people/new");
  assert.doesNotMatch(form, /type="password"/);
  const review = await submit(
    operator,
    form,
    "/manage/users",
    {
      username: "new-person",
      name: "Synthetic New Person",
      email,
      reason: "Explicit identity review",
    },
    303,
  );
  const path = review.headers.get("location");
  assert.equal(fixture.identityWrites, 0);
  await submit(
    operator,
    await operator.get(path),
    `${path}/create`,
    { confirmed: "yes" },
    303,
  );
  assert.equal(fixture.identityWrites, 1);
  assert.deepEqual(fixture.recipientEffects, []);
  await submit(
    operator,
    await operator.get(path),
    `${path}/invite`,
    { recipient: email, confirmed: "yes" },
    303,
  );
  assert.deepEqual(fixture.recipientEffects, ["send"]);
  const password = "Synthetic-passphrase-42";
  for (const [link, expected] of [
    [
      fixture.invitationLink.replace(
        "synthetic-invitation-proof",
        "wrong-proof",
      ),
      /proof is invalid or expired/,
    ],
    [fixture.invitationLink, /Account ready/],
  ]) {
    const landing = await recipient.request(link);
    assert.equal(landing.status, 303);
    assert.equal(landing.headers.get("location"), "/invitation");
    assert.equal(landing.headers.get("referrer-policy"), "no-referrer");
    const html = await recipient.get("/invitation");
    assert.deepEqual(fixture.recipientEffects, ["send"]);
    const result = await recipient.request("/invitation", {
      form: {
        ...hiddenFields(html, "/invitation"),
        password,
        confirmation: password,
      },
    });
    assert.match(await result.text(), expected);
  }
  assert.deepEqual(fixture.recipientEffects, [
    "send",
    "verify",
    "reset",
    "password",
  ]);
  assert.match(await operator.get(path), /Recipient password set/);
  await recipient.login("new-person", password);
  assert(
    !fixture.grants.some((grant) => grant.userId === fixture.users.at(-1).id),
  );
});

test("reviewed Jellyfin create-and-link and Seerr exact-ID import do not replay or issue grants", async (t) => {
  const fixture = await createManagementFixture({ inProcess: true });
  t.after(fixture.close);
  const client = authClient(fixture);
  await client.login("operator");
  const basePath = "/manage/media/provisioning";
  const setup = (service) =>
    client.get(`${basePath}?service=${service}&instance=${instance}`);
  const values = {
    subject: "member",
    username: "synthetic-recipient",
    reason: "Reviewed native account creation",
    folderId: fixture.selectedLibrary,
  };
  const review = await submit(
    client,
    await setup("jellyfin"),
    `${basePath}/preview`,
    values,
    303,
  );
  const path = review.headers.get("location");
  const html = await client.get(path);
  const confirmed = {
    confirmed: "true",
    password: "Synthetic-native-passphrase-42",
  };
  await submit(client, html, `${path}/confirm`, confirmed, 403, {
    origin: "https://wrong.test",
  });
  assert.equal(fixture.nativeCreations, 0);
  const ledger = new DatabaseSync(`${fixture.directory}/access.sqlite`);
  t.after(() => ledger.close());
  ledger.exec(
    "CREATE TRIGGER synthetic_link_failure BEFORE INSERT ON media_identity_links BEGIN SELECT RAISE(ABORT, 'synthetic local link failure'); END",
  );
  await submit(client, html, `${path}/confirm`, confirmed, 303);
  assert.equal(fixture.nativeCreations, 1);
  const pending = await client.get(path);
  assert.match(pending, /Account created · linking not finished/);
  assert.doesNotMatch(pending, /type="password"/);
  ledger.exec("DROP TRIGGER synthetic_link_failure");
  await submit(client, pending, `${path}/confirm`, {}, 303);
  assert.match(await client.get(path), /Account created and linked/);
  assert.equal(fixture.nativeCreations, 1);
  const sourceMapping = JSON.stringify([
    instance,
    fixture.createdNativeId,
    fixture.origin,
    "member",
  ]);
  const importReview = await submit(
    client,
    await setup("seerr"),
    `${basePath}/seerr-preview`,
    { sourceMapping, reason: "Reviewed Seerr permissions" },
    303,
  );
  const importPath = importReview.headers.get("location");
  const importHtml = await client.get(importPath);
  assert.match(importHtml, /Seerr request and auto-approve · 160/);
  assert.doesNotMatch(importHtml, /type="password"/);
  assert.equal(fixture.seerrImports, 0);
  await submit(
    client,
    importHtml,
    `${importPath}/confirm`,
    { confirmed: "true" },
    303,
  );
  await client.request(`${importPath}/confirm`, {
    form: {
      ...hiddenFields(importHtml, `${importPath}/confirm`),
      confirmed: "true",
    },
  });
  assert.match(
    await client.get(importPath),
    /Account created · link separately/,
  );
  assert.equal(fixture.seerrImports, 1);
  assert.equal(fixture.importedSeerrUser.permissions, 160);
  assert.equal(fixture.writes, 0);
});
