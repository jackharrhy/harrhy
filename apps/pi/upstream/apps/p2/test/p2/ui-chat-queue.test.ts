// A long queue must not cover the conversation or make its last inputs unreachable.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { Browser, browserTests } from "./browser.ts";
import { type Fixture, startFixture } from "./helpers.ts";

describe("bounded chat queue", { skip: !browserTests }, () => {
	let fixture: Fixture;
	let browser: Browser;
	before(async () => {
		fixture = await startFixture({ web: true });
		browser = await Browser.start();
		await browser.signIn(fixture.owner);
	});
	after(async () => {
		await browser?.close();
		await fixture?.close();
	});

	for (const [width, height] of [
		[390, 844],
		[390, 480],
		[1280, 900],
	]) {
		it(`keeps transcript and controls usable at ${width}×${height}`, async () => {
			await browser.metrics(width!, height!);
			await browser.open(`http://127.0.0.1:${fixture.server.port}/`);
			await browser.wait("document.querySelector('.chat')");
			await browser.loadFixture("chat-queue.tsx");
			// The script fixture loader evaluates JS only; production serves the plugin's CSS bundle separately.
			const css = readFileSync(new URL("../../plugins/chat/queue.css", import.meta.url), "utf8");
			await browser.evaluate(
				`document.head.appendChild(Object.assign(document.createElement('style'), {textContent: ${JSON.stringify(css)}}))`,
			);
			await browser.wait("document.querySelector('.chat-queue summary')?.textContent === '19 queued'");
			assert.ok(
				await browser.evaluate<boolean>(`(() => {
				const queue = document.querySelector('.queued'), dock = document.querySelector('.dock').getBoundingClientRect();
				return queue.scrollHeight > queue.clientHeight && queue.clientHeight <= innerHeight * .21 && dock.top > innerHeight * .4 && dock.bottom <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth;
			})()`),
			);
			await browser.evaluate("document.querySelector('.queued').scrollTop = 100000");
			await browser.wait("document.querySelector('.queued').scrollTop > 0");
			assert.equal(await browser.evaluate<number>("document.querySelector('.transcript').scrollTop"), 0);
			await browser.evaluate("document.querySelector('.transcript').scrollTop = 200");
			await browser.wait("document.querySelector('.transcript').scrollTop === 200");
			await browser.click(".queued > div:last-child .queue-edit");
			await browser.wait("document.querySelector('textarea').value === 'Message 19'");
			await browser.click(".queued > div:last-child .queue-remove");
			await browser.wait("document.querySelector('summary').textContent === '17 queued'");
			await browser.click(".chat-queue summary");
			await browser.wait("!document.querySelector('.chat-queue').open");
			assert.equal(
				await browser.evaluate<number>("document.querySelector('.queued').getBoundingClientRect().height"),
				0,
			);
			await browser.click(".chat-queue summary");
			await browser.wait("document.querySelector('.chat-queue').open");
			assert.equal(await browser.evaluate<string>("document.querySelector('summary').textContent"), "17 queued");
			assert.equal(await browser.evaluate<string>("document.querySelector('textarea').value"), "Message 19");
		});
	}
});
