import { test } from "node:test";
import { Browser, browserTests } from "./browser.ts";
import { startFixture } from "./helpers.ts";

test("the owner allows and removes repositories in Settings › GitHub", { skip: !browserTests }, async (t) => {
	const fixture = await startFixture({ web: true, integrations: ["github-checks"] });
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
	await clickText("GitHub");
	const input = `document.querySelector('input[aria-label="Repository"]')`;
	await browser.wait(input);
	await browser.wait(`document.body.textContent.includes('None yet')`);
	const type = (value: string) =>
		browser.evaluate(`(() => {
			const input = ${input};
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
			input.dispatchEvent(new Event('input', { bubbles: true }));
		})()`);
	await type("not a repo");
	await clickText("Allow");
	await browser.wait(`document.querySelector('[role=alert]')?.textContent.includes('owner/name')`);
	await type("acme/site");
	await clickText("Allow");
	await browser.wait(`[...document.querySelectorAll('.guest-row span')].some((span) => span.textContent === 'acme/site') && ${input}?.value === ''`);
	await clickText("Remove");
	await browser.wait(`document.body.textContent.includes('None yet')`);
});
