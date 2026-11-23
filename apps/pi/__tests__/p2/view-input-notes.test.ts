// Messages sent before the views and scope prompt plugins were removed keep a note of what came along.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { viewInputDisplay, VIEW_INPUT_ENTRY } from "../../plugins/chat/view-input.ts";

describe("p2.view-input notes", () => {
	it("keeps the entry kind of old messages", () => {
		assert.equal(VIEW_INPUT_ENTRY, "p2.view-input");
	});

	it("says what an old message carried", () => {
		assert.deepEqual(viewInputDisplay({ views: { selections: 2, annotations: 1, notes: ["scope: the chat"] } }), {
			note: "with 2 selections and 1 annotation from views, scope: the chat",
		});
		assert.deepEqual(viewInputDisplay({ views: { notes: ["scope: the chat"] } }), { note: "with scope: the chat" });
	});

	it("shows nothing for data without views", () => {
		assert.equal(viewInputDisplay({ text: "hi" }), undefined);
		assert.equal(viewInputDisplay({ views: { selections: 0 } }), undefined);
	});
});
