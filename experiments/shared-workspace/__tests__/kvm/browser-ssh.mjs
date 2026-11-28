import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { chromium } from "playwright-core";
const file = "/workspace/checkout/index.html";
const edited = "<h1>SSH fixture edit</h1>\n";
const phase = process.argv[2];
if (phase === "verify") {
  assert.equal(readFileSync(file, "utf8"), edited);
  console.log("COLD_FILE_OK");
  process.exit(0);
}
writeFileSync(file, "<h1>synthetic checkout</h1>\n");
chmodSync(file, 0o666);
let marty = true;
const streams = new Map();
const app = createServer((req, res) => {
  const role = req.headers["x-fixture-user"];
  if (role !== "owner" && !(marty && role === "marty")) {
    res.writeHead(403).end();
    return;
  }
  if (req.url === "/") {
    res.setHeader("Content-Type", "text/html");
    res.end(readFileSync(file));
    return;
  }
  if (req.url !== "/chat" && req.url !== "/preview") {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  streams.set(role + req.url, res);
  res.write("data: ready\n\n");
  res.on("close", () => streams.delete(role + req.url));
});
function ssh(role) {
  const p = spawn(
    "ssh",
    [
      "-p",
      "18622",
      "-i",
      "/tmp/sshlab/" + role,
      "-o",
      "UserKnownHostsFile=/tmp/sshlab/known",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      "BatchMode=yes",
      "-o",
      "IdentitiesOnly=yes",
      role + "@127.0.0.1",
    ],
    { stdio: ["pipe", "pipe", "ignore"] },
  );
  const closed = once(p, "close");
  const lines = createInterface({ input: p.stdout })[Symbol.asyncIterator]();
  return {
    p,
    closed,
    async expect(s) {
      assert.equal((await lines.next()).value, s);
    },
  };
}
app.listen(0, "127.0.0.1");
await once(app, "listening");
const url = "http://127.0.0.1:" + app.address().port;
let browser;
const sessions = [];
try {
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const pages = {};
  for (const role of ["owner", "marty"]) {
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-fixture-user": role },
    });
    const page = (pages[role] = await context.newPage());
    await page.goto(url);
    assert.equal(await page.locator("h1").textContent(), "synthetic checkout");
  }
  const owner = ssh("owner"),
    guest = ssh("marty");
  sessions.push(owner, guest);
  await Promise.all([
    owner.expect("FIXTURE_READY"),
    guest.expect("FIXTURE_READY"),
  ]);
  guest.p.stdin.write("edit\n");
  await guest.expect("EDIT_OK");
  for (const page of Object.values(pages)) {
    await page.reload();
    assert.equal(await page.locator("h1").textContent(), "SSH fixture edit");
  }
  for (const page of Object.values(pages)) {
    await page.evaluate(() => {
      for (const channel of ["chat", "preview"]) {
        (async () => {
          const response = await fetch("/" + channel);
          const reader = response.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) {
              document.body.dataset[channel] = "closed";
              return;
            }
            document.body.dataset[channel] = new TextDecoder()
              .decode(value)
              .trim();
          }
        })();
      }
    });
    await page.waitForFunction(
      () =>
        document.body.dataset.chat === "data: ready" &&
        document.body.dataset.preview === "data: ready",
    );
  }
  assert.equal(streams.size, 4);
  marty = false;
  writeFileSync("/home/marty/.ssh/authorized_keys", "");
  const pid = Number(readFileSync("/home/marty/session.pid", "utf8"));
  assert.ok(Number.isSafeInteger(pid) && pid > 1);
  process.kill(pid, "SIGTERM");
  for (const [key, res] of streams) {
    if (key.startsWith("marty")) res.end();
    else res.write("data: owner continues\n\n");
  }
  await guest.closed;
  await pages.marty.waitForFunction(
    () =>
      document.body.dataset.chat === "closed" &&
      document.body.dataset.preview === "closed",
  );
  await pages.owner.waitForFunction(
    () =>
      document.body.dataset.chat === "data: owner continues" &&
      document.body.dataset.preview === "data: owner continues",
  );
  owner.p.stdin.write("ping\n");
  await owner.expect("FIXTURE_PONG");
  const denied = ssh("marty");
  sessions.push(denied);
  assert.equal((await denied.closed)[0], 255);
  for (const path of ["/", "/chat", "/preview"])
    assert.equal(
      await pages.marty.evaluate(
        async (endpoint) => (await fetch(endpoint)).status,
        path,
      ),
      403,
    );
  console.log("BROWSER_SSH_REVOKE_OK");
} finally {
  for (const { p } of sessions) p.kill();
  await browser?.close();
  app.closeAllConnections();
  app.close();
}
