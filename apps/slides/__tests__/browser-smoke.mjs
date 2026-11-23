import assert from "node:assert/strict";
import { chromium } from "playwright";

// Called only by the disposable native fixture. The two contexts do not share cookies.
export async function browserSmoke(base, ownerCookie, restart) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN,
    args: ["--disable-background-networking"],
  });
  try {
    const audience = await browser.newContext();
    const owner = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await owner.addCookies([
      {
        name: "__Host-slides_session",
        value: ownerCookie.split("=")[1],
        url: base.replace("http:", "https:") + "/",
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    for (const context of [audience, owner])
      await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === base
          ? route.continue()
          : route.abort(),
      );
    const viewer = await audience.newPage(),
      presenter = await owner.newPage();
    const frames = [];
    viewer.on("websocket", (socket) =>
      socket.on("framereceived", ({ payload }) => frames.push(String(payload))),
    );
    // Drop only the viewer socket; preserve the page and its acknowledged cursor.
    await viewer.addInitScript(() => {
      const Native = WebSocket;
      window.WebSocket = class extends Native {
        constructor(url, protocols) {
          super(
            window.blockViewer && new URL(url).pathname === "/watch"
              ? new URL("/offline", url)
              : url,
            protocols,
          );
          window.disconnectViewer = () => this.close();
        }
      };
    });
    let allowPoll = false;
    await viewer.route("**/position", (route) =>
      allowPoll ? route.continue() : route.abort(),
    );
    await Promise.all([viewer.goto(base), presenter.goto(base)]);
    await presenter.getByRole("button", { name: "Open clicker" }).click();
    await presenter.getByRole("button", { name: "Next slide" }).click();
    await viewer.locator('[data-slide-id="text"]:visible').waitFor();
    assert.ok(
      frames.some((f) => f.includes('"snapshot"')),
      "clicker delivered via shared watch, polling blocked",
    );
    // Process restart with the browser still open. The same durable cursor
    // resumes without returning another snapshot or reloading the document.
    const same = viewer.waitForEvent("websocket").then((ws) =>
      ws.waitForEvent("framereceived", {
        predicate: (f) => String(f.payload).includes('"same"'),
        timeout: 10000,
      }),
    );
    await restart();
    await same;
    allowPoll = true;
    await viewer.evaluate(() => {
      window.blockViewer = true;
      window.disconnectViewer();
    });
    await presenter.getByRole("button", { name: "Previous slide" }).click();
    await viewer.locator('[data-slide-id="cover"]:visible').waitFor();
    await viewer.evaluate(() => {
      window.blockViewer = false;
    });
    allowPoll = false;
    await presenter.getByRole("button", { name: "Next slide" }).click();
    await viewer.locator('[data-slide-id="text"]:visible').waitFor();
    await presenter.getByRole("button", { name: "Close", exact: true }).click();
    await presenter.getByRole("link", { name: "Edit deck" }).click();
    await presenter.getByLabel("Slide", { exact: true }).selectOption("text");
    await presenter.getByRole("button", { name: "Open slide" }).click();
    await presenter
      .getByLabel("Title", { exact: true })
      .fill("Browser-authored title");
    await presenter
      .getByLabel("Body", { exact: true })
      .fill("Draft from mobile editor");
    await presenter
      .getByRole("button", { name: "Save slide to draft" })
      .click();
    await presenter
      .getByRole("heading", { name: /Browser-authored title/ })
      .waitFor();
    await presenter.reload();
    assert.equal(
      await presenter.getByLabel("Body", { exact: true }).inputValue(),
      "Draft from mobile editor",
    );
    assert.equal(
      await viewer
        .getByRole("heading", { name: "Browser-authored title" })
        .count(),
      0,
    );
    await presenter
      .getByRole("button", { name: "Publish saved draft" })
      .click();
    await viewer
      .getByRole("heading", { name: "Browser-authored title" })
      .waitFor();
    assert.equal(
      await viewer.getByRole("link", { name: "Edit deck" }).count(),
      0,
    );
    console.log(
      "PASS: Chromium mobile editor save/reopen/publish and independent viewer: watch snapshot, restart/resume, HTTP fallback, reconnect and publish",
    );
  } finally {
    await browser.close();
  }
}
