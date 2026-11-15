import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { createServer as httpsServer } from "node:https";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createAccessStore } from "../src/access-store.mjs";

// Explicit opt-in: only the pinned local-real provider, never runtime/production settings.
process.umask(0o077);
const state = new URL("../.local-real/", import.meta.url);
const receipt = new URL("invitation-browser.json", state);
if (existsSync(receipt))
  throw new Error(
    "Browser receipt exists; inspect its effects before another synthetic run.",
  );
const read = (name) => JSON.parse(readFileSync(new URL(name, state), "utf8"));
const seed = read("seed.json");
const config = read("auth.env.json");
assert.equal(config.ZITADEL_API_URL, "http://localhost:18887");
assert.equal(config.ORGANIZATION_ID, seed.steps.organization.id);
const operator = readFileSync(
  new URL("bootstrap/operator.pat", state),
  "utf8",
).trim();
const record = { phase: "prepared", steps: [] };
const save = () =>
  writeFileSync(receipt, JSON.stringify(record, null, 2) + "\n", {
    mode: 0o600,
  });
const step = async (name, effect) => {
  record.phase = `applying:${name}`;
  save();
  const result = await effect();
  record.steps.push(name);
  record.phase = "pending";
  save();
  return result;
};
async function api(path, body) {
  const response = await fetch(new URL(path, "http://localhost:18887"), {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${operator}`,
      "content-type": "application/json",
      "x-zitadel-orgid": config.ORGANIZATION_ID,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200, `Local native ${path} status`);
  return response.json();
}
const project = `harrhy-auth-real-${createHash("sha256").update(fileURLToPath(state).replace(/\/$/, "")).digest("hex").slice(0, 8)}`;
const providerContainer = `${project}-postgres-1`;
function capture(path) {
  return JSON.parse(
    execFileSync(
      "docker",
      [
        "exec",
        providerContainer,
        "wget",
        "-T",
        "3",
        "-qO-",
        `http://127.0.0.1:8025${path}`,
      ],
      { encoding: "utf8", timeout: 5000, maxBuffer: 1048576 },
    ),
  );
}
const existing = await api("/admin/v1/email/_search", {});
assert.equal(
  (existing.result || []).length,
  0,
  "Refuse to replace an existing local email provider",
);
save();
let message;
const captureName = `harrhy-auth-invitation-${randomBytes(6).toString("hex")}`;
const captureImage =
  "axllent/mailpit:v1.30.4@sha256:5a49a77c5bdbe7c5474450b4f46348d09949df3695257729c93a30369382d4f6";
