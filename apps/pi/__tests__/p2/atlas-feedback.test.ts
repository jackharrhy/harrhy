// Disposable real stores and fake-model native admission; never touches live sessions or credentials.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { it } from "node:test";
import { arr, compile, int, nul, obj, opt, type Static, str, union } from "@earendil-works/pi-schema";
import { BACKGROUND_CONTEXT } from "@p2/app/v1";
import { AtlasFeedback, type Batch, payloadDigest } from "../../integrations/atlas-feedback/contract.server.ts";
import { Chat } from "../../plugins/chat/contract.ts";
import { Catalog, Sessions } from "../../plugins/sessions/contract.ts";
import { EventReadbackSchema, Subscriptions } from "../../plugins/stimuli/contract.ts";
import { Subagents } from "../../plugins/subagents/contract.ts";
import { SessionTree } from "../../plugins/tree/contract.ts";
import { startServer } from "../../src/hosts/server.ts";
import { PEER_MESSAGE_ENTRY } from "../../src/runtime/entries.ts";
import { holdIn, poll, startFixture, until } from "./helpers.ts";

const TEST = BACKGROUND_CONTEXT;
const Targets = compile(
	obj({
		targets: arr(
			obj({
				sessionId: str(),
				key: str(),
				revision: int(),
				label: str(),
			}),
		),
		defaultSessionId: union([str(), nul()]),
		eligibleCount: int(),
		unavailable: arr(obj({ sessionId: str(), label: str(), reason: str() })),
	}),
);
const Reply = compile(
	obj({
		batchId: str(),
		payloadDigest: str(),
		binding: obj({ key: str(), revision: int() }),
		receipt: EventReadbackSchema,
		chatUrl: opt(str()),
	}),
);
const Readback = compile(
	obj({
		batchId: str(),
		binding: obj({ key: str(), revision: int() }),
		receipt: EventReadbackSchema,
		chatUrl: opt(str()),
	}),
);

it("does not register either integration in base p2", async (t) => {
	const fixture = await startFixture();
	t.after(() => fixture.close());
	for (const name of ["atlas-feedback", "ingress"]) assert(!fixture.server.plugins.includes(name));
	assert.equal((await fixture.http("/atlas-feedback/targets")).status, 404);
	assert.equal((await fixture.http("/api/ingress/v1/events", { method: "POST" })).status, 404);
});

