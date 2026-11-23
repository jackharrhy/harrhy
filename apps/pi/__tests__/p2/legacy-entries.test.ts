// Entries written before the views, scope prompt and chat mode plugins were removed keep the notes and quotes they show.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LEGACY_ENTRY_DISPLAYS, VIEW_INPUT_ENTRY, viewInputDisplay } from "../../plugins/chat/legacy-entries.ts";

const quote = { entryId: 7, author: { kind: "owner", id: "owner", name: "Jack" }, excerpt: "the start" };

describe("legacy entry displays", () => {
	it("keeps the entry kind of old scope messages", () => {
		assert.equal(VIEW_INPUT_ENTRY, "p2.view-input");
		assert.ok(LEGACY_ENTRY_DISPLAYS[VIEW_INPUT_ENTRY]);
	});

	it("says what an old scope message carried", () => {
		assert.deepEqual(viewInputDisplay({ views: { selections: 2, annotations: 1, notes: ["scope: the chat"] } }), {
			note: "with 2 selections and 1 annotation from views, scope: the chat",
		});
		assert.deepEqual(viewInputDisplay({ views: { notes: ["scope: the chat"] } }), { note: "with scope: the chat" });
	});

	it("shows nothing for view data that carries nothing", () => {
		assert.equal(viewInputDisplay({ text: "hi" }), undefined);
		assert.equal(viewInputDisplay({ views: { selections: 0 } }), undefined);
	});

	it("quotes the message a chat message answered, and counts a mention's messages", () => {
		const message = LEGACY_ENTRY_DISPLAYS["chat.message"];
		assert.deepEqual(message?.({ text: "reply", replyTo: quote }), {
			replyTo: { entryId: 7, name: "Jack", excerpt: "the start" },
		});
		const mention = LEGACY_ENTRY_DISPLAYS["chat.mention"];
		assert.deepEqual(mention?.({ text: "@pi", included: [1, 2], replyTo: quote }), {
			replyTo: { entryId: 7, name: "Jack", excerpt: "the start" },
			note: "with 2 chat messages",
		});
	});
});
