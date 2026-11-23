// The scope prompt's send router: a staged scope block goes to the model after the message it was staged for, the
// transcript entry keeps the person's text and a note, and a message nothing was staged for is an ordinary input.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { UserMessage } from "@earendil-works/pi-ai";
import { BACKGROUND_CONTEXT } from "@p2/app/v1";
import { Chat } from "../../plugins/chat/contract.ts";
import { ScopeStage } from "../../plugins/scope-prompt/contract.ts";
import { viewInputDisplay } from "../../plugins/scope-prompt/display.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { type Fixture, holdIn, startFixture, until } from "./helpers.ts";

describe("scope prompt send router", () => {
	let fixture: Fixture;
	before(async () => {
		fixture = await startFixture();
	});
	after(() => fixture.close());

	it("carries the staged block with its message and notes it in the transcript", async () => {
		const owner = fixture.browser();
		const sessions = await holdIn(owner, Sessions, {}, "owner");
		const { id: session } = await sessions.create({ cwd: fixture.workspace, title: "Scope" }, BACKGROUND_CONTEXT);
		const chat = await holdIn(owner, Chat, { session, conversation: 1 }, "participant");
		const stage = await holdIn(owner, ScopeStage, { session }, "sender");
		await stage.stage({ requestId: "scoped", block: "<scope>pointed</scope>", note: "scope: the chat" }, BACKGROUND_CONTEXT);
		await chat.send({ text: "look here", requestId: "scoped" }, BACKGROUND_CONTEXT);
		await chat.send({ text: "plain", requestId: "plain" }, BACKGROUND_CONTEXT);
		const view = await until(chat.view, (value) => JSON.stringify(value?.entries ?? []).includes("Echo: plain"));
		const inputs = (view?.entries ?? []).filter((entry) => entry.kind === "p2.view-input" || entry.kind === "p2.input");
		const [scoped, plain] = inputs;
		assert.equal(scoped?.kind, "p2.view-input");
		assert.match(JSON.stringify((scoped?.model?.[0] as UserMessage).content), /look here[\s\S]*<scope>pointed<\/scope>/);
		assert.deepEqual(viewInputDisplay(scoped?.data), { note: "with scope: the chat" });
		assert.equal(plain?.kind, "p2.input");
		assert.doesNotMatch(JSON.stringify((plain?.model?.[0] as UserMessage).content), /scope/);
	});
});
