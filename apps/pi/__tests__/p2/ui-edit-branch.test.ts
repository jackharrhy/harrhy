// Editing a past message forks a branch (the pencil under a user message): the composer gets its text, sending goes to
// the new branch and the original conversation keeps its later messages. Desktop and phone widths.
import assert from "node:assert/strict";
import { it } from "node:test";
import { BACKGROUND_CONTEXT } from "@p2/app/v1";
import { Chat } from "../../plugins/chat/contract.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { Browser, browserTests, composerText, setComposer } from "./browser.ts";
import { holdIn, startFixture, until } from "./helpers.ts";

for (const [name, width, height] of [
	["desktop", 1280, 800],
	["phone", 390, 800],
] as const) {
	it(`forks a branch when a past message is edited and resent (${name})`, { skip: !browserTests }, async () => {
		const fixture = await startFixture({ web: true });
		let browser: Browser | undefined;
		try {
			const sessions = await holdIn(fixture.browser(), Sessions, {}, "owner");
			const session = await sessions.create({ cwd: fixture.workspace, title: "Edit fixture" }, BACKGROUND_CONTEXT);
			const chat = await holdIn(fixture.browser(), Chat, { session: session.id, conversation: 1 }, "participant");
			for (const text of ["first-question", "second-question"]) {
				await chat.send({ text, requestId: text }, BACKGROUND_CONTEXT);
				await until(chat.view, (view) => JSON.stringify(view?.entries ?? []).includes(`Echo: ${text}`));
			}
			chat.release();
			const base = `http://127.0.0.1:${fixture.server.port}/s/${session.id}`;
			browser = await Browser.start();
			await browser.metrics(width, height);
			await browser.signIn(fixture.owner);
			await browser.open(`${base}/c/1`);
			await browser.wait(`document.querySelector('.messages')?.textContent.includes('Echo: second-question')`);
			assert.equal(await browser.evaluate<boolean>(`!document.querySelector('.tree-toggle')`), true);
			await browser.click(`.message-actions button[aria-label="Edit"]`);
			await browser.wait("location.pathname.includes('/c/') && !location.pathname.endsWith('/c/1')");
			await browser.wait(`${composerText}==='first-question'`);
			await browser.evaluate(setComposer("replacement"));
			await browser.click('button[aria-label="Send"]');
			await browser.wait(`document.querySelector('.messages')?.textContent.includes('Echo: replacement')`);
			assert.equal(
				await browser.evaluate<boolean>(`document.querySelector('.messages').textContent.includes('second-question')`),
				false,
			);
			await browser.open(`${base}/c/1`);
			await browser.wait(`document.querySelector('.messages')?.textContent.includes('Echo: second-question')`);
			assert.equal(
				await browser.evaluate<boolean>(`document.querySelector('.messages').textContent.includes('replacement')`),
				false,
			);
		} finally {
			await browser?.close();
			await fixture.close();
		}
	});
}
