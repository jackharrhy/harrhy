import assert from "node:assert/strict";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { createManagementFixture } from "../fixtures/management-server.mjs";

const fixture = await createManagementFixture();
const { origin, directory } = fixture;
let browser;
const snapshots = process.env.AUTH_SCREENSHOT_DIR;
async function capture(page, name) {
  if (snapshots) {
    await mkdir(snapshots, { recursive: true });
    await page.screenshot({ path: `${snapshots}/${name}.png`, fullPage: true });
    await mkdir(`${snapshots}/assets/fonts`, { recursive: true });
    await writeFile(
      `${snapshots}/assets/style.css`,
      readFileSync(new URL("../../src/styles.css", import.meta.url)),
    );
    await writeFile(
      `${snapshots}/assets/fonts/inter-variable.woff2`,
      readFileSync(
        new URL("../../public/fonts/inter-variable.woff2", import.meta.url),
      ),
    );
    await writeFile(`${snapshots}/${name}.html`, await page.content());
  }
}
try {
  browser = await chromium.launch();
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.name));
  await page.goto(origin + "/login");
  await page.getByRole("heading", { name: "auth", exact: true }).waitFor();
  assert.equal(await page.locator("footer").count(), 0);
  assert.equal(
    await page.getByText("Your account, your apps.", { exact: true }).count(),
    0,
  );
  assert(
    (
      await page
        .locator("h1")
        .evaluate((node) => getComputedStyle(node).fontFamily)
    ).includes("Inter"),
  );
  await capture(page, "login-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "login-mobile");
  await page.setViewportSize({ width: 768, height: 1024 });
  await capture(page, "login-tablet");
  await page.emulateMedia({ colorScheme: "dark" });
  await capture(page, "login-dark");
  await page.emulateMedia({ colorScheme: "light" });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Username or email").fill("operator");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(origin + "/");
  assert.equal(await page.locator("h1").innerText(), "Your apps");
  await page.getByRole("link", { name: "Worldview", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Apps", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Media", exact: true }).waitFor();
  await page
    .getByRole("heading", { name: "Your tools", exact: true })
    .waitFor();
  await capture(page, "apps-desktop");
  await page
    .getByRole("link", { name: "Services", exact: true })
    .first()
    .click();
  await page.getByRole("heading", { name: "Services", exact: true }).waitFor();
  await page.getByRole("link", { name: "Worldview", exact: true }).click();
  await page.getByRole("heading", { name: "Worldview", exact: true }).waitFor();
  await page
    .getByRole("link", { name: "Services", exact: true })
    .last()
    .click();
  await page
    .getByRole("link", { name: "Service accounts", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Synthetic Jellyfin", exact: true })
    .click();
  assert.equal(
    await page.getByText("Not linked to Auth", { exact: true }).count(),
    2,
  );
  await capture(page, "media-desktop");
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await capture(page, `media-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const mediaForm = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Morgan Native", exact: true }),
    })
    .locator("form");
  await mediaForm.getByLabel("Existing Auth identity").selectOption("member");
  await mediaForm
    .getByLabel("Reason")
    .fill(
      "Verified synthetic exact IDs; preserve the other native-only account.",
    );
  await mediaForm
    .getByRole("button", { name: "Review identity link", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Review identity link", exact: true })
    .waitFor();
  await capture(page, "media-review");
  const mediaCsrf = await page.locator("input[name=csrf]").first().inputValue();
  const mediaOperation = await page
    .locator("input[name=operation]")
    .inputValue();
  const forgedMedia = await context.request.post(
    origin + "/manage/media/confirm",
    {
      headers: { origin: "https://wrong.example" },
      form: { csrf: mediaCsrf, operation: mediaOperation, confirmed: "true" },
    },
  );
  assert.equal(forgedMedia.status(), 403);
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Record reviewed identity link", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Identity link recorded", exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: "Return to native inventory", exact: true })
    .click();
  assert.equal(
    await page.getByText("Not linked to Auth", { exact: true }).count(),
    1,
  );
  assert.equal(await page.getByText("Linked", { exact: true }).count(), 1);
  assert.equal(fixture.writes, 0);
  assert.deepEqual(
    JSON.parse(await readFile(`${directory}/media-snapshot.json`, "utf8")),
    fixture.nativeSnapshot,
  );
  const nativeActionForm = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Morgan Native", exact: true }),
    })
    .locator("form");
  await nativeActionForm
    .getByLabel("Reason")
    .fill("Explicit synthetic native disable; preserve password and history.");
  await nativeActionForm
    .getByRole("button", { name: "Review native account disable", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Disable native account", exact: true })
    .waitFor();
  assert.equal(fixture.nativeWrites, 0);
  await capture(page, "media-disable-review");
  const nativeActionUrl = page.url();
  const nativeCsrf = await page
    .locator("input[name=csrf]")
    .first()
    .inputValue();
  const forgedNative = await context.request.post(
    `${nativeActionUrl}/confirm`,
    {
      headers: { origin: "https://wrong.example" },
      form: { csrf: nativeCsrf, confirmed: "true" },
    },
  );
  assert.equal(forgedNative.status(), 403);
  assert.equal(fixture.nativeWrites, 0);
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Disable native account", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Action status: disabled" })
    .waitFor();
  assert.equal(fixture.nativeWrites, 1);
  await context.request.post(`${nativeActionUrl}/confirm`, {
    headers: { origin },
    form: { csrf: nativeCsrf, confirmed: "true" },
  });
  assert.equal(fixture.nativeWrites, 1);
  await page.goto(origin + "/manage/media");
  await page.getByRole("link", { name: /jellyfin.*disable/ }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Action status: disabled" })
    .waitFor();
  await page
    .getByRole("link", { name: "Return to native inventory", exact: true })
    .click();
  await writeFile(
    `${directory}/media-snapshot.json`,
    JSON.stringify({
      ...fixture.nativeSnapshot,
      observedAt: "2000-01-01T00:00:00Z",
    }),
  );
  await page.reload();
  await page
    .getByRole("status")
    .filter({ hasText: "Account list is out of date" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Review identity link", exact: true })
      .count(),
    0,
  );
  await writeFile(
    `${directory}/media-snapshot.json`,
    JSON.stringify(fixture.nativeSnapshot),
  );
  await page.goto(origin + "/manage/media");
  await page
    .getByRole("link", {
      name: "Verified synthetic exact IDs; preserve the other native-only account.",
      exact: true,
    })
    .click();
  await page
    .getByRole("heading", { name: "Identity link recorded", exact: true })
    .waitFor();
  await page.goto(origin + "/manage/media/seerr/synthetic-server");
  const seerrForm = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Casey Requests", exact: true }),
    })
    .locator("form");
  await seerrForm.getByLabel("Existing Auth identity").selectOption("member");
  await seerrForm
    .getByLabel("Reason")
    .fill("Explicit synthetic Seerr correspondence.");
  await seerrForm
    .getByRole("button", { name: "Review identity link", exact: true })
    .click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Record reviewed identity link", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Return to native inventory", exact: true })
    .click();
  const seerrActionForm = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "Casey Requests", exact: true }),
    })
    .locator("form");
  await seerrActionForm
    .getByLabel("Reason")
    .fill("Intentional synthetic request moderation.");
  await seerrActionForm
    .getByRole("button", {
      name: "Review account and request removal",
      exact: true,
    })
    .click();
  await page
    .getByRole("heading", { name: "Remove account and requests", exact: true })
    .waitFor();
  await page
    .getByText("Intentional synthetic request moderation.", { exact: true })
    .waitFor();
  assert.equal(fixture.seerrDeletes, 0);
  await capture(page, "media-seerr-remove-review");
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await capture(page, `media-seerr-remove-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const seerrActionUrl = page.url();
  const seerrCsrf = await page.locator("input[name=csrf]").first().inputValue();
  const wrongCount = await context.request.post(`${seerrActionUrl}/confirm`, {
    headers: { origin },
    form: {
      csrf: seerrCsrf,
      confirmed: "true",
      destructiveConfirmation: "REMOVE 42 AND 0 REQUESTS",
    },
  });
  assert.equal(wrongCount.status(), 409);
  assert.equal(fixture.seerrDeletes, 0);
  await page
    .getByLabel(/Type REMOVE 42 AND 1 REQUESTS/)
    .fill("REMOVE 42 AND 1 REQUESTS");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Remove account and requests", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Action status: removed" })
    .waitFor();
  assert.equal(fixture.seerrDeletes, 1);
  await context.request.post(`${seerrActionUrl}/confirm`, {
    headers: { origin },
    form: {
      csrf: seerrCsrf,
      confirmed: "true",
      destructiveConfirmation: "REMOVE 42 AND 1 REQUESTS",
    },
  });
  assert.equal(fixture.seerrDeletes, 1);
  assert.deepEqual(
    JSON.parse(await readFile(`${directory}/seerr-snapshot.json`, "utf8")),
    fixture.seerrSnapshot,
  );
  await page.goto(origin + "/manage/services");
  await page.getByRole("link", { name: "Technical integrations" }).click();
  await page.getByRole("heading", { name: "Technical integrations" }).waitFor();
  await page.getByRole("link", { name: "People", exact: true }).first().click();
  await page.getByRole("link", { name: /Sam Member/ }).click();
  await capture(page, "person-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.getByText("Menu", { exact: true }).click();
  await page
    .locator(".mobile-nav a")
    .filter({ hasText: "Your apps" })
    .waitFor();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.getByText("Menu", { exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const previewCsrf = await page
    .locator("input[name=csrf]")
    .first()
    .inputValue();
  const beforePreviewWrites = fixture.writes;
  await page.getByRole("link", { name: "Preview auth", exact: true }).click();
  await page.getByText("Viewing Sam Member", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("link", { name: "People", exact: true }).count(),
    0,
  );
  assert.equal(await page.locator("form").count(), 0);
  assert.equal(await page.locator('a[href^="https://"]').count(), 0);
  await page
    .getByText("Temporary Auth preview · Read only", { exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: /Access details for/ })
    .first()
    .click();
  await page
    .locator("main")
    .getByRole("link", { name: "Your apps", exact: true })
    .click();
  assert.equal(new URL(page.url()).pathname, "/manage/people/member/preview");
  await capture(page, "user-preview");
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await page.getByRole("heading", { name: "Account", exact: true }).waitFor();
  assert.equal(await page.locator("form").count(), 0);
  const readonly = await context.request.post(
    origin + "/manage/people/member/preview",
    {
      headers: { origin },
      form: { csrf: previewCsrf },
    },
  );
  assert.equal(readonly.status(), 403);
  assert.equal(fixture.writes, beforePreviewWrites);
  await page.getByRole("link", { name: "Exit preview", exact: true }).click();
  await page.getByRole("link", { name: "Groups", exact: true }).first().click();
  await page.getByRole("link", { name: "Create group", exact: true }).click();
  await page.getByLabel("Group name").fill("Cartography collaborators");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Synthetic group for the browser acceptance.");
  await page.locator(`[name=bindings][value="maps|member"]`).check();
  await page.locator('[name=bindings][value="artbin|member"]').check();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Prove explicit group creation.");
  await page.getByRole("button", { name: "Review group", exact: true }).click();
  assert.equal(fixture.writes, 0);
  await page
    .getByRole("button", { name: "Apply reviewed change", exact: true })
    .click();
  assert.equal(fixture.writes, 0);
  await page.getByRole("link", { name: "People", exact: true }).first().click();
  await page.getByRole("link", { name: /Sam Member/ }).click();
  const membership = page
    .locator("form")
    .filter({ has: page.locator('[name=type][value="membership.add"]') });
  await membership
    .getByLabel("Add to group")
    .selectOption({ label: "Cartography collaborators" });
  await membership.getByLabel("Reason").fill("Prove one group assignment.");
  await membership.getByRole("button", { name: "Review membership" }).click();
  await capture(page, "review-desktop");
  assert.equal(fixture.writes, 0);
  await page.getByRole("button", { name: "Apply reviewed change" }).click();
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
  await page.goto(origin + "/manage/activity");
  await page.getByRole("heading", { name: "Activity & cleanup" }).waitFor();
  await page.getByRole("link", { name: /Prove one group assignment/ }).click();
  await page.getByRole("heading", { name: "Access operation" }).waitFor();
  await page.getByText("External cleanup", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Groups", exact: true }).first().click();
  await capture(page, "groups-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "groups-mobile");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + "/account/sessions");
  await page.getByRole("heading", { name: "Sessions", exact: true }).waitFor();
  assert.equal(
    await page.getByText("This browser", { exact: true }).count(),
    1,
  );
  await page.goto(origin + "/manage/people/new");
  await page.getByLabel("Username", { exact: true }).fill("new-person");
  await page
    .getByLabel("Display name", { exact: true })
    .fill("Synthetic New Person");
  await page
    .getByLabel("Invitation recipient", { exact: true })
    .fill("synthetic@example.invalid");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Explicit synthetic onboarding review");
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  await page
    .getByRole("button", { name: "Review person", exact: true })
    .click();
  await page.getByText("Awaiting creation review", { exact: true }).waitFor();
  assert.equal(fixture.identityWrites, 0);
  await capture(page, "identity-review-desktop");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Create identity", exact: true })
    .click();
  await page
    .getByText("Identity created; invitation not sent", { exact: true })
    .waitFor();
  assert.equal(fixture.identityWrites, 1);
  await page.getByLabel("Retype the exact invitation recipient").waitFor();
  await capture(page, "identity-created-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await capture(page, "identity-created-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.equal(
    (
      await context.request.post(origin + "/invitation", {
        headers: { origin: "https://wrong.invalid" },
        form: { csrf: "wrong" },
      })
    ).status(),
    403,
  );
  assert.equal(fixture.identityWrites, 1);
  const reviewUrl = page.url();
  await page
    .getByLabel("Retype the exact invitation recipient")
    .fill("synthetic@example.invalid");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Send invitation", exact: true })
    .click();
  await page
    .getByText("Invitation requested; recipient setup pending", { exact: true })
    .waitFor();
  assert.deepEqual(fixture.recipientEffects, ["send"]);
  const recipientContext = await browser.newContext({
    ignoreHTTPSErrors: true,
  });
  const recipient = await recipientContext.newPage();
  const invitationRedirect = await recipientContext.request.get(
    fixture.invitationLink,
    {
      maxRedirects: 0,
    },
  );
  assert.equal(invitationRedirect.status(), 303);
  assert.equal(invitationRedirect.headers()["referrer-policy"], "no-referrer");
  const recipientReferrers = [];
  recipient.on("request", (request) => {
    recipientReferrers.push(request.headers().referer || "");
  });
  await recipient.goto(fixture.invitationLink);
  await recipient.waitForURL(origin + "/invitation");
  assert.deepEqual(fixture.recipientEffects, ["send"]);
  await recipient
    .locator('input[name="password"]')
    .fill("Synthetic-passphrase-42");
  await recipient
    .locator('input[name="confirmation"]')
    .fill("Synthetic-passphrase-42");
  await recipient
    .getByRole("button", { name: "Finish account setup", exact: true })
    .click();
  await recipient.getByText("Account ready", { exact: true }).waitFor();
  assert.deepEqual(fixture.recipientEffects, [
    "send",
    "verify",
    "reset",
    "password",
  ]);
  await page.goto(reviewUrl);
  await page.getByText("Recipient password set", { exact: true }).waitFor();
  await recipient.goto(origin + "/login");
  await recipient.getByLabel("Username or email").fill("new-person");
  await recipient
    .getByLabel("Password", { exact: true })
    .fill("Synthetic-passphrase-42");
  await recipient.getByRole("button", { name: "Sign in", exact: true }).click();
  await recipient.waitForURL(origin + "/");
  assert.equal(
    fixture.grants.filter((grant) => grant.userId === fixture.users.at(-1).id)
      .length,
    0,
  );
  assert(!fixture.logs.includes("synthetic-invitation-proof"));
  assert(!fixture.logs.includes("Synthetic-passphrase-42"));
  assert(
    recipientReferrers.every(
      (value) => !value.includes("synthetic-invitation-proof"),
    ),
  );
  await recipientContext.close();
  await page.goto(origin + "/manage/media");
  await page
    .getByRole("link", {
      name: "Create service account",
      exact: true,
    })
    .click();
  await capture(page, "media-provisioning-initial");
  assert.equal(
    await page
      .getByRole("heading", { name: "Create native account", exact: true })
      .count(),
    1,
    await page.locator("main").innerText(),
  );
  await page
    .getByLabel("Jellyfin instance", { exact: true })
    .selectOption("synthetic-server");
  await page
    .getByRole("button", { name: "Load available libraries", exact: true })
    .click();
  await page
    .getByLabel("Existing Auth identity", { exact: true })
    .selectOption(fixture.users.at(-1).id);
  await page
    .getByLabel("New native username", { exact: true })
    .fill("synthetic-recipient");
  await page.getByLabel("Synthetic Movies", { exact: true }).check();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Explicit synthetic new-account review; no incumbent changes.");
  await capture(page, "media-provisioning-form");
  await page
    .getByRole("button", { name: "Review new native account", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Review native creation", exact: true })
    .waitFor();
  assert.equal(fixture.nativeCreations, 0);
  const creationUrl = page.url();
  const creationCsrf = await page.locator("main input[name=csrf]").inputValue();
  const forgedCreation = await context.request.post(`${creationUrl}/confirm`, {
    headers: { origin: "https://wrong.example" },
    form: {
      csrf: creationCsrf,
      confirmed: "true",
      password: "Synthetic-native-passphrase-42",
    },
  });
  assert.equal(forgedCreation.status(), 403);
  assert.equal(fixture.nativeCreations, 0);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await capture(page, `media-provisioning-review-${width}`);
  }
  await page
    .getByLabel("Separate native password", { exact: true })
    .fill("Synthetic-native-passphrase-42");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Create native account", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Creation status: created" })
    .waitFor();
  assert.equal(fixture.nativeCreations, 1);
  await context.request.post(`${creationUrl}/confirm`, {
    headers: { origin },
    form: {
      csrf: creationCsrf,
      confirmed: "true",
      password: "Synthetic-native-passphrase-42",
    },
  });
  assert.equal(fixture.nativeCreations, 1);
  assert.equal(
    fixture.grants.filter((grant) => grant.userId === fixture.users.at(-1).id)
      .length,
    0,
  );
  assert(!fixture.logs.includes("Synthetic-native-passphrase-42"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  fixture.nativeSnapshot.accounts.push({
    nativeId: fixture.createdNativeId,
    name: "synthetic-recipient",
    disabled: false,
    administrator: false,
  });
  await writeFile(
    `${directory}/media-snapshot.json`,
    JSON.stringify(fixture.nativeSnapshot),
  );
  await page.goto(origin + "/manage/media/jellyfin/synthetic-server");
  const createdMappingForm = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "synthetic-recipient",
        exact: true,
      }),
    })
    .locator("form");
  await createdMappingForm
    .getByLabel("Existing Auth identity")
    .selectOption(fixture.users.at(-1).id);
  await createdMappingForm
    .getByLabel("Reason")
    .fill("Separate explicit exact-ID mapping after new native creation.");
  await createdMappingForm
    .getByRole("button", { name: "Review identity link", exact: true })
    .click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Record reviewed identity link", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Identity link recorded", exact: true })
    .waitFor();
  await page.goto(origin + "/manage/media/provisioning");
  await page
    .getByLabel("Seerr instance", { exact: true })
    .selectOption("synthetic-server");
  await page
    .getByLabel("Confirmed Jellyfin mapping", { exact: true })
    .selectOption(
      JSON.stringify([
        "synthetic-server",
        fixture.createdNativeId,
        origin,
        fixture.users.at(-1).id,
      ]),
    );
  await page
    .getByLabel("Import reason", { exact: true })
    .fill(
      "Explicit one-account import with reviewed request and auto-approve 160.",
    );
  await page
    .getByRole("button", { name: "Review Seerr exact-ID import", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Seerr request and auto-approve · 160",
      exact: true,
    })
    .waitFor();
  assert.equal(fixture.seerrImports, 0);
  assert.equal(await page.locator("input[type=password]").count(), 0);
  const importUrl = page.url();
  const importCsrf = await page.locator("main input[name=csrf]").inputValue();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await capture(page, `media-seerr-import-${width}`);
  }
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Create native account", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Creation status: created" })
    .waitFor();
  assert.equal(fixture.seerrImports, 1);
  await context.request.post(`${importUrl}/confirm`, {
    headers: { origin },
    form: { csrf: importCsrf, confirmed: "true" },
  });
  assert.equal(fixture.seerrImports, 1);
  assert.equal(fixture.importedSeerrUser.permissions, 160);
  assert(!fixture.logs.includes("private-never-retained"));
  assert.equal(
    fixture.grants.filter((grant) => grant.userId === fixture.users.at(-1).id)
      .length,
    0,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  const memberContext = await browser.newContext({ ignoreHTTPSErrors: true });
  const memberPage = await memberContext.newPage();
  await memberPage.goto(origin + "/login");
  await memberPage.getByLabel("Username or email").fill("member");
  await memberPage
    .getByLabel("Password", { exact: true })
    .fill("fixture-password");
  await memberPage
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await memberPage.waitForURL(origin + "/");
  assert.equal(
    await memberPage.getByRole("link", { name: "People", exact: true }).count(),
    0,
  );
  assert.equal(
    (
      await memberContext.request.get(
        origin + "/manage/media/jellyfin/synthetic-server",
      )
    ).status(),
    403,
  );
  assert.equal(
    (await memberContext.request.get(origin + "/manage/onboarding")).status(),
    403,
  );
  const denied = await memberContext.request.get(origin + "/manage/people");
  assert.equal(denied.status(), 403);
  assert.equal(
    (
      await memberContext.request.get(
        origin + "/manage/people/operator/preview",
      )
    ).status(),
    403,
  );
  const forged = await context.request.post(origin + "/manage/changes/apply", {
    headers: { origin: "https://wrong.example" },
    form: { operation: "made-up", csrf: "wrong" },
  });
  assert.equal(forged.status(), 403);
  // Preview refresh observes current synthetic effects, not just a new timestamp.
  await fixture.refreshInventorySnapshots();
  const refreshedJellyfin = JSON.parse(
    await readFile(`${directory}/media-snapshot.json`, "utf8"),
  );
  const refreshedSeerr = JSON.parse(
    await readFile(`${directory}/seerr-snapshot.json`, "utf8"),
  );
  assert.equal(refreshedJellyfin.accounts[0].disabled, true);
  assert.equal(
    refreshedJellyfin.accounts.filter(
      (account) => account.nativeId === fixture.createdNativeId,
    ).length,
    1,
  );
  assert.equal(
    refreshedSeerr.accounts.some((account) => account.nativeId === "42"),
    false,
  );
  assert.equal(
    refreshedSeerr.accounts.some((account) => account.nativeId === "73"),
    true,
  );
  assert.deepEqual(
    refreshedSeerr.accounts.find((account) => account.nativeId === "160"),
    fixture.seerrSnapshot.accounts.find(
      (account) => account.nativeId === "160",
    ),
  );
  assert(
    Date.parse(refreshedJellyfin.observedAt) >=
      Date.parse(fixture.nativeSnapshot.observedAt),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS access UI Chromium: HTTPS reviewed creation, separate invitation, recipient proof/password and normal sign-in without grants; compact login, directory, groups preview/apply, role preservation, sessions, member denial, forged Origin, mobile layout.",
  );
  assert(!fixture.logs.includes("SyntaxError"), "Server syntax failure");
  await memberContext.close();
  await context.close();
} finally {
  await browser?.close();
  await fixture.close();
}