it("authenticates the app, filters targets, freezes batches and preserves retired native identity", async () => {
	const fixture = await startFixture({ integrations: ["atlas-feedback", "ingress"] });
	let restarted: Awaited<ReturnType<typeof startServer>> | undefined;
	try {
		assert(fixture.server.plugins.includes("atlas-feedback"));
		assert(fixture.server.plugins.includes("ingress"));
		const sessions = await holdIn(fixture.browser(), Sessions, {}, "owner");
		const session = await sessions.create({ cwd: fixture.workspace, title: "Synthetic Atlas target" }, TEST);
		const other = await sessions.create({ cwd: fixture.workspace, title: "Not approved" }, TEST);
		const subscriptions = await holdIn(fixture.browser(), Subscriptions, {}, "owner");
		const config = { resource: "atlas-test", articleOrigin: "https://atlas.example.test" };
		const subscription = await subscriptions.createTarget(
			{
				id: "approved",
				source: { id: AtlasFeedback.id, version: 1 },
				target: { session: session.id, conversation: 1 },
				config,
			},
			TEST,
		);
		await subscriptions.createTarget(
			{ id: "not-allowlisted", source: subscription.source, target: { session: other.id, conversation: 1 }, config },
			TEST,
		);
		const token = "synthetic-atlas-app-token-not-a-real-secret";
		await writeFile(
			join(fixture.dataDir, "atlas-feedback.json"),
			JSON.stringify({ token, ...config, piOrigin: "https://pi.example.test", subscriptions: [subscription.id] }),
			{ mode: 0o600 },
		);
		const base = `http://127.0.0.1:${fixture.server.port}`;
		const headers = { authorization: `Bearer ${token}` };
		const getTargets = async () => {
			const response = await fetch(`${base}/atlas-feedback/targets`, { headers });
			assert.equal(response.status, 200);
			const value: unknown = await response.json();
			assert(Targets.check(value));
			return value.targets;
		};
		assert.equal((await fetch(`${base}/atlas-feedback/targets`)).status, 401);
		assert.equal(
			(await fetch(`${base}/atlas-feedback/targets`, { headers: { authorization: "Bearer wrong" } })).status,
			401,
		);
		assert.equal(
			(await fetch(`${base}/atlas-feedback/targets`, { headers: { ...headers, origin: config.articleOrigin } }))
				.status,
			403,
		);
		const targets = await getTargets();
		assert.equal(targets.length, 1);
		assert(!("glyph" in targets[0]!));
		assert(!JSON.stringify(targets).includes(fixture.workspace));
		assert.equal(targets[0]!.sessionId, session.id);
		assert.equal(targets[0]!.label, session.title);
		const target = { key: targets[0]!.key, revision: targets[0]!.revision };
		const comments = [
			{
				id: "c1",
				articleUrl: `${config.articleOrigin}/article`,
				sourceSha256: "a".repeat(64),
				annotationProjectionSha256: "b".repeat(64),
				quote: { exact: "Quoted text", prefix: "before ", suffix: " after", start: 7, end: 18 },
				comment: "Please review this claim.",
			},
		];
		const batch: Batch = {
			payloadVersion: 1,
			target,
			batchId: "stable-batch",
			payloadDigest: payloadDigest(comments),
			comments,
		};
		const post = (body: unknown) =>
			fetch(`${base}/atlas-feedback/batches`, {
				method: "POST",
				headers: { ...headers, "content-type": "application/json" },
				body: JSON.stringify(body),
			});
		assert.equal((await post({ ...batch, payloadDigest: "0".repeat(64) })).status, 409);
		assert.equal((await post({ ...batch, payloadVersion: 2 })).status, 400);
		assert.equal((await post({ ...batch, unknownField: true })).status, 400);
		assert.equal(
			(
				await post({
					...batch,
					comments: [{ ...comments[0]!, quote: { ...comments[0]!.quote, unknownField: true } }],
				})
			).status,
			400,
		);
		assert.equal((await post({ ...batch, comments: Array.from({ length: 33 }, () => comments[0]!) })).status, 400);
		assert.equal((await post({ ...batch, comments: [{ ...comments[0]!, comment: "x".repeat(4097) }] })).status, 400);
		const changedProjection = [{ ...comments[0]!, annotationProjectionSha256: "c".repeat(64) }];
		assert.notEqual(payloadDigest(comments), payloadDigest(changedProjection));
		assert.equal((await post({ ...batch, target: { key: session.id, revision: 1 } })).status, 404);
		const invalidComments = [{ ...comments[0]!, articleUrl: "https://evil.example/article" }];
		assert.equal(
			(
				await post({
					...batch,
					batchId: "wrong-resource",
					comments: invalidComments,
					payloadDigest: payloadDigest(invalidComments),
				})
			).status,
			400,
		);
		assert.equal((await post({ ...batch, comments: [{ ...comments[0]!, comment: "x".repeat(25000) }] })).status, 413);
		const responses = await Promise.all(Array.from({ length: 4 }, () => post(batch)));
		const replies: { receipt: Static<typeof EventReadbackSchema> }[] = [];
		for (const response of responses) {
			assert.equal(response.status, 200);
			const value: unknown = await response.json();
			assert(Reply.check(value));
			assert.equal(
				value.chatUrl,
				value.receipt.state === "admitted" ? `https://pi.example.test/s/${session.id}/c/1` : undefined,
			);
			replies.push(value);
		}
		const first = replies[0]!;
		assert(first.receipt.state !== "missing");
		const envelope = first.receipt.event.envelope;
		for (const reply of replies) {
			assert(reply.receipt.state !== "missing");
			assert.deepEqual(reply.receipt.event.envelope, envelope);
		}
		assert.equal(
			(await post({ ...batch, comments: changedProjection, payloadDigest: payloadDigest(changedProjection) }))
				.status,
			409,
		);
		const changed = [{ ...comments[0]!, comment: "Changed content" }];
		assert.equal((await post({ ...batch, comments: changed, payloadDigest: payloadDigest(changed) })).status, 409);
		const chat = await holdIn(fixture.browser(), Chat, { session: session.id, conversation: 1 }, "participant");
		await until(chat.view, (view) => Boolean(view?.entries.some((entry) => entry.kind === PEER_MESSAGE_ENTRY)));
		const native = chat.view.value!.entries.filter((entry) => entry.kind === PEER_MESSAGE_ENTRY);
		assert.equal(native.length, 1);
		assert.deepEqual(native[0]!.data, {
			from: { kind: "external", id: "atlas.feedback", title: "Atlas feedback" },
			text: envelope.delivery.text,
			stimulus: {
				deliveryId: envelope.delivery.id,
				sourceVersion: 1,
				subscriptionId: subscription.id,
				revision: 1,
				eventId: batch.batchId,
			},
		});
		const tree = await holdIn(fixture.browser(), SessionTree, { session: session.id }, "owner");
		await tree.branch({ conversation: 1, label: "New main after recorded batch" }, TEST);
		assert.equal((await post({ ...batch, batchId: "stale-main-new-batch" })).status, 409);
		const originalMainReplay: unknown = await (await post(batch)).json();
		assert(Reply.check(originalMainReplay));
		assert(originalMainReplay.receipt.state !== "missing");
		assert.deepEqual(originalMainReplay.receipt.event.envelope, envelope);
		tree.release();
		await subscriptions.reviseTarget(
			{ id: subscription.id, expectedRevision: 1, target: { session: other.id, conversation: 1 }, config },
			TEST,
		);
		assert.equal((await post({ ...batch, batchId: "retired-new" })).status, 409);
		const retried: unknown = await (await post(batch)).json();
		assert(Reply.check(retried));
		assert(retried.receipt.state !== "missing");
		assert.deepEqual(retried.receipt.event.envelope, envelope);
		await poll(async () => {
			const response = await fetch(
				`${base}/atlas-feedback/receipt?${new URLSearchParams({ key: target.key, revision: "1", batchId: batch.batchId })}`,
				{ headers },
			);
			const value: unknown = await response.json();
			assert(Readback.check(value));
			assert.equal(
				value.chatUrl,
				value.receipt.state === "admitted" ? `https://pi.example.test/s/${session.id}/c/1` : undefined,
			);
			return value.receipt.state === "admitted" && value.receipt.event.phase.kind === "settled";
		});
		chat.release();
		subscriptions.release();
		sessions.release();
		await fixture.server.close();
		restarted = await startServer({ dataDir: fixture.dataDir, port: 0, fake: true, web: false });
		const restoredResponse = await fetch(
			`http://127.0.0.1:${restarted.port}/atlas-feedback/receipt?${new URLSearchParams({ key: target.key, revision: "1", batchId: batch.batchId })}`,
			{ headers },
		);
		const restored: unknown = await restoredResponse.json();
		assert(Readback.check(restored));
		assert(restored.receipt.state !== "missing");
		assert.deepEqual(restored.receipt.event.envelope, envelope);
		assert.equal(restored.chatUrl, `https://pi.example.test/s/${session.id}/c/1`);
		const replay = await fetch(`http://127.0.0.1:${restarted.port}/atlas-feedback/batches`, {
			method: "POST",
			headers: { ...headers, "content-type": "application/json" },
			body: JSON.stringify(batch),
		});
		assert.equal(replay.status, 200);
	} finally {
		await restarted?.close();
		await fixture.close();
	}
});

