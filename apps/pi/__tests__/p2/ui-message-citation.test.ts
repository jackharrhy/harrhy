import assert from "node:assert/strict";
import { it } from "node:test";
import { INPUT_ENTRY, PEER_MESSAGE_ENTRY, type MessageCitation, BACKGROUND_CONTEXT as TEST } from "@p2/app/v1";
import { Chat } from "../../plugins/chat/contract.ts";
import { Sessions, SessionTransfer } from "../../plugins/sessions/contract.ts";
import { SessionTree } from "../../plugins/tree/contract.ts";
import { Browser, browserTests } from "./browser.ts";
import { holdIn, startFixture, until } from "./helpers.ts";

it(
	"shows the historical quote to readers but only the owner can jump to the exact old entry",
	{ skip: !browserTests },
	async (t) => {
		const fixture = await startFixture({ web: true });
		t.after(() => fixture.close());
		const owner = fixture.browser();
		const sessions = await holdIn(owner, Sessions, {}, "owner");
		const { id: source } = await sessions.create({ cwd: fixture.workspace }, TEST);
		const { id: to } = await sessions.create({ cwd: fixture.workspace }, TEST);
		const text = "**keep this literal**  <em>and this</em>\nSecond line.";
		const entries = Array.from({ length: 130 }, (_, i) => {
			const content = i === 2 ? text : `History line ${i}`;
			return {
				kind: INPUT_ENTRY,
				data: { text: content, author: { kind: "owner", id: "owner", name: "Mara" }, attachments: [] },
				model: [{ role: "user", content, timestamp: i }],
			};
		});
		await fixture.server.host.root(
			async (ctx) => (await ctx.get(SessionTransfer, { session: source })).seed({ entries }, ctx),
			TEST,
		);
		const chat = await holdIn(owner, Chat, { session: source, conversation: 1 }, "participant");
		const entry = (await chat.entries({ order: "ascending", limit: 3 }, TEST)).items[2]!;
		await until(chat.view, (view) => Boolean(view?.before && view.entries[0]!.id > entry.id));
		// Use the existing persisted format; admission and receipt lookup are exercised through chat in the runtime test.
		const citation: MessageCitation = {
			id: "a".repeat(64),
			cite: { session: source, conversation: 1, entryId: entry.id },
			quote: { text, name: "Mara" },
			destination: to,
		};
		const message = "Review the wording";
		await fixture.server.host.root(
			async (ctx) => (await ctx.get(SessionTransfer, { session: to })).seed({ entries: [{
				kind: PEER_MESSAGE_ENTRY,
				data: { from: { id: source, title: "Source" }, text: message, citation },
				model: [{ role: "user", content: message, timestamp: 1 }],
			}] }, ctx),
			TEST,
		);
		const tree = await holdIn(owner, SessionTree, { session: source }, "owner");
		await tree.branch({ conversation: 1, label: "New main" }, TEST);

		const browser = await Browser.start();
		t.after(() => browser.close());
		await browser.metrics(390, 844);
		await browser.signIn(fixture.owner);
		const base = `http://127.0.0.1:${fixture.server.port}`;
		await browser.open(`${base}/s/${to}`);
		const quote = "document.querySelector('.citation-quote blockquote')";
		await browser.wait(`${quote}?.textContent === ${JSON.stringify(text)}`);
		assert.equal(await browser.evaluate(`${quote}.childElementCount`), 0);
		assert.equal(
			await browser.evaluate("document.querySelector('.citation-quote figcaption strong').textContent"),
			"Mara",
		);
		assert.equal(
			await browser.evaluate(`document.querySelector('.citation-quote').textContent.includes('${citation.id}')`),
			false,
		);
		await browser.click(".citation-quote figcaption button");
		await browser.wait(
			`location.pathname === '/s/${source}/c/1' && document.querySelector('[data-entry="${entry.id}"].flash')`,
		);
		await browser.evaluate("history.back()");
		await browser.wait(`${quote}?.textContent === ${JSON.stringify(text)}`);

	},
);