const backend = createServer();
await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
const port = backend.address().port;
await new Promise((resolve) => backend.close(resolve));
for (const name of ["invitation-browser.key", "invitation-browser.crt"])
  assert(
    !existsSync(new URL(name, state)),
    "Refuse to replace prior TLS evidence",
  );
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
    "-keyout",
    new URL("invitation-browser.key", state).pathname,
    "-out",
    new URL("invitation-browser.crt", state).pathname,
  ],
  { stdio: "ignore" },
);
const proxy = httpsServer(
  {
    key: readFileSync(new URL("invitation-browser.key", state)),
    cert: readFileSync(new URL("invitation-browser.crt", state)),
  },
  (incoming, outgoing) => {
    const upstream = request(
      {
        hostname: "127.0.0.1",
        port,
        path: incoming.url,
        method: incoming.method,
        headers: incoming.headers,
      },
      (reply) => {
        outgoing.writeHead(reply.statusCode, reply.headers);
        reply.pipe(outgoing);
      },
    );
    upstream.on("error", () => {
      outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.pipe(upstream);
  },
);
let child, browser;
try {
  execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "-d",
      "--name",
      captureName,
      "--network",
      `container:${providerContainer}`,
      captureImage,
    ],
    { stdio: "pipe" },
  );
  record.captureName = captureName;
  save();
  const provider = await step("configure-isolated-smtp", () =>
    api("/admin/v1/email/smtp", {
      senderAddress: "auth@example.invalid",
      senderName: "Local Auth",
      host: "127.0.0.1:1025",
      tls: false,
      none: {},
      description: "Synthetic local invitation browser capture",
    }),
  );
  assert(provider.id);
  record.smtpId = provider.id;
  save();
  await step("activate-isolated-smtp", () =>
    api(`/admin/v1/email/${provider.id}/_activate`, {}),
  );
  await step("native-smtp-transport-preflight", () =>
    api(`/admin/v1/smtp/${provider.id}/_test`, {
      receiverAddress: "transport-check@example.invalid",
    }),
  );
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const origin = `https://127.0.0.1:${proxy.address().port}`;
  record.origin = origin;
  save();
  const database = new URL("invitation-browser.sqlite", state).pathname;
  assert(!existsSync(database));
  const store = createAccessStore({
    filename: database,
    applications: read("applications.json"),
    services: read("services.json"),
    native: {},
  });
  store.bootstrap({ administrator: seed.steps.user.userId, grants: [] });
  store.close();
  child = spawn(process.execPath, ["src/server.mjs"], {
    cwd: new URL("../", import.meta.url),
    env: {
      ...config,
      PATH: process.env.PATH,
      PORT: String(port),
      PUBLIC_ORIGIN: origin,
      ACCESS_DB_FILE: database,
      AUTH_PROVISIONING_TOKEN_FILE: new URL("management-token.json", state)
        .pathname,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      output = (output + chunk).slice(-100000);
    });
  for (let i = 0; ; i++) {
    if (child.exitCode !== null)
      throw new Error("Isolated Auth exited before readiness");
    try {
      if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break;
    } catch {}
    if (i === 100) throw new Error("Isolated Auth readiness timeout");
    await delay(100);
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto(origin + "/login");
  await page.getByLabel("Username or email").fill("local-artbin");
  await page.getByLabel("Password", { exact: true }).fill(seed.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(origin + "/");
  await page.goto(origin + "/manage/people/new");
  const username = `browser-${randomBytes(6).toString("hex")}`;
  const email = `${username}@example.invalid`;
  record.username = username;
  save();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("Display name", { exact: true })
    .fill("Synthetic Browser Recipient");
  await page.getByLabel("Invitation recipient", { exact: true }).fill(email);
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Isolated native HTTPS SMTP recipient validation");
  await page
    .getByRole("button", { name: "Review person", exact: true })
    .click();
  await page.getByText("Awaiting creation review", { exact: true }).waitFor();
  assert(
    !capture("/api/v1/messages").messages?.some((item) =>
      item.To?.some((recipient) => recipient.Address === email),
    ),
  );
  await page.getByRole("checkbox").check();
  await step("browser-create-identity", async () => {
    await page
      .getByRole("button", { name: "Create identity", exact: true })
      .click();
    await page
      .getByText("Identity created; invitation not sent", { exact: true })
      .waitFor();
  });
  assert(
    !capture("/api/v1/messages").messages?.some((item) =>
      item.To?.some((recipient) => recipient.Address === email),
    ),
  );
  await page.getByLabel("Retype the exact invitation recipient").fill(email);
  await page.getByRole("checkbox").check();
  const review = page.url();
  record.review = review;
  save();
  await step("browser-send-invitation", async () => {
    await page
      .getByRole("button", { name: "Send invitation", exact: true })
      .click();
    await page
      .getByText("Invitation requested; recipient setup pending", {
        exact: true,
      })
      .waitFor();
    for (let i = 0; !message; i++) {
      const listing = capture("/api/v1/messages");
      const match = listing.messages?.find((item) =>
        item.To?.some((recipient) => recipient.Address === email),
      );
      if (match) {
        const captured = capture("/api/v1/message/" + match.ID);
        writeFileSync(
          new URL("invitation-browser-message.json", state),
          JSON.stringify(captured),
          { mode: 0o600 },
        );
        message = captured.HTML;
        assert(captured.To.some((recipient) => recipient.Address === email));
      }
      if (i === 600) throw new Error("Native SMTP delivery timeout");
      if (!message) await delay(100);
    }
  });
  const decoded = message.replace(/&amp;/g, "&");
  const link = decoded.match(
    /href="(https:\/\/127\.0\.0\.1:\d+\/invitation\?[^"<>]+)"/,
  )?.[1];
  assert(link, "SMTP contains the HTTPS recipient proof link");
  assert.equal(new URL(link).origin, origin);
  assert.equal(new URL(link).searchParams.get("orgID"), config.ORGANIZATION_ID);
  assert(new URL(link).searchParams.get("code"));
  record.subject = new URL(link).searchParams.get("userID");
  save();
  const recipientContext = await browser.newContext({
    ignoreHTTPSErrors: true,
  });
  const recipient = await recipientContext.newPage();
  const referrers = [];
  recipient.on("request", (request) =>
    referrers.push(request.headers().referer || ""),
  );
  await recipient.goto(link);
  await recipient.waitForURL(origin + "/invitation");
  const password = `Local-browser-${randomBytes(22).toString("base64url")}!7a`;
  await recipient.locator('input[name="password"]').fill(password);
  await recipient.locator('input[name="confirmation"]').fill(password);
  await step("browser-recipient-password", async () => {
    await recipient
      .getByRole("button", { name: "Finish account setup", exact: true })
      .click();
    await recipient.getByText("Account ready", { exact: true }).waitFor();
  });
  await page.goto(review);
  await page.getByText("Recipient password set", { exact: true }).waitFor();
  await recipient.goto(origin + "/login");
  await recipient.getByLabel("Username or email").fill(username);
  await recipient.getByLabel("Password", { exact: true }).fill(password);
  await recipient.getByRole("button", { name: "Sign in", exact: true }).click();
  await recipient.waitForURL(origin + "/");
  const grants = await api("/management/v1/users/grants/_search", {
    queries: [{ userIdQuery: { userId: record.subject } }],
  });
  assert.equal((grants.result || []).length, 0);
  assert(!output.includes(password));
  assert(!output.includes(new URL(link).searchParams.get("code")));
  assert(referrers.every((value) => !value.includes("code=")));
  record.steps.push("normal-native-sign-in-no-grants-no-proof-logs");
  const cleanup = await fetch(
    `http://localhost:18887/admin/v1/email/${record.smtpId}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${operator}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  assert.equal(
    cleanup.status,
    200,
    "Remove only this synthetic SMTP configuration",
  );
  record.smtpRemoved = true;
  unlinkSync(new URL("invitation-browser-message.json", state));
  record.phase = "complete";
  save();
  console.log(
    "PASS isolated ZITADEL HTTPS browser creation → native SMTP capture → recipient proof/password → normal sign-in; no service grants",
  );
} catch (error) {
  record.failure = `Failed at ${record.phase} (${error.name})`;
  save();
  throw new Error(record.failure);
} finally {
  await browser?.close();
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
  await new Promise((resolve) => proxy.close(resolve));
  try {
    execFileSync("docker", ["stop", captureName], { stdio: "pipe" });
  } catch {}
}
