import assert from "node:assert/strict";
import { cpSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { userPluginsDirectory } from "../../src/runtime/host-dirs.ts";
import { Browser, browserTests } from "./browser.ts";
import { APP, startFixture } from "./helpers.ts";

const KEY = "crsr_UITESTKEYnotarealsecret0123456789abcdef";

test("the owner sets the key (write-only), the defaults and the allowed repositories in Settings › Cursor", { skip: !browserTests }, async (t) => {
	(globalThis as { __cursorFake?: unknown }).__cursorFake = {
		me: async () => ({ apiKeyName: "ui-key" }),
		models: async () => [{ id: "composer-2", displayName: "Composer 2" }],
		create: async () => ({
			agentId: "probe",
			close() {},
			send: async () => ({ wait: async () => ({ status: "finished" }), cancel: async () => {} }),
		}),
	};
	t.after(() => delete (globalThis as { __cursorFake?: unknown }).__cursorFake);
	const fixture = await startFixture({
		web: true,
		integrations: ["cursor"],
		prepare: (dataDir) =>
			cpSync(join(APP, "__tests__/fixtures/fake-cursor-sdk"), join(userPluginsDirectory(dataDir), "cursor", "node_modules", "@cursor", "sdk"), {
				recursive: true,
			}),
	});
	t.after(() => fixture.close());
	const browser = await Browser.start();
	t.after(() => browser.close());
	await browser.metrics(1280, 900);
	await browser.signIn(fixture.owner);
	await browser.open(`http://127.0.0.1:${fixture.server.port}/`);
	await browser.click(".settings-open");
	const clickText = (text: string) =>
		browser.wait(`(() => {
			const target = [...document.querySelectorAll('button:not(:disabled), a')].find((b) => b.textContent.trim() === ${JSON.stringify(text)});
			if (!target) return false;
			target.click();
			return true;
		})()`);
	const type = (label: string, value: string) =>
		browser.evaluate(`(() => {
			const input = document.querySelector('input[aria-label="${label}"]');
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
			input.dispatchEvent(new Event('input', { bubbles: true }));
		})()`);
	await clickText("Cursor");
	await browser.wait(`document.body.textContent.includes('No key yet')`);
	await type("API key", KEY);
	assert.equal(await browser.evaluate(`document.querySelector('input[aria-label="API key"]').type`), "password");
	await clickText("Save key");
	await browser.wait(`document.body.textContent.includes('A key is stored')`);
	assert.equal(await browser.evaluate(`document.querySelector('input[aria-label="API key"]').value`), "");
	assert.equal(await browser.evaluate(`document.body.innerHTML.includes(${JSON.stringify(KEY)})`), false, "the key is not on the page");
	await clickText("Test key");
	await browser.wait(`document.body.textContent.includes('The key works (named “ui-key”)')`);
	await clickText("Load models");
	await browser.wait(`[...document.querySelectorAll('select[aria-label="Default model"] option')].some((o) => o.value === 'composer-2')`);
	await browser.evaluate(`(() => {
		const select = document.querySelector('select[aria-label="Default model"]');
		Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'composer-2');
		select.dispatchEvent(new Event('change', { bubbles: true }));
	})()`);
	await browser.wait(`document.querySelector('select[aria-label="Default model"]').value === 'composer-2'`);
	await browser.wait(`document.body.textContent.includes('Sandbox: not checked')`);
	await browser.wait(`document.body.textContent.includes('Detached workers: not observed yet')`);
	await browser.wait(`[...document.querySelectorAll('[role=switch]')].length === 3`);
	await browser.wait(`document.querySelector('select[aria-label="Runs at once per session"]').value === '4'`);
	await browser.evaluate(`(() => {
		const select = document.querySelector('select[aria-label="Runs at once, all sessions"]');
		Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '3');
		select.dispatchEvent(new Event('change', { bubbles: true }));
	})()`);
	await browser.wait(`document.querySelector('select[aria-label="Runs at once, all sessions"]').value === '3' && document.querySelector('select[aria-label="Runs at once per session"]').value === '3'`);
	await browser.wait(`document.body.textContent.includes('Auto-resume interrupted runs')`);
	await browser.evaluate(`(() => {
		const select = document.querySelector('select[aria-label="Sandbox local agents"]');
		Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'required');
		select.dispatchEvent(new Event('change', { bubbles: true }));
	})()`);
	await browser.wait(`document.querySelector('select[aria-label="Sandbox local agents"]').value === 'required'`);
	await clickText("Check sandbox");
	await browser.wait(`document.body.textContent.includes('Sandbox: supported')`);
	await type("Repository", "not a repo");
	await clickText("Allow");
	await browser.wait(`document.querySelector('[role=alert]')?.textContent.includes('owner/name')`);
	await type("Repository", "acme/*");
	await clickText("Allow");
	await browser.wait(`[...document.querySelectorAll('.guest-row span')].some((span) => span.textContent === 'acme/*')`);
	await browser.wait(`document.querySelector('[role=switch]')?.getAttribute('aria-checked') === 'false'`);
	await browser.wait(`document.body.textContent.includes('Allow local agents to edit files')`);
	await clickText("Remove");
	await browser.wait(`document.body.textContent.includes('None yet')`);
});
