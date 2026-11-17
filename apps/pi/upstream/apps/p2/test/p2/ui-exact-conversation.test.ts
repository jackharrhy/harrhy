// Explicit conversation links keep their original transcript; short session links open the latest main.
import assert from "node:assert/strict";
import { it } from "node:test";
import { BACKGROUND_CONTEXT } from "@p2/app/v1";
import { Chat } from "../../plugins/chat/contract.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { SessionTree } from "../../plugins/tree/contract.ts";
import { Browser, browserTests } from "./browser.ts";
import { holdIn, startFixture, until } from "./helpers.ts";

it(
	"keeps explicit conversation one and retained branches exact across main switches and reloads",
	{ skip: !browserTests },
	async () => {
		const fixture = await startFixture({ web: true });
		let browser: Browser | undefined;
		try {
			const sessions = await holdIn(fixture.browser(), Sessions, {}, "owner");
			const session = await sessions.create(
				{ cwd: fixture.workspace, title: "Exact link fixture" },
				BACKGROUND_CONTEXT,
			);
			const send = async (conversation: number, text: string) => {
				const chat = await holdIn(fixture.browser(), Chat, { session: session.id, conversation }, "participant");
				try {
					await chat.send({ text, requestId: text }, BACKGROUND_CONTEXT);
					await until(chat.view, (view) => JSON.stringify(view?.entries ?? []).includes(`Echo: ${text}`));
				} finally {
					chat.release();
				}
			};
			await send(1, "original-conversation-only");
			const tree = await holdIn(fixture.browser(), SessionTree, { session: session.id }, "owner");
			const second = await tree.branch({ conversation: 1, label: "Second main" }, BACKGROUND_CONTEXT);
			await send(second.conversation, "second-conversation-only");
			browser = await Browser.start();
			await browser.signIn(fixture.owner);
			const base = `http://127.0.0.1:${fixture.server.port}/s/${session.id}`;
			await browser.open(base);
			await browser.wait(
				`location.pathname==='/s/${session.id}/c/${second.conversation}' && document.querySelector('.messages')?.textContent.includes('Echo: second-conversation-only')`,
			);
			await browser.open(`${base}/c/1`);
			await browser.wait(
				`location.pathname==='/s/${session.id}/c/1' && document.querySelector('.messages')?.textContent.includes('Echo: original-conversation-only')`,
			);
			assert.equal(
				await browser.evaluate<boolean>(
					`document.querySelector('.messages').textContent.includes('Echo: second-conversation-only')`,
				),
				false,
			);
			const third = await tree.branch(
				{ conversation: second.conversation, label: "Third main" },
				BACKGROUND_CONTEXT,
			);
			await send(third.conversation, "third-conversation-only");
			await browser.wait(
				`document.querySelector('.session-header .session-title')?.textContent.includes('Exact link fixture')`,
			);
			assert.equal(await browser.evaluate<string>("location.pathname"), `/s/${session.id}/c/1`);
			await browser.open(`${base}/c/1`);
			await browser.wait(
				`document.querySelector('.messages')?.textContent.includes('Echo: original-conversation-only')`,
			);
			assert.equal(await browser.evaluate<string>("location.pathname"), `/s/${session.id}/c/1`);
			await browser.open(`${base}/c/${second.conversation}`);
			await browser.wait(
				`location.pathname==='/s/${session.id}/c/${second.conversation}' && document.querySelector('.messages')?.textContent.includes('Echo: second-conversation-only')`,
			);
			assert.equal(
				await browser.evaluate<boolean>(
					`document.querySelector('.messages').textContent.includes('Echo: third-conversation-only')`,
				),
				false,
			);
			await browser.open(base);
			await browser.wait(
				`location.pathname==='/s/${session.id}/c/${third.conversation}' && document.querySelector('.messages')?.textContent.includes('Echo: third-conversation-only')`,
			);
			tree.release();
		} finally {
			await browser?.close();
			await fixture.close();
		}
	},
);
