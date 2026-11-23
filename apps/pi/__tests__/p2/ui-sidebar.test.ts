import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@p2/app/v1";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { Browser, browserTests } from "./browser.ts";
import { holdIn, startFixture } from "./helpers.ts";

test("offers only a location on the new-session screen and opens a session from the sidebar", { skip: !browserTests }, async (t) => {
	const fixture = await startFixture({ web: true });
	t.after(() => fixture.close());
	const browser = await Browser.start();
	t.after(() => browser.close());
	const host = fixture.browser();
	const sessions = await holdIn(host, Sessions, {}, "owner");
	const path = join(fixture.workspace, "sidebar-folder");
	mkdirSync(path);
	const created = await sessions.create({ title: "Sidebar fixture session", cwd: path }, BACKGROUND_CONTEXT);
	await browser.metrics(1280, 900);
	await browser.signIn(fixture.owner);
	await browser.open(`http://127.0.0.1:${fixture.server.port}/new`);
	await browser.wait(`document.querySelector(".cwd-pick span")?.textContent.endsWith("/sidebar-folder")`);
	assert.equal(await browser.evaluate(`document.querySelector(".project-pick") === null`), true);
	const row = `.sidebar-section.headless a.session-main[href="/s/${created.id}"]`;
	await browser.wait(`document.querySelector(${JSON.stringify(row)})?.textContent.includes("Sidebar fixture session")`);
	await browser.click(row);
	await browser.wait(`location.pathname === "/s/${created.id}" && document.querySelector(".session-header .session-title")?.textContent.includes("Sidebar fixture session")`);
});
