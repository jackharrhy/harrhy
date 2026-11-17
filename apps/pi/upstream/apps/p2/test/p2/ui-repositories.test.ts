// The selected B linked inspector: native sidebar parity, three projections, phone drill-in/back and private access.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@p2/app/v1";
import { Chat } from "../../plugins/chat/contract.ts";
import { LogNotices } from "../../plugins/logs/contract.ts";
import { Repositories } from "../../plugins/repositories/contract.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { Sharing } from "../../plugins/sharing/contract.ts";
import { Views } from "../../plugins/views/contract.ts";
import { Browser, browserTests } from "./browser.ts";
import { holdIn, startFixture, until } from "./helpers.ts";

const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], { stdio: "ignore" });

test(
	"Work context is the native private linked inspector, not a Git status browser",
	{ skip: !browserTests },
	async (t) => {
		const fixture = await startFixture({ web: true });
		t.after(() => fixture.close());
		const root = fixture.workspace;
		git(root, "init", "-b", "main");
		git(
			root,
			"-c",
			"user.name=Test",
			"-c",
			"user.email=test@example.invalid",
			"commit",
			"--allow-empty",
			"-m",
			"initial",
		);
		const linked = join(root, "../ui-worktree");
		const dormant = join(root, "../unoccupied-worktree");
		git(root, "worktree", "add", "-b", "ui-review", linked);
		git(root, "worktree", "add", "-b", "unoccupied", dormant);
		mkdirSync(join(linked, "apps"));
		const owner = fixture.browser();
		const sessions = await holdIn(owner, Sessions, {}, "owner");
		const session = (await sessions.create({ cwd: root, title: "Pi Handyman" }, BACKGROUND_CONTEXT)).id;
		const other = (await sessions.create({ cwd: root, title: "Pi Wonder" }, BACKGROUND_CONTEXT)).id;
		const ui = (await sessions.create({ cwd: linked, title: "HarrhyUI" }, BACKGROUND_CONTEXT)).id;
		writeFileSync(
			join(fixture.dataDir, "work-context.json"),
			JSON.stringify({
				previews: [
					{
						id: "ui",
						name: "Harrhy UI",
						url: "https://ui.preview.example/",
						session: ui,
						location: { env: null, cwd: join(linked, "apps") },
						access: "Private Tailnet",
						event: { kind: "updated", at: Date.now() - 6 * 60 * 60 * 1000 },
					},
					{
						id: "atlas",
						name: "Atlas",
						url: "https://atlas.preview.example/",
						session: other,
						nonExpiring: true,
						note: "Published release, not the authoring worktree",
					},
					{
						id: "old",
						name: "Expired review",
						url: "https://expired.preview.example/",
						expiresAt: Date.now() - 1000,
					},
					{ id: "unlinked", name: "Pi Wonder preview label", url: "https://unlinked.preview.example/" },
				],
			}),
		);
		const chat = await holdIn(owner, Chat, { session, conversation: 1 }, "participant");
		for (const [name, cwd] of [
			["Review root", root],
			["Review alias", join(root, "apps")],
		] as const) {
			mkdirSync(cwd, { recursive: true });
			await chat.send(
				{
					text: `subagent ${JSON.stringify({ action: "spawn", name, message: "hello child", cwd, tools: ["read"] })}`,
					requestId: name,
				},
				BACKGROUND_CONTEXT,
			);
		}
		const repositories = await holdIn(owner, Repositories, {}, "owner");
		await until(repositories.locations, (rows) => rows.filter((row) => row.session === session).length === 3);
		const views = await holdIn(owner, Views, { session }, "editor");
		const browser = await Browser.start();
		t.after(() => browser.close());
		await browser.signIn(fixture.owner);
		await browser.call("Page.addScriptToEvaluateOnNewDocument", {
			source: `(() => {
			const Native = WebSocket;
			const sockets = new Set();
			window.__offline = false;
			window.WebSocket = class extends Native {
				constructor(url, protocols) {
					super(window.__offline ? String(url).replace('/chord', '/offline') : url, protocols);
					sockets.add(this);
					this.addEventListener('close', () => sockets.delete(this));
				}
			};
			window.__goOffline = () => { window.__offline = true; for (const socket of sockets) socket.close(); };
		})()`,
		});
		await browser.metrics(1440, 1000);
		await browser.open(`http://127.0.0.1:${fixture.server.port}/s/${session}`);
		await browser.wait(`document.querySelector('.views-toggle')`);
		assert.equal(await browser.evaluate(`document.querySelector('[data-owner-view]') !== null`), false);
		const open = async () => {
			await browser.evaluate(
				`[...document.querySelectorAll('.views-tabs.phone .views-tab')].find(tab=>tab.textContent==='Chat')?.click()`,
			);
			await browser.click(".views-toggle");
			await browser.wait(`document.querySelector('.views-add')`);
			await browser.evaluate(
				`[...document.querySelectorAll('.views-add button')].find(button=>button.textContent==='Work context').click()`,
			);
			await browser.wait(`document.querySelector('.work-context')`);
		};
		const projection = async (title: string) => {
			await browser.evaluate(
				`[...document.querySelectorAll('.work-context-tabs button')].find(button=>button.textContent===${JSON.stringify(title)}).click()`,
			);
		};
		await open();
		await browser.wait(`document.querySelectorAll('.context-index [data-context-id]').length===3`);
		const layoutKey = `p2.views.layout:${session}`;
		const savedPlacement = await browser.evaluate(`localStorage.getItem(${JSON.stringify(layoutKey)})`);
		await browser.evaluate(`window.__goOffline()`);
		await browser.wait(`!document.querySelector('[data-owner-view]')`);
		assert.equal(await browser.evaluate(`localStorage.getItem(${JSON.stringify(layoutKey)})`), savedPlacement);
		await browser.evaluate(`window.__offline = false`);
		await browser.wait(`document.querySelector('.work-context')`);
		await browser.wait(`document.querySelectorAll('.context-index [data-context-id]').length===3`);
		await browser.wait(`document.querySelector('.context-inspector').textContent.includes('main')`);
		assert.deepEqual(views.views.value, []);
		assert.equal(
			await browser.evaluate(`document.querySelector('[data-owner-view]').hasAttribute('data-view-pane')`),
			false,
		);
		assert.equal(
			await browser.evaluate(`document.querySelector('.work-context').textContent.includes('tracked changes')`),
			false,
		);
		assert.equal(
			await browser.evaluate(`document.querySelector('.work-context').textContent.includes('HEAD:')`),
			false,
		);
		// Reuse, rather than approximate, the native sidebar row typography/padding and project glyph.
		const parity = await browser.evaluate<{ side: string[]; context: string[]; glyph: boolean }>(
			`(()=>{const side=document.querySelector('.drawer [data-session="${session}"]>.nav-row');const context=document.querySelector('.context-index [data-context-id="${session}"]>.nav-row');const style=e=>{const s=getComputedStyle(e);return ['fontSize','lineHeight','height','paddingTop','paddingInlineStart','color'].map(key=>s[key])};return {side:style(side),context:style(context),glyph:side.querySelector('.glyph-icon').innerHTML===context.querySelector('.glyph-icon').innerHTML}})()`,
		);
		assert.deepEqual(parity.context, parity.side);
		assert.equal(parity.glyph, true);
		assert.equal(await browser.evaluate(`document.querySelectorAll('.context-location-group').length`), 1);
		assert.equal(
			await browser.evaluate(
				`document.querySelector('.context-location-group [aria-expanded]').getAttribute('aria-expanded')`,
			),
			"false",
		);
		assert.equal(
			await browser.evaluate(
				`document.querySelector('.context-index time').title.startsWith('Session indexed activity')`,
			),
			true,
		);
		assert.equal(
			await browser.evaluate(`document.querySelector('.work-context').textContent.includes('Idle')`),
			false,
		);
		await browser.click(".context-location-group [aria-expanded]");
		assert.equal(await browser.evaluate(`document.querySelectorAll('.context-location-group li').length`), 3);
		assert.equal(
			await browser.evaluate(
				`document.querySelector('.context-location-group').textContent.includes('Review alias')`,
			),
			true,
		);
		await browser.click(".context-location-group [aria-expanded]");
		await chat.send({ text: 'bash {"command":"sleep 1"}', requestId: "context-working" }, BACKGROUND_CONTEXT);
		await browser.wait(`document.querySelector('.context-index [data-context-id="${session}"] .working-frame')`);
		await browser.wait(`!document.querySelector('.context-index [data-context-id="${session}"] .working-frame')`);
		await projection("Worktrees");
		await browser.wait(`document.querySelectorAll('.context-index [data-context-id]').length===3`);
		await browser.wait(`document.querySelector('.context-inspector').textContent.includes('Pi Wonder')`);
		assert.equal(
			await browser.evaluate(`document.querySelector('.context-index').textContent.includes('unoccupied')`),
			true,
		);
		await browser.evaluate(
			`[...document.querySelectorAll('.context-index .nav-link')].find(row=>row.textContent.includes('ui-review')).click()`,
		);
		await browser.wait(`document.querySelector('.context-inspector').textContent.includes('Harrhy UI')`);
		await projection("Previews");
		await browser.wait(`document.querySelectorAll('.context-index [data-context-id]').length===4`);
		assert.equal(
			await browser.evaluate(
				`document.querySelector('.context-index [data-context-id="declared:ui"] time').textContent`,
			),
			"6h",
		);
		assert.equal(
			await browser.evaluate(
				`document.querySelector('.context-index [data-context-id="declared:ui"] time').title.startsWith('Preview updated:')`,
			),
			true,
		);
		assert.equal(
			await browser.evaluate(
				`document.querySelector('.context-index [data-context-id="declared:atlas"] time') === null`,
			),
			true,
		);
		assert.equal(
			await browser.evaluate(`document.querySelector('.work-context').textContent.includes('Not checked')`),
			false,
		);
		assert.equal(
			await browser.evaluate(
				`document.querySelector('.work-context').textContent.includes('Preview metadata read')`,
			),
			false,
		);
		assert.equal(
			await browser.evaluate(`document.querySelector('.work-context').textContent.includes('Worktrees observed')`),
			false,
		);
		await browser.click('.context-index [data-context-id="declared:atlas"] .nav-link');
		await browser.wait(`document.querySelector('.context-inspector').textContent.includes('Published release')`);
		assert.equal(
			await browser.evaluate(
				`document.querySelector('.context-inspector').textContent.includes("Unknown served worktree")`,
			),
			true,
		);
		assert.equal(
			await browser.evaluate(`document.querySelector('.context-inspector a[target="_blank"]').href`),
			"https://atlas.preview.example/",
		);
		await browser.click('.context-index [data-context-id="declared:old"] .nav-link');
		assert.equal(
			await browser.evaluate(`document.querySelector('.context-inspector a[target="_blank"]') !== null`),
			false,
		);
		assert.equal(
			await browser.evaluate(`document.querySelector('.context-inspector').textContent.includes('Lease expired')`),
			true,
		);
		await browser.click('.context-index [data-context-id="declared:unlinked"] .nav-link');
		assert.equal(
			await browser.evaluate(
				`document.querySelector('.context-inspector').textContent.includes('Unknown session association')`,
			),
			true,
		);
		await browser.evaluate(
			`(()=>{const e=document.querySelector('.context-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'atlas');e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
		);
		await browser.wait(`document.querySelectorAll('.context-index [data-context-id]').length===1`);
		await browser.evaluate(
			`(()=>{const e=document.querySelector('.context-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
		);
		await projection("Sessions");
		// Private text is not a capture target, despite using ordinary native navigation components.
		await browser.click(".views-annotate-toggle");
		await browser.evaluate(
			`(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector('.context-title'));getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'));})()`,
		);
		assert.equal(await browser.evaluate(`document.querySelector('.views-chip') !== null`), false);
		assert.deepEqual(views.annotations.value, []);
		await browser.click(".views-annotate-toggle");
		await browser.evaluate(`getSelection().removeAllRanges()`);
		// Both diagnostics reproduce in the native chat alone; do not conceal any new feature error in visual proof.
		const notices = await holdIn(owner, LogNotices, {}, "owner");
		for (const notice of notices.notices.value) {
			assert.match(
				notice.message,
				/^(?:p2 worker: routine_failed: stale worker \{|Page error .*: ResizeObserver loop completed with undelivered notifications\.)$/s,
			);
			await notices.dismiss({ id: notice.id }, BACKGROUND_CONTEXT);
		}
		await browser.wait(`!document.querySelector('.owner-notice')`);

		for (const width of [1440, 768, 390]) {
			await browser.metrics(width, 1000);
			await browser.wait(`document.querySelector('.work-context')`);
			if (width === 390) {
				await browser.wait(`document.querySelector('.views-tabs.phone')`);
				await browser.click(`.context-index [data-context-id="${session}"] .nav-link`);
				await browser.wait(`getComputedStyle(document.querySelector('.context-inspector')).display!=='none'`);
				await browser.evaluate(`history.back()`);
				await browser.wait(`getComputedStyle(document.querySelector('.context-inspector')).display==='none'`);
				await browser.click(`.context-index [data-context-id="${session}"] .nav-link`);
				await browser.wait(`getComputedStyle(document.querySelector('.context-inspector')).display!=='none'`);
				await browser.click(".context-location-group .context-row-subtitle button");
				await browser.wait(
					`document.querySelector('.work-context-tabs [aria-pressed="true"]').textContent==='Worktrees'`,
				);
				await browser.evaluate(`history.back()`);
				await browser.wait(
					`document.querySelector('.work-context-tabs [aria-pressed="true"]').textContent==='Sessions'`,
				);
				await browser.click(".context-back");
				await browser.wait(`getComputedStyle(document.querySelector('.context-inspector')).display==='none'`);
				assert.equal(
					await browser.evaluate(`document.querySelector('.work-context-tabs [aria-pressed="true"]').textContent`),
					"Sessions",
				);
				await projection("Previews");
				await browser.click('.context-index [data-context-id="declared:ui"] .nav-link');
			}
			const shot = (await browser.call("Page.captureScreenshot", { format: "png" })) as { data: string };
			writeFileSync(`/tmp/pi-work-context-${width}.png`, Buffer.from(shot.data, "base64"));
			await projection("Previews");
			await browser.wait(`!document.querySelector('.work-context-head button').disabled`);
			const previewShot = (await browser.call("Page.captureScreenshot", { format: "png" })) as { data: string };
			writeFileSync(`/tmp/pi-work-context-previews-${width}.png`, Buffer.from(previewShot.data, "base64"));
			if (width !== 390) await projection("Sessions");
			assert.equal(
				await browser.evaluate(
					`document.querySelector('.work-context').scrollWidth>document.querySelector('.work-context').clientWidth`,
				),
				false,
			);
		}
		// A metadata change may supersede an in-flight scoped refresh; its registration refresh must not be lost.
		await projection("Worktrees");
		await browser.wait(`document.querySelectorAll('.context-index [data-context-id]').length===3`);
		const originalMetadata = readFileSync(join(fixture.dataDir, "work-context.json"), "utf8");
		git(root, "worktree", "add", "-b", "new-registration", join(root, "../new-registration"));
		writeFileSync(join(fixture.dataDir, "work-context.json"), JSON.stringify({ previews: [] }));
		await browser.wait(`!document.querySelector('.work-context-head button').disabled`);
		await browser.evaluate(`document.querySelector('.work-context-head button').click()`);
		await browser.wait(`document.querySelectorAll('.context-index [data-context-id]').length===4`);
		writeFileSync(join(fixture.dataDir, "work-context.json"), originalMetadata);
		await browser.wait(`!document.querySelector('.work-context-head button').disabled`);
		await browser.evaluate(`document.querySelector('.work-context-head button').click()`);
		await projection("Previews");
		await browser.wait(`document.querySelectorAll('.context-index [data-context-id]').length===4`);
		await browser.click('[aria-label="Hide Work context"]');
		await browser.wait(`!document.querySelector('[data-owner-view]')`);
		await open();
		await open();
		assert.equal(await browser.evaluate(`document.querySelectorAll('[data-owner-view]').length`), 1);
		await browser.open(`http://127.0.0.1:${fixture.server.port}/s/${other}`);
		await browser.wait(`document.querySelector('.views-toggle')`);
		assert.equal(await browser.evaluate(`document.querySelector('[data-owner-view]') !== null`), false);
		await browser.open(`http://127.0.0.1:${fixture.server.port}/s/${session}`);
		await browser.wait(`document.querySelector('.views-toggle')`);
		await open();
		await sessions.archive({ id: other }, BACKGROUND_CONTEXT);
		await projection("Worktrees");
		await browser.wait(
			`[...document.querySelectorAll('.context-index .nav-link')].some(row=>row.textContent.includes('main'))`,
		);
		await browser.evaluate(
			`[...document.querySelectorAll('.context-index .nav-link')].find(row=>row.textContent.includes('main')).click()`,
		);
		await browser.wait(
			`document.querySelector('.context-inspector [data-context-id="${other}"]')?.textContent.includes('Archived')`,
		);
		await browser.click(`.context-inspector [data-context-id="${other}"] .nav-link`);
		await browser.wait(`document.querySelector('.context-inspector').textContent.includes('Archived session')`);
		assert.equal(await browser.evaluate(`document.querySelector('.context-title').textContent.trim()`), "Pi Wonder");
		assert.ok(sessions.sessions.value.find((row) => row.id === other)?.archivedAt);
		assert.equal(
			await browser.evaluate(`document.querySelector('.context-inspector a.context-open') !== null`),
			false,
		);
		const sharing = await holdIn(owner, Sharing, { session }, "owner");
		for (const mode of ["view", "full"] as const) await sharing.link({ mode }, BACKGROUND_CONTEXT);
		const links = sharing.links.value;
		await browser.open(`http://127.0.0.1:${fixture.server.port}/s/${session}`);
		await browser.wait(`document.querySelector('.views-toggle')`);
		await open();
		assert.equal(
			await browser.evaluate(`fetch('/owner/logout-all',{method:'POST'}).then(response=>response.status)`),
			200,
		);
		await browser.wait(`!document.querySelector('[data-owner-view]')`);
		for (const link of links) {
			await browser.call("Network.clearBrowserCookies");
			assert.equal(
				await browser.evaluate(
					`fetch('/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:${JSON.stringify(link.token)},name:'Context guest'})}).then(response=>response.status)`,
				),
				200,
			);
			await browser.open(`http://127.0.0.1:${fixture.server.port}/s/${session}`);
			await browser.wait(`document.querySelector('.topbar')`);
			assert.equal(await browser.evaluate(`document.querySelector('[data-owner-view]') !== null`), false);
			assert.equal(await browser.evaluate(`document.querySelector('.views-toggle') !== null`), false);
			assert.equal(await browser.evaluate(`document.body.textContent.includes('atlas.preview.example')`), false);
		}
		assert.deepEqual(views.views.value, []);
	},
);