it("derives all private root recipients, keeps root titles and preserves old bindings across main switches", async () => {
	const fixture = await startFixture({ idleMs: 100, integrations: ["atlas-feedback"] });
	try {
		const owner = fixture.browser();
		const sessions = await holdIn(owner, Sessions, {}, "owner");
		const ask = await sessions.create({ cwd: fixture.workspace, title: "Ask Pi fixture" }, TEST);
		const idle = await sessions.create({ cwd: fixture.workspace, title: "Idle root" }, TEST);
		const archived = await sessions.create({ cwd: fixture.workspace, title: "Archived root" }, TEST);
		await sessions.archive({ id: archived.id }, TEST);
		const tree = await holdIn(owner, SessionTree, { session: ask.id }, "owner");
		await tree.rename({ conversation: 1, label: "Only a branch review label" }, TEST);
		const config = { resource: "atlas-roots", articleOrigin: "https://atlas.example.test" };
		const token = "synthetic-root-catalog-token-not-a-real-secret";
		const subscriptions = await holdIn(owner, Subscriptions, {}, "owner");
		const original = await subscriptions.createTarget(
			{
				id: "original-ask",
				source: { id: AtlasFeedback.id, version: 1 },
				target: { session: ask.id, conversation: 1 },
				config,
			},
			TEST,
		);
		await writeFile(
			join(fixture.dataDir, "atlas-feedback.json"),
			JSON.stringify({
				token,
				...config,
				subscriptions: [original.id],
				recipients: "top-level",
				defaultSessionId: ask.id,
			}),
			{ mode: 0o600 },
		);
		const headers = { authorization: `Bearer ${token}` };
		const get = async () => {
			const response = await fetch(`http://127.0.0.1:${fixture.server.port}/atlas-feedback/targets`, { headers });
			assert.equal(response.status, 200);
			const value: unknown = await response.json();
			assert(Targets.check(value));
			return value;
		};
		const first = await get();
		assert.equal(first.defaultSessionId, ask.id);
		assert.equal(first.eligibleCount, 2, JSON.stringify(first));
		assert.deepEqual(first.unavailable, []);
		assert.deepEqual(
			first.targets.map((row) => [row.sessionId, row.label]).sort(),
			[
				[ask.id, ask.title],
				[idle.id, idle.title],
			].sort(),
		);
		const oldTarget = first.targets.find((row) => row.sessionId === ask.id)!;
		const chat = await holdIn(owner, Chat, { session: ask.id, conversation: 1 }, "participant");
		const children = await holdIn(owner, Subagents, {}, "reader");
		await chat.send({ text: "subagent", requestId: "fixture-child" }, TEST);
		const childRows = await until(children.children, (value) => value?.[ask.id]?.length === 1);
		const child = childRows![ask.id]![0]!;
		const withChild = await get();
		assert.equal(withChild.eligibleCount, 2);
		assert(!withChild.targets.some((row) => row.label === child.name));
		assert(
			!(await subscriptions.list({}, TEST)).some(
				(row) => row.target.conversation === child.conversationId && row.target.session === ask.id,
			),
		);
		const branch = await tree.branch({ conversation: 1, label: "New main review branch" }, TEST);
		const next = await get();
		const current = next.targets.find((row) => row.sessionId === ask.id)!;
		assert.equal(current.label, ask.title);
		assert.notEqual(current.key, oldTarget.key);
		const rows = await subscriptions.list({}, TEST);
		assert.deepEqual(
			rows.find((row) => row.id === original.id),
			original,
		);
		assert(rows.some((row) => row.target.session === ask.id && row.target.conversation === branch.conversation));
		const future = await sessions.create({ cwd: fixture.workspace, title: "Future eligible root" }, TEST);
		const concurrent = await Promise.all([get(), get()]);
		for (const value of concurrent) {
			assert.equal(value.eligibleCount, 3);
			assert(value.targets.some((row) => row.sessionId === future.id));
		}
		assert.equal((await subscriptions.list({}, TEST)).filter((row) => row.target.session === future.id).length, 1);
		const futureBinding = (await subscriptions.list({}, TEST)).find((row) => row.target.session === future.id)!;
		await subscriptions.setEnabled({ id: futureBinding.id, expectedRevision: 1, enabled: false }, TEST);
		const disabled = await get();
		assert.equal(disabled.eligibleCount, 2);
		assert.deepEqual(disabled.unavailable, [
			{ sessionId: future.id, label: future.title, reason: "binding-disabled" },
		]);
		assert.equal((await subscriptions.list({}, TEST)).find((row) => row.id === futureBinding.id)!.enabled, false);
		const futureTarget = concurrent[0]!.targets.find((row) => row.sessionId === future.id)!;
		await subscriptions.reviseTarget(
			{ id: futureBinding.id, expectedRevision: 2, target: { session: idle.id, conversation: 1 }, config },
			TEST,
		);
		const originalReadback = await fetch(
			`http://127.0.0.1:${fixture.server.port}/atlas-feedback/receipt?${new URLSearchParams({
				key: futureTarget.key,
				revision: "1",
				batchId: "never-published-fixture-batch",
			})}`,
			{ headers },
		);
		assert.equal(originalReadback.status, 200, "role-derived identity survives native target revision");
		const receipt: unknown = await originalReadback.json();
		assert(Readback.check(receipt));
		assert.equal(receipt.receipt.state, "missing");
		assert.equal(receipt.chatUrl, undefined);
		const revised = await get();
		assert(!revised.targets.some((row) => row.sessionId === future.id));
		assert.equal(new Set(revised.targets.map((row) => row.sessionId)).size, revised.targets.length);
		const failed = await sessions.create({ cwd: fixture.workspace, title: "Failed native worker" }, TEST);
		await fixture.server.host.root(async (ctx) => {
			await (await ctx.get(Catalog, {})).update(
				{ id: failed.id, model: { provider: "faux", modelId: "removed" } },
				ctx,
			);
		}, TEST);
		const partial = await get();
		assert.equal(partial.eligibleCount, 2, "a failed root does not block healthy roots");
		assert(partial.unavailable.some((row) => row.sessionId === failed.id && row.reason === "not-writable"));
		const repeated = await get();
		assert.equal(repeated.eligibleCount, 2);
		assert(repeated.unavailable.some((row) => row.sessionId === failed.id));
	} finally {
		await fixture.close();
	}
});
