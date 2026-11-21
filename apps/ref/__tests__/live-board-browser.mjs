import assert from "node:assert/strict";
import { checkInlineRename } from "./editor-browser.mjs";
import { chromium, expect } from "@playwright/test";
import { newWebSocketRpcSession } from "capnweb";

const marks = (page) => page.locator(".remote-cursors i");

async function checkLiveBoard(origin, enabled) {
  assert.equal(new URL(origin).hostname, "127.0.0.1");
  const browser = await chromium.launch();
  try {
    const login = async () => {
      const page = await (await browser.newContext()).newPage(); // Independent cookie jar and OAuth session.
      await page.goto(origin);
      await page.getByRole("link", { name: "Sign in" }).click();
      await page
        .getByRole("button", { name: "Continue as local user" })
        .click();
      await page.getByRole("heading", { name: "Boards" }).waitFor();
      return page;
    };
    const a = await login();
    const sockets = [];
    a.on("websocket", (ws) => sockets.push(new URL(ws.url()).pathname));
    // Drop the real editing connection; its reconnect should also start a fresh watch.
    await a.addInitScript(() => {
      window.WebSocket = class extends WebSocket {
        constructor(...args) {
          super(...args);
          if (this.url.endsWith("/live"))
            window.liveConnected = () => this.readyState === WebSocket.OPEN;
          if (this.url.endsWith("/ws")) window.dropEditor = () => this.close();
        }
      };
    });
    await a.locator("input[name=title]").fill("Cursor board");
    await a.getByRole("button", { name: "Create" }).click();
    await expect(a.locator("#connection")).toHaveClass(/online/);
    const url = a.url();
    if (!enabled) {
      assert.equal(
        await a.locator("#board-app").getAttribute("data-live-board"),
        null,
      );
      await checkInlineRename(a);
      assert.equal(
        (
          await a.request.get(
            `${origin}/api${new URL(url).pathname}/canvas/live`,
          )
        ).status(),
        404,
      );
      assert.ok(sockets.some((path) => path.endsWith("/ws")));
      assert.ok(!sockets.some((path) => path.endsWith("/live")));
      await expect(a.locator(".remote-cursors")).toHaveCount(0);
      return;
    }
    await a.locator(".remote-cursors").waitFor({ state: "attached" });
    await a.waitForFunction(() => window.liveConnected?.());
    let posts = 0;
    a.on("request", (req) => {
      if (req.url().endsWith("/rename")) posts++;
    });
    const field = a.getByRole("textbox", { name: "Board name" });
    await field.fill("  RPC title  ");
    await field.press("Tab");
    await expect(a).toHaveTitle("RPC title · ref");
    await expect(field).toHaveValue("RPC title");
    await field.fill(" ");
    await field.press("Enter");
    await expect(a.locator("#toast")).toContainText("Name not saved");
    await expect(field).toHaveValue("RPC title");
    assert.equal(posts, 0);
    const plainContext = await browser.newContext({
      javaScriptEnabled: false,
      storageState: await a.context().storageState(),
    });
    const plain = await plainContext.newPage();
    await plain.goto(url);
    const native = plain.getByRole("textbox", { name: "Board name" });
    await expect(native).toHaveValue("RPC title");
    await native.fill("  Native title  ");
    const fallback = plain.waitForResponse((r) => r.url().endsWith("/rename"));
    await native.press("Enter");
    assert.equal((await fallback).status(), 303);
    await expect(native).toHaveValue("Native title");
    await plainContext.close();
    const b = await login();
    const other = await b.request.post(`${origin}/boards`, {
      form: { title: "Separate cursor board" },
      maxRedirects: 0,
    });
    const third = await b.context().newPage();
    await third.goto(origin + other.headers().location);
    await third.locator(".remote-cursors").waitFor({ state: "attached" });
    await b.goto(url);
    await b.locator(".remote-cursors").waitFor({ state: "attached" });
    await a.mouse.move(140, 160);
    await expect(marks(b)).toHaveCount(1);
    await a.mouse.move(360, 180, { steps: 20 });
    await expect
      .poll(async () => Math.round((await marks(b).boundingBox())?.x))
      .toBe(360);
    await a.evaluate(() => window.dropEditor());
    await expect
      .poll(() => sockets.filter((p) => p.endsWith("/live")).length)
      .toBe(2);
    await expect(a.locator("#connection")).toHaveClass(/online/);
    await a.mouse.move(350, 190);
    await expect
      .poll(async () => Math.round((await marks(b).boundingBox())?.x))
      .toBe(350);
    await field.fill("After reconnect");
    await field.press("Enter");
    await expect(a).toHaveTitle("After reconnect · ref");
    await b.mouse.move(200, 200);
    await expect(marks(a)).toHaveCount(1);
    await expect(marks(third)).toHaveCount(0);
    await third.mouse.move(250, 170);
    await expect(marks(a)).toHaveCount(1);
    await expect(marks(b)).toHaveCount(1);
    await a.mouse.move(10, 10);
    await expect(marks(b)).toHaveCount(0);
    await expect(marks(a)).toHaveCount(0, { timeout: 9000 }); // B stopped moving.
    await b.mouse.move(210, 210);
    await expect(marks(a)).toHaveCount(1);
    await b.goto(origin);
    await expect(marks(a)).toHaveCount(0, { timeout: 9000 }); // Lost transport close can fall back to expiry.

    const endpoint = `${origin}/api${new URL(url).pathname}/canvas/live`;
    const cookie = (await b.context().cookies(origin)).find(
      (c) => c.name === "ref_session",
    );
    const headers = { Origin: origin, Cookie: `ref_session=${cookie.value}` };
    for (const h of [
      { Origin: origin },
      { ...headers, Origin: "https://foreign.example" },
    ]) {
      assert.equal((await fetch(endpoint, { headers: h })).status, 403);
    }
    assert.equal(
      (
        await fetch(
          endpoint.replace(
            new URL(url).pathname,
            `/boards/${crypto.randomUUID()}`,
          ),
          { headers },
        )
      ).status,
      403,
    );
    // A retained client ignores editing socket teardown and still must lose both rights.
    const ws = new WebSocket(endpoint.replace(/^http/, "ws"), { headers });
    const api = newWebSocketRpcSession(ws);
    const frames = [];
    const idle = new WebSocket(endpoint.replace(/^http/, "ws"), { headers });
    const reader = newWebSocketRpcSession(idle);
    const delivered = [];
    const deadline = AbortSignal.timeout(15000);
    deadline.addEventListener("abort", () => {
      ws.close();
      idle.close();
    });
    try {
      await api.start(
        crypto.randomUUID(),
        Number.MAX_SAFE_INTEGER,
        async (frame) => {
          frames.push(frame.kind);
          return frame.kind === "reset" ? null : frame.at;
        },
      );
      assert.deepEqual(frames, ["reset", "snapshot"]);
      await expect
        .poll(() => frames.includes("same"), { timeout: 6000 })
        .toBe(true);
      await api.move({ x: 11, y: 22 });
      await expect(marks(a)).toHaveCount(1);
      await reader.start(crypto.randomUUID(), null, async (frame) => {
        if (frame.kind === "snapshot") delivered.push(frame.items);
        return frame.at;
      });
      await b.request.post(`${origin}/logout`);
      const before = frames.length;
      await a.mouse.move(270, 270);
      await assert.rejects(async () => await api.rename("Revoked"));
      await assert.rejects(async () => await api.move({ x: 999, y: 999 }));
      await expect
        .poll(() => [ws.readyState, idle.readyState])
        .toEqual([WebSocket.CLOSED, WebSocket.CLOSED]);
      assert.ok(!delivered.flat().some((p) => p.x === 999 || p.y === 999));
      // No passive-reader snapshot with A’s new cursor after logout.
      assert.ok(
        delivered.every(
          (items) =>
            items.length <= 1 && items.every((p) => p.x === 11 && p.y === 22),
        ),
      );
      assert.equal(frames.length, before);
      const boardPage = await a.request.get(url);
      assert.ok((await boardPage.text()).includes("After reconnect"));
      await expect(marks(a)).toHaveCount(0);
      await expect(a.locator("#connection")).toHaveClass(/online/);
      assert.equal((await fetch(endpoint, { headers })).status, 403);
    } finally {
      ws.close();
      idle.close();
      api[Symbol.dispose]();
      reader[Symbol.dispose]();
    }
  } finally {
    await browser.close();
  }
}

const mode = process.argv[2];
assert.ok(
  mode === "on" || mode === "off",
  "Pass on or off for the running local fixture",
);
await checkLiveBoard("http://127.0.0.1:8787", mode === "on");
console.log(`Passed: live-board ${mode}`);
