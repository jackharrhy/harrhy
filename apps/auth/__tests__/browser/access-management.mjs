import assert from "node:assert/strict";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
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
  assert.equal(await page.locator("main form").count(), 0);
  assert.equal(
    await page.getByText("Morgan Native", { exact: true }).count(),
    0,
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await capture(page, `media-entry-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("link", { name: "Synthetic Jellyfin", exact: true })
    .click();
  assert.equal(await page.locator('main form[method="post"]').count(), 0);
  await page.getByLabel("Find account", { exact: true }).fill("Morgan");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.reload();
  assert.equal(
    await page.getByLabel("Find account", { exact: true }).inputValue(),
    "Morgan",
  );
  assert.equal(
    await page
      .getByRole("link", { name: "Morgan Native", exact: true })
      .count(),
    1,
  );
  await page
    .getByLabel("Find account", { exact: true })
    .fill("no-matching-user");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page
    .getByText("No accounts match these filters.", { exact: false })
    .waitFor();
  await page.getByRole("link", { name: "Reset filters", exact: true }).click();
  assert.equal(
    await page
      .locator("section")
      .getByText("Not linked to Auth", { exact: true })
      .count(),
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
  await page.getByRole("link", { name: "Morgan Native", exact: true }).click();
  const detailAddress = page.url();
  await page.reload();
  assert.equal(page.url(), detailAddress);
  assert.equal(await page.locator('main form[method="post"]').count(), 0);
  assert.equal(
    await page.getByText("Casey Requests", { exact: true }).count(),
    0,
  );
  assert.equal(
    (await context.request.get(`${detailAddress}-missing`)).status(),
    404,
  );
  await page.goBack();
  await page.getByRole("link", { name: "Morgan Native", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(detailAddress);
  assert.equal(page.url(), detailAddress);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await capture(page, `media-detail-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("link", { name: "Link Auth identity", exact: true })
    .click();
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
    .getByRole("link", { name: "Back to account", exact: true })
    .click();
  assert.equal(
    await page.getByText("Not linked to Auth", { exact: true }).count(),
    0,
  );
  assert.equal(await page.getByText("Linked", { exact: true }).count(), 1);
  assert.equal(fixture.writes, 0);
  assert.deepEqual(
    JSON.parse(await readFile(`${directory}/media-snapshot.json`, "utf8")),
    fixture.nativeSnapshot,
  );
  await page
    .getByRole("link", { name: "Disable account", exact: true })
    .click();
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
  await page.goto(origin + "/manage/media/history");
  await page.getByRole("link", { name: /^disable/ }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Action status: disabled" })
    .waitFor();
  await page
    .getByRole("link", { name: "Back to account", exact: true })
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
  await page.goto(origin + "/manage/media/history");
  await page
    .getByRole("link", {
      name: "Morgan Native · complete",
      exact: true,
    })
    .click();
  await page
    .getByRole("heading", { name: "Identity link recorded", exact: true })
    .waitFor();
  await page.goto(origin + "/manage/media/seerr/synthetic-server");
  await page.getByRole("link", { name: "Casey Requests", exact: true }).click();
  await page
    .getByRole("link", { name: "Link Auth identity", exact: true })
    .click();
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
    .getByRole("link", { name: "Back to account", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Remove account and requests", exact: true })
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
  await recipient.goto(
    fixture.invitationLink.replace("synthetic-invitation-proof", "wrong-proof"),
  );
  await recipient
    .locator('input[name="password"]')
    .fill("Synthetic-passphrase-42");
  await recipient
    .locator('input[name="confirmation"]')
    .fill("Synthetic-passphrase-42");
  await recipient
    .getByRole("button", { name: "Finish account setup", exact: true })
    .click();
  await recipient
    .getByText(
      "This invitation proof is invalid or expired. Open your current invitation email.",
      { exact: true },
    )
    .waitFor();
  assert.deepEqual(fixture.recipientEffects, ["send"]);
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
  await page.goto(origin + `/manage/people/${fixture.users.at(-1).id}`);
  await page
    .getByRole("link", { name: "Set up Jellyfin", exact: true })
    .click();
  await capture(page, "media-provisioning-initial");
  await page
    .getByRole("heading", { name: "Set up Jellyfin", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Person", { exact: true }).inputValue(),
    fixture.users.at(-1).id,
  );
  await page
    .getByLabel("Jellyfin username", { exact: true })
    .fill("synthetic-recipient");
  await page
    .getByLabel("Note for activity log", { exact: true })
    .fill("Explicit synthetic new-account review; no incumbent changes.");
  await page.getByRole("button", { name: "Review setup", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(fixture.nativeCreations, 0);
  assert.equal(
    await page.getByLabel("Person", { exact: true }).inputValue(),
    fixture.users.at(-1).id,
  );
  assert.equal(
    await page.getByLabel("Jellyfin username", { exact: true }).inputValue(),
    "synthetic-recipient",
  );
  assert.equal(
    await page
      .getByLabel("Note for activity log", { exact: true })
      .inputValue(),
    "Explicit synthetic new-account review; no incumbent changes.",
  );
  assert(
    await page
      .getByRole("alert")
      .evaluate((node) => node === document.activeElement),
  );
  await capture(page, "media-provisioning-validation");
  await page.getByLabel("Synthetic Movies", { exact: true }).check();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await capture(page, `media-provisioning-form-${width}`);
  }
  await page.getByRole("button", { name: "Review setup", exact: true }).click();
  await page
    .getByRole("heading", { name: "Review Jellyfin setup", exact: true })
    .waitFor();
  assert.equal(fixture.nativeCreations, 0);
  assert.equal(await page.locator("main details").getAttribute("open"), null);
  await page.getByText("Technical details", { exact: true }).focus();
  await page.keyboard.press("Enter");
  assert.notEqual(
    await page.locator("main details").getAttribute("open"),
    null,
  );
  await page.keyboard.press("Enter");
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
    .getByLabel("Jellyfin password", { exact: true })
    .fill("Synthetic-native-passphrase-42");
  await page.getByRole("checkbox").check();
  const localLedger = new DatabaseSync(`${directory}/access.sqlite`);
  try {
    localLedger.exec(
      "CREATE TRIGGER synthetic_link_failure BEFORE INSERT ON media_identity_links BEGIN SELECT RAISE(ABORT, 'synthetic local link failure'); END",
    );
    await page
      .getByRole("button", { name: "Create and link account", exact: true })
      .click();
    await page
      .getByRole("heading", {
        name: "Account created · linking not finished",
        exact: true,
      })
      .waitFor();
    assert.equal(fixture.nativeCreations, 1);
    assert.equal(await page.locator("input[type=password]").count(), 0);
    assert.equal(
      await page
        .getByRole("button", { name: "Create and link account", exact: true })
        .count(),
      0,
    );
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await capture(page, `media-provisioning-link-pending-${width}`);
    }
    localLedger.exec("DROP TRIGGER synthetic_link_failure");
    await page.reload();
    await page
      .getByRole("button", { name: "Finish linking account", exact: true })
      .click();
  } finally {
    localLedger.close();
  }
  await page
    .getByRole("heading", { name: "Account created and linked", exact: true })
    .waitFor();
  assert.equal(fixture.nativeCreations, 1);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await capture(page, `media-provisioning-linked-${width}`);
  }
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
  await page
    .getByRole("link", { name: "Return to person", exact: true })
    .click();
  await page
    .getByRole("link", {
      name: "View linked Jellyfin account · synthetic-server",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "Set up Jellyfin", exact: true })
      .count(),
    0,
  );
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
  await page
    .getByRole("link", { name: "synthetic-recipient", exact: true })
    .click();
  await page.getByText("Linked", { exact: true }).waitFor();
  await page.goto(
    origin +
      "/manage/media/provisioning?service=seerr&instance=synthetic-server",
  );
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
  await page.getByText("Technical details", { exact: true }).click();
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
    .getByRole("heading", {
      name: "Account created · link separately",
      exact: true,
    })
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
  for (const [index, lostEffect, expectedState] of [
    [0, "/new", "Creation outcome uncertain"],
    [1, "/invite_code", "Invitation delivery uncertain"],
    [2, "/invite_code/verify", "Recipient verification uncertain"],
    [3, "/password", "Password setup uncertain"],
  ]) {
    const email = `uncertain-${index}@example.invalid`;
    await page.goto(origin + "/manage/people/new");
    await page
      .getByLabel("Username", { exact: true })
      .fill(`uncertain-${index}`);
    await page
      .getByLabel("Display name", { exact: true })
      .fill("Synthetic Uncertain Recipient");
    await page.getByLabel("Invitation recipient", { exact: true }).fill(email);
    await page
      .getByLabel("Reason", { exact: true })
      .fill("Synthetic response-loss regression");
    await page
      .getByRole("button", { name: "Review person", exact: true })
      .click();
    await page.getByText("Awaiting creation review", { exact: true }).waitFor();
    const uncertainReview = page.url();
    const csrf = await page.locator('main input[name="csrf"]').inputValue();
    if (lostEffect === "/new") fixture.lostIdentityResponses.add(lostEffect);
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Create identity", exact: true })
      .click();
    if (lostEffect !== "/new") {
      await page
        .getByText("Identity created; invitation not sent", { exact: true })
        .waitFor();
      if (lostEffect === "/invite_code")
        fixture.lostIdentityResponses.add(lostEffect);
      await page
        .getByLabel("Retype the exact invitation recipient")
        .fill(email);
      await page.getByRole("checkbox").check();
      await page
        .getByRole("button", { name: "Send invitation", exact: true })
        .click();
    }
    if (lostEffect === "/invite_code/verify" || lostEffect === "/password") {
      await page
        .getByText("Invitation requested; recipient setup pending", {
          exact: true,
        })
        .waitFor();
      const pendingContext = await browser.newContext({
        ignoreHTTPSErrors: true,
      });
      try {
        const pendingPage = await pendingContext.newPage();
        await pendingPage.goto(fixture.invitationLink);
        await pendingPage
          .locator('input[name="password"]')
          .fill("Synthetic-passphrase-42");
        await pendingPage
          .locator('input[name="confirmation"]')
          .fill("Synthetic-passphrase-42");
        fixture.lostIdentityResponses.add(lostEffect);
        await pendingPage
          .getByRole("button", { name: "Finish account setup", exact: true })
          .click();
        await pendingPage
          .getByRole("heading", {
            name: "Account setup needs review",
            exact: true,
          })
          .waitFor();
        assert(
          (await pendingPage.locator("main").innerText()).includes(
            "Do not repeat this invitation",
          ),
        );
        assert.equal(
          await pendingPage.getByText("Account ready", { exact: true }).count(),
          0,
        );
        const effectCount = fixture.recipientEffects.length;
        await pendingPage.goto(fixture.invitationLink);
        await pendingPage
          .locator('input[name="password"]')
          .fill("Synthetic-passphrase-42");
        await pendingPage
          .locator('input[name="confirmation"]')
          .fill("Synthetic-passphrase-42");
        await pendingPage
          .getByRole("button", { name: "Finish account setup", exact: true })
          .click();
        await pendingPage
          .getByText(
            "Invitation is unavailable or already used; request administrator review.",
            { exact: true },
          )
          .waitFor();
        assert.equal(fixture.recipientEffects.length, effectCount);
      } finally {
        await pendingContext.close();
      }
      await page.goto(uncertainReview);
    }
    await page.getByText(expectedState, { exact: true }).waitFor();
    assert(
      (await page.locator("main").innerText()).includes(
        "Do not repeat this operation",
      ),
    );
    assert(
      !(await page.locator("main").innerText()).includes("Please try again"),
    );
    assert.equal(page.url(), uncertainReview);
    const effectsBeforeReplay = [
      fixture.identityWrites,
      fixture.recipientEffects.length,
    ];
    const replay = await context.request.post(
      uncertainReview + (lostEffect === "/new" ? "/create" : "/invite"),
      {
        headers: { origin },
        form: { csrf, confirmed: "yes", recipient: email },
      },
    );
    assert.equal(replay.status(), 409);
    assert.deepEqual(
      [fixture.identityWrites, fixture.recipientEffects.length],
      effectsBeforeReplay,
    );
  }
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
