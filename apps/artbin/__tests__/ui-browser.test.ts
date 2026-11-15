import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

let server: ChildProcess;
let browser: Browser;
let root: string;
let origin: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "artbin-ui-test-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !key.startsWith("AUTH_") &&
        !key.startsWith("ARTBIN_") &&
        key !== "VITEST",
    ),
  );
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const port = address.port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    ["--import", "remix/node-tsx", "server.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...env,
        NODE_ENV: "development",
        HOST: "127.0.0.1",
        PORT: String(port),
        ARTBIN_URL: origin,
        ARTBIN_DB_PATH: join(root, "data", "artbin.db"),
        ARTBIN_PUBLIC_DIR: join(root, "public"),
        ARTBIN_TEMP_DIR: join(root, "tmp"),
        ARTBIN_SUPPORT_LOGIN_ENABLED: "0",
      },
      stdio: "pipe",
    },
  );
  let output = "";
  server.stderr?.on("data", (chunk) => {
    output += String(chunk);
  });
  const deadline = Date.now() + 30_000;
  while (true) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {
      /* cold source compilation */
    }
    if (server.exitCode !== null || Date.now() > deadline)
      throw new Error(`UI server failed: ${output}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
}, 40_000);

afterAll(async () => {
  await browser?.close();
  if (server && server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await exited;
  }
  if (root) await rm(root, { recursive: true, force: true });
});

test("real uploads, shared dialog focus, local fonts and narrow layouts", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  try {
    await page.goto(`${origin}/folders`);
    const created = await page.evaluate(async () => {
      const response = await fetch("/api/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Synthetic study",
          slug: "synthetic-study",
          parentId: null,
        }),
      });
      return response.status;
    });
    expect(created).toBe(200);
    await page.goto(`${origin}/folder/synthetic-study`);
    await page.waitForFunction(
      () => document.documentElement.dataset.artbinReady === "true",
    );
    const upload = page.getByRole("button", { name: "Upload", exact: true });
    await upload.click();
    await page.getByRole("dialog").waitFor();
    for (let index = 0; index < 12; index++) {
      await page.keyboard.press("Tab");
      expect(
        await page
          .getByRole("dialog")
          // Chromium may focus browser chrome between the last and first control.
          .evaluate(
            (dialog) =>
              document.activeElement === document.body ||
              dialog.contains(document.activeElement),
          ),
      ).toBe(true);
    }
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    expect(
      await upload.evaluate((element) => element === document.activeElement),
    ).toBe(true);
    await upload.click();
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles({
        name: "preview.cfg",
        mimeType: "text/plain",
        buffer: Buffer.from("// Synthetic browser fixture\nbind SPACE +jump\n"),
      });
    await page.getByRole("button", { name: /^Upload 1 file/ }).click();
    await page
      .getByRole("dialog")
      .waitFor({ state: "detached", timeout: 30_000 });
    await page
      .getByRole("link", { name: /preview.cfg/ })
      .first()
      .click();
    await page
      .getByText("bind SPACE +jump", { exact: false })
      .first()
      .waitFor();
    await page.waitForFunction(() =>
      getComputedStyle(document.querySelector("pre")!).fontFamily.includes(
        "Plex Mono",
      ),
    );
    await page.evaluate(() => document.fonts.ready);
    const fonts = await page.evaluate(() => ({
      heading: getComputedStyle(document.querySelector("h1")!).fontFamily,
      code: getComputedStyle(document.querySelector("pre")!).fontFamily,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    expect(fonts.heading).toContain("Fraunces");
    expect(fonts.code).toContain("Plex Mono");
    expect(fonts.overflow).toBe(false);
    for (const width of [768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
    }
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 60_000);

test("folder forms retain native labels, select and POST without JavaScript", async () => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const created = await context.request.post(`${origin}/api/folder`, {
      headers: { Origin: origin },
      data: { name: "Native study", slug: "native-study", parentId: null },
    });
    expect(created.ok()).toBe(true);
    const page = await context.newPage();
    await page.goto(`${origin}/folder/native-study`);
    await page.getByText("Manage folder", { exact: true }).click();
    await page
      .getByLabel("Folder name", { exact: true })
      .fill("Renamed synthetic study");
    await page.getByRole("button", { name: "Rename", exact: true }).click();
    await page
      .getByRole("heading", { name: "Renamed synthetic study" })
      .waitFor();
    const renamedUrl = page.url();
    await page.getByText("Manage folder", { exact: true }).click();
    expect(
      await page
        .getByLabel("Parent folder")
        .evaluate((element) => element.tagName),
    ).toBe("SELECT");
    await page.getByLabel("Delete folder", { exact: true }).fill("wrong name");
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    expect(await page.locator("body").innerText()).toContain(
      "Folder name confirmation did not match",
    );
    await page.goto(renamedUrl);
    expect(
      await page
        .getByRole("heading", { name: "Renamed synthetic study" })
        .count(),
    ).toBe(1);
  } finally {
    await context.close();
  }
}, 30_000);
