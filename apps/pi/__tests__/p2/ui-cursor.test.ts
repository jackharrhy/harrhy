import assert from "node:assert/strict";
import { cpSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { userPluginsDirectory } from "../../src/runtime/host-dirs.ts";
import { Browser, browserTests } from "./browser.ts";
import { APP, startFixture } from "./helpers.ts";

const KEY = "crsr_UITESTKEYnotarealsecret0123456789abcdef";

test("Settings › Cursor clears the write-only key and saves owner choices", { skip: !browserTests }, async (t) => {
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
	const openCursor = async () => {
		const browser = await Browser.start();
		t.after(() => browser.close());
		await browser.metrics(1280, 900);
		await browser.signIn(fixture.owner);
		await browser.open(`http://127.0.0.1:${fixture.server.port}/`);
		await browser.openSettings("Cursor");
		return browser;
	};
	const browser = await openCursor();
	const clickText = (text: string, page = browser) =>
		page.wait(`(() => {
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
	const select = (label: string) => `document.querySelector('select[aria-label="${label}"]')`;
	const choose = (label: string, value: string) =>
		browser.evaluate(`(() => {
			const select = ${select(label)};
			Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(value)});
			select.dispatchEvent(new Event('change', { bubbles: true }));
		})()`);
	const keyInput = `document.querySelector('input[aria-label="API key"]')`;
	const keyStored = `document.body.textContent.includes('A key is stored') && ${keyInput}?.value === ''`;
	await browser.wait(keyInput);
	await type("API key", KEY);
	assert.equal(await browser.evaluate(`${keyInput}.type`), "password");
	await clickText("Save key");
	await browser.wait(keyStored);
	assert.equal(await browser.evaluate(`document.body.innerHTML.includes(${JSON.stringify(KEY)})`), false, "the key is not on the page");
	await clickText("Test key");
	await browser.wait(`document.body.textContent.includes('The key works (named “ui-key”)')`);
	await clickText("Load models");
	const model = select("Default model");
	await browser.wait(`${model}?.querySelector('option[value="composer-2"]') && !${model}.disabled`);
	await choose("Default model", "composer-2");
	const total = select("Runs at once, all sessions");
	const perSession = select("Runs at once per session");
	await browser.wait(`${model}?.value === 'composer-2' && !${total}.disabled`);
	await choose("Runs at once, all sessions", "3");
	const capsSaved = `${total}?.value === '3' && ${perSession}?.value === '3'`;
	const sandbox = select("Sandbox local agents");
	await browser.wait(`${capsSaved} && !${sandbox}.disabled`);
	await choose("Sandbox local agents", "required");
	await clickText("Check sandbox");
	await browser.wait(`document.body.textContent.includes('Sandbox: supported')`);
	await type("Repository", "not a repo");
	await clickText("Allow");
	await browser.wait(`document.querySelector('[role=alert]')?.textContent.includes('owner/name')`);
	await type("Repository", "acme/*");
	await clickText("Allow");
	await browser.wait(`[...document.querySelectorAll('.guest-row span')].some((span) => span.textContent === 'acme/*')`);
	const reopened = await openCursor();
	await reopened.wait(keyStored);
	assert.equal(await reopened.evaluate(`document.body.innerHTML.includes(${JSON.stringify(KEY)})`), false, "the key is not rehydrated");
	await reopened.wait(`${model}?.value === 'composer-2' && ${capsSaved} && ${sandbox}?.value === 'required'`);
	await clickText("Remove", reopened);
	await reopened.wait(`document.body.textContent.includes('None yet')`);
});
