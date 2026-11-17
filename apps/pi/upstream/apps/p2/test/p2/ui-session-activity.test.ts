// Activity is an incidental tooltip: native row appearance, accessible disclosure and unchanged navigation.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@p2/app/v1";
import { Chat } from "../../plugins/chat/contract.ts";
import { SessionActivity } from "../../plugins/sessions/activity-contract.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { Browser, browserTests } from "./browser.ts";
import { holdIn, startFixture, until } from "./helpers.ts";

test(
	"session activity keeps native row styling and navigation with hover, focus and touch disclosure",
	{ skip: !browserTests, timeout: 120_000 },
	async (t) => {
		const fixture = await startFixture({ web: true });
		t.after(() => fixture.close());
		const owner = fixture.browser();
		const sessions = await holdIn(owner, Sessions, {}, "owner");
		const session = await sessions.create({ cwd: fixture.workspace, title: "Stable name" }, BACKGROUND_CONTEXT);
		const other = await sessions.create({ cwd: fixture.workspace, title: "Other" }, BACKGROUND_CONTEXT);
		const chat = await holdIn(owner, Chat, { session: session.id, conversation: 1 }, "participant");
		const activity = await holdIn(owner, SessionActivity, {}, "owner");
		await chat.send({ text: "set-activity Reviewing activity", requestId: "activity" }, BACKGROUND_CONTEXT);
		await until(activity.activities, (all) => all?.[session.id] === "Reviewing activity");
		await chat.send({ text: "subagent", requestId: "child" }, BACKGROUND_CONTEXT);
		const browser = await Browser.start();
		t.after(() => browser.close());
		await browser.signIn(fixture.owner);
		await browser.call("Emulation.setFocusEmulationEnabled", { enabled: true });
		await browser.metrics(1280, 900);
		const url = `http://127.0.0.1:${fixture.server.port}`;
		await browser.open(`${url}/s/${other.id}`);
		const row = `.sidebar-section[data-key=recent] [data-session="${session.id}"]`;
		const name = `${row} .session-title`;
		const link = `${row} .session-main`;
		const popup = ".session-activity-popover:popover-open";
		await browser.wait(`document.querySelector(${JSON.stringify(link)})?.hasAttribute('aria-describedby')`);
		await browser.wait(`document.querySelector(${JSON.stringify(`${row} .subagent-toggle`)})`);
		assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(popup)}) !== null`), false);
		assert.equal(
			await browser.evaluate(`document.querySelector(${JSON.stringify(name)}).textContent`),
			"Stable name",
		);
		// A wrapper, even display:contents, breaks the sidebar's direct-child resets and restores Elanor's gray/padding.
		assert.equal(
			await browser.evaluate(`document.querySelector(${JSON.stringify(link)}).parentElement.matches('.nav-row')`),
			true,
		);
		const styles = await browser.evaluate<string[]>(
			`[${JSON.stringify(link)},${JSON.stringify(`.sidebar-section[data-key=recent] [data-session="${other.id}"] .session-main`)}].map(selector=>{const s=getComputedStyle(document.querySelector(selector));return JSON.stringify([s.color,s.padding,s.gap,s.fontSize,s.lineHeight])})`,
		);
		assert.equal(styles[0], styles[1]);
		await browser.evaluate(`document.querySelector(${JSON.stringify(link)}).focus()`);
		await browser.wait(`document.querySelector(${JSON.stringify(popup)})?.textContent === 'Reviewing activity'`);
		assert.equal(
			await browser.evaluate(`document.querySelector(${JSON.stringify(popup)}).getAttribute('role')`),
			"tooltip",
		);
		assert.equal(
			await browser.evaluate(
				`document.querySelector(${JSON.stringify(popup)}).querySelector('a,button,input,[tabindex]') !== null`,
			),
			false,
		);
		assert.equal(
			await browser.evaluate(
				`document.querySelector(${JSON.stringify(link)}).getAttribute('aria-describedby') === document.querySelector(${JSON.stringify(popup)}).id`,
			),
			true,
		);
		await browser.call("Input.dispatchKeyEvent", {
			type: "keyDown",
			key: "Escape",
			code: "Escape",
			windowsVirtualKeyCode: 27,
		});
		await browser.wait(`!document.querySelector(${JSON.stringify(popup)})`);
		await browser.evaluate(
			`document.querySelector(${JSON.stringify(link)}).blur(); document.querySelector(${JSON.stringify(link)}).dispatchEvent(new MouseEvent('mouseover', {bubbles:true}))`,
		);
		await browser.wait(`document.querySelector(${JSON.stringify(popup)})`);
		const hoverPoints = await browser.evaluate<{
			anchor: { x: number; y: number };
			tooltip: { x: number; y: number };
		}>(
			`(()=>{const center=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}};return {anchor:center(${JSON.stringify(link)}),tooltip:center(${JSON.stringify(popup)})}})()`,
		);
		await browser.call("Input.dispatchMouseEvent", { type: "mouseMoved", ...hoverPoints.anchor });
		// Walk through the intervening pixels: jumping directly into the tooltip hides a hover-gap regression.
		const steps = Math.ceil(
			Math.hypot(hoverPoints.tooltip.x - hoverPoints.anchor.x, hoverPoints.tooltip.y - hoverPoints.anchor.y),
		);
		for (let step = 1; step <= steps; step++) {
			await browser.call("Input.dispatchMouseEvent", {
				type: "mouseMoved",
				x: hoverPoints.anchor.x + ((hoverPoints.tooltip.x - hoverPoints.anchor.x) * step) / steps,
				y: hoverPoints.anchor.y + ((hoverPoints.tooltip.y - hoverPoints.anchor.y) * step) / steps,
			});
		}
		await browser.wait(`document.querySelector(${JSON.stringify(popup)})?.matches(':hover')`);
		assert.notEqual(
			await browser.evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(popup)})).pointerEvents`),
			"none",
		);
		await browser.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1000, y: 450 });
		await browser.wait(`!document.querySelector(${JSON.stringify(popup)})`);
		await browser.click(link);
		await browser.wait(`location.pathname === '/s/${session.id}'`);
		await browser.metrics(390, 844);
		await browser.call("Emulation.setTouchEmulationEnabled", { enabled: true });
		await browser.open(`${url}/s/${other.id}`);
		await browser.click(".sidebar-open");
		await browser.wait(`document.querySelector(${JSON.stringify(link)})?.hasAttribute('aria-describedby')`);
		await browser.wait(`!document.querySelector('.drawer').getAnimations().some(a => a.playState === 'running')`);
		const point = await browser.evaluate<{ x: number; y: number }>(
			`(()=>{const r=document.querySelector(${JSON.stringify(name)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`,
		);
		await browser.call("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
		await browser.call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		await browser.wait(`location.pathname === '/s/${session.id}'`);
		await browser.wait(`document.querySelector(${JSON.stringify(popup)})`);
		await browser.clickPoint(380, 400);
		await browser.wait(`!document.querySelector(${JSON.stringify(popup)})`);
		assert.equal(sessions.sessions.value?.find((row) => row.id === session.id)?.title, "Stable name");
	},
);
