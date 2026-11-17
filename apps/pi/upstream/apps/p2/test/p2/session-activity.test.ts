// Stable session names and separately persisted activity: tool semantics, permissions, fencing and restart.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ConversationView, LiveState } from "@earendil-works/pi-durable";
import { BACKGROUND_CONTEXT, whenLive } from "@p2/app/v1";
import { Hosts } from "@p2/app/v1/server";
import { Chat } from "../../plugins/chat/contract.ts";
import { SessionActivity } from "../../plugins/sessions/activity-contract.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { SessionStatus } from "../../plugins/status/contract.ts";
import { startServer } from "../../src/hosts/server.ts";
import { expectChord, holdIn, startFixture, until } from "./helpers.ts";

const context = BACKGROUND_CONTEXT;
const finished = (view: ConversationView | null | undefined, request: string) =>
	JSON.stringify(view?.entries).includes(`Echo: ${request}`) && !(view?.docs["pi.live"] as LiveState | undefined)?.run;

test(
	"activity reports are owner-only, session-scoped, revision-ordered and generation-fenced",
	{ timeout: 30_000 },
	async (t) => {
		const fixture = await startFixture();
		t.after(() => fixture.close());
		const ownerHost = fixture.browser();
		const sessions = await holdIn(ownerHost, Sessions, {}, "owner");
		const row = await sessions.create({ cwd: fixture.workspace, title: "Stable" }, context);
		const chat = await holdIn(ownerHost, Chat, { session: row.id, conversation: 1 }, "participant");
		const hosts = await fixture.server.host.get(Hosts, {}, context);
		const workers = await until(hosts.workers, (all) => all[row.id]?.running === true);
		const generation = workers[row.id]!.generation;
		const owner = await holdIn(ownerHost, SessionActivity, {}, "owner");
		const reporter = await holdIn(
			fixture.as({ kind: "worker", session: row.id, generation }),
			SessionActivity,
			{},
			"reporter",
		);
		await reporter.report({ revision: 10, text: "Review ingress" }, context);
		assert.equal(
			(await until(owner.activities, (all) => all?.[row.id] === "Review ingress"))?.[row.id],
			"Review ingress",
		);
		await reporter.report({ revision: 12, text: "" }, context);
		await until(owner.activities, (all) => all !== undefined && all[row.id] === undefined);
		await reporter.report({ revision: 11, text: "Late report" }, context);
		assert.equal(owner.activities.value?.[row.id], undefined);
		const stale = await holdIn(
			fixture.as({ kind: "worker", session: row.id, generation: generation - 1 }),
			SessionActivity,
			{},
			"reporter",
		);
		await expectChord(stale.report({ revision: 13, text: "Stale generation" }, context), "forbidden");
		chat.release();
		await hosts.stop({ session: row.id }, context);
		await expectChord(reporter.report({ revision: 14, text: "Stopped worker" }, context), "forbidden");
		const guest = fixture
			.as({ kind: "guest", id: "guest", name: "Guest", home: row.id, sessions: { [row.id]: "full" }, revision: 1 })
			.hold(SessionActivity, {}, context);
		await expectChord(whenLive(guest), "forbidden");
		guest.release();
	},
);

test(
	"set_activity never renames, persists through idle/worker/server restart, and explicitly clears",
	{ timeout: 90_000 },
	async (t) => {
		const fixture = await startFixture();
		let restarted: Awaited<ReturnType<typeof startServer>> | undefined;
		t.after(async () => {
			await restarted?.close();
			await fixture.close();
		});
		const owner = fixture.browser();
		const sessions = await holdIn(owner, Sessions, {}, "owner");
		const session = await sessions.create({ cwd: fixture.workspace, title: "Stable owner name" }, context);
		const activity = await holdIn(owner, SessionActivity, {}, "owner");
		const statuses = await holdIn(owner, SessionStatus, {}, "reader");
		const chat = await holdIn(owner, Chat, { session: session.id, conversation: 1 }, "participant");
		const send = async (text: string) => {
			await chat.send({ text, requestId: crypto.randomUUID() }, context);
			await until(chat.view, (view) => finished(view, text));
		};
		await send("set-activity   Review   ingress  ");
		await until(activity.activities, (all) => all?.[session.id] === "Review ingress");
		await until(statuses.statuses, (all) => all?.[session.id]?.busy.length === 0);
		assert.equal(sessions.sessions.value?.find((row) => row.id === session.id)?.title, "Stable owner name");
		assert.equal(
			chat.view.value?.docs["p2.session-activity"],
			undefined,
			"session activity is not a conversation doc",
		);
		await sessions.rename({ id: session.id, title: "Owner renamed" }, context);
		await send("set-activity Next task");
		assert.equal(sessions.sessions.value?.find((row) => row.id === session.id)?.title, "Owner renamed");
		const view = chat.view.value;
		const toolNames = view?.entries
			.flatMap((entry) => entry.model ?? [])
			.flatMap((message) =>
				message.role === "assistant"
					? message.content.flatMap((part) => (part.type === "toolCall" ? [part.name] : []))
					: [],
			);
		assert.ok(toolNames?.includes("set_activity"));
		assert.ok(!toolNames?.includes("rename_session"));
		const guest = fixture.as({
			kind: "guest",
			id: "guest",
			name: "Guest",
			home: session.id,
			sessions: { [session.id]: "full" },
			revision: 1,
		});
		// A guest's shared row never grows activity fields (the normal tool transcript remains shared).
		const guestRows = await holdIn(guest, Sessions, {}, "guest");
		assert.equal("activity" in guestRows.sessions.value![0]!, false);
		assert.equal(
			"renameSelf" in
				(await holdIn(fixture.as({ kind: "worker", session: session.id, generation: 1 }), Sessions, {}, "worker")),
			false,
		);
		chat.release();
		await sessions.archive({ id: session.id }, context);
		await until(statuses.statuses, (all) => all?.[session.id]?.running === false);
		await sessions.restore({ id: session.id }, context);
		assert.equal(activity.activities.value?.[session.id], "Next task", "stopping a worker does not clear activity");
		await fixture.server.close();
		restarted = await startServer({ dataDir: fixture.dataDir, port: fixture.server.port, fake: true, web: false });
		const afterOwner = fixture.browser();
		const after = await holdIn(afterOwner, SessionActivity, {}, "owner");
		assert.equal(
			(await until(after.activities, (all) => all?.[session.id] === "Next task"))?.[session.id],
			"Next task",
		);
		const afterChat = await holdIn(afterOwner, Chat, { session: session.id, conversation: 1 }, "participant");
		assert.equal(afterChat.view.value?.docs["p2.session-activity"], undefined);
		await afterChat.send({ text: "set-activity ", requestId: "clear" }, context);
		await until(after.activities, (all) => all !== undefined && all[session.id] === undefined);
		await until(afterChat.view, (value) => finished(value, "set-activity "));
		const afterSessions = await holdIn(afterOwner, Sessions, {}, "owner");
		assert.equal(afterSessions.sessions.value?.find((row) => row.id === session.id)?.title, "Owner renamed");
	},
);
