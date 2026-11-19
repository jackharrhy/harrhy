// The owner-local pane shows URL rows and disables an expiring link without refreshing.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@p2/app/v1";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { Views } from "../../plugins/views/contract.ts";
import { Browser, browserTests } from "./browser.ts";
import { holdIn, startFixture } from "./helpers.ts";

test("Previews is a private URL list on desktop and phone", { skip: !browserTests }, async (t) => {
	const fixture = await startFixture({ web: true });
	t.after(() => fixture.close());
	const owner = fixture.browser();
	const sessions = await holdIn(owner, Sessions, {}, "owner");
	const { id: session } = await sessions.create({ cwd: fixture.workspace }, BACKGROUND_CONTEXT);
	const views = await holdIn(owner, Views, { session }, "editor");
	const browser = await Browser.start();
	t.after(() => browser.close());
	await browser.signIn(fixture.owner);
	const config = join(fixture.dataDir, "work-context.json");
	const permanent = { id: "stable", name: "Stable", url: "https://stable.preview.example/", nonExpiring: true };
	writeFileSync(config, JSON.stringify({ previews: [permanent] }));
	await browser.metrics(1440, 1000);
	await browser.open(`http://127.0.0.1:${fixture.server.port}/s/${session}`);
	await browser.click(".views-toggle");
	await browser.wait(`document.querySelector('.views-add')`);
	await browser.evaluate(
		`Array.from(document.querySelectorAll('.views-add button')).find(b=>b.textContent==='Previews').click()`,
	);
	await browser.wait(`document.querySelector('.registered-preview a')`);
	assert.equal(await browser.evaluate(`document.querySelector('.registered-preview a').rel`), "noopener noreferrer");
	assert.equal(await browser.evaluate(`document.querySelector('[data-owner-view] [data-view-pane]')`), null);
	assert.deepEqual(views.views.value, []);
	await browser.metrics(390, 844);
	await browser.wait(`document.querySelector('.registered-previews')?.clientWidth > 0`);
	const expiring = { id: "lease", name: "Lease", url: "https://lease.preview.example/", expiresAt: Date.now() + 2500 };
	writeFileSync(config, JSON.stringify({ previews: [permanent, expiring] }));
	await browser.click('[aria-label="Refresh previews"]');
	await browser.wait(`document.querySelector('.registered-preview a[href="https://lease.preview.example/"]')`);
	await browser.wait(
		`!document.querySelector('.registered-preview a[href="https://lease.preview.example/"]') && document.querySelector('.registered-previews').textContent.includes('Expired')`,
	);
	assert.equal(await browser.evaluate(`fetch('/owner/logout-all',{method:'POST'}).then(r=>r.status)`), 200);
	await browser.wait(
		`!document.querySelector('.registered-previews') && !document.body.textContent.includes('stable.preview.example')`,
	);
});
