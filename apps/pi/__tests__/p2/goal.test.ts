// Isolated native goal admission through the owner contract and the faux provider.
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { TuiAltScreen } from "@earendil-works/pi-tui";
import { BACKGROUND_CONTEXT as TEST } from "@p2/app/v1";
import { VirtualTerminal } from "../fixtures/goal/virtual-terminal.ts";
import { Chat } from "../../plugins/chat/contract.ts";
import chatTui from "../../plugins/chat/tui.ts";
import { Goal } from "../../plugins/goal/contract.ts";
import goalTui from "../../plugins/goal/tui.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { Sharing } from "../../plugins/sharing/contract.ts";
import { startServer } from "../../src/hosts/server.ts";
import { TuiRuntime } from "../../src/runtime/tui.ts";
import { tuiCoreFacet } from "../../src/tui/core-commands.ts";
import { clientHost, holdIn, localOwner, poll, startFixture, until } from "./helpers.ts";

async function startWithStaleProbe(t: { after(fn: () => unknown): void }) {
	const dataDir = mkdtempSync(join(tmpdir(), "p2-goal-stale-"));
	const dir = join(dataDir, "plugins", "stale-probe");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "stale-probe", private: true, type: "module" }));
	cpSync(fileURLToPath(new URL("../fixtures/goal/stale-probe.ts", import.meta.url)), join(dir, "worker.ts"));
	try {
		const fixture = await startFixture({ dataDir });
		t.after(async () => {
			try {
				await fixture.close();
			} finally {
				rmSync(dataDir, { recursive: true, force: true });
			}
		});
		return fixture;
	} catch (error) {
		rmSync(dataDir, { recursive: true, force: true });
		throw error;
	}
}

it(
	"binds a goal to the main conversation and fails closed on a malformed native answer",
	{ timeout: 20000 },
	async () => {
		const fixture = await startFixture();
		try {
			const owner = fixture.browser();
			const sessions = await holdIn(owner, Sessions, {}, "owner");
			const { id: session } = await sessions.create({ cwd: fixture.workspace }, TEST);
			const goal = await holdIn(owner, Goal, { session }, "owner");
			const target = { conversation: 1 };
			assert.equal(await goal.status(target, TEST), null);
			await assert.rejects(
				goal.start({ conversation: 2, objective: "UI parity fixture", limit: 2 }, TEST),
				/current main/,
			);
			const sharing = await holdIn(owner, Sharing, { session }, "owner");
			await sharing.share({ email: "fixture@example.com", mode: "view" }, TEST);
			await assert.rejects(goal.start({ ...target, objective: "UI parity fixture", limit: 2 }, TEST), /private/);
			await sharing.disable({}, TEST);
			await goal.start({ ...target, objective: "UI parity fixture", limit: 2 }, TEST);
			await poll(
				async () => (await goal.status(target, TEST))?.phase === "blocked",
				5000,
				"malformed goal report blocked",
			);
			const result = await goal.status(target, TEST);
			assert.equal(result?.steps, 1);
			assert.ok(result.submission && result.answer);
			assert.match(result.evidence, /No valid step report/);
		} finally {
			await fixture.close();
		}
	},
);

it("pauses without admitting when the transcript changes before native admission", { timeout: 20000 }, async (t) => {
	const fixture = await startWithStaleProbe(t);
	const owner = fixture.browser();
	const sessions = await holdIn(owner, Sessions, {}, "owner");
	const { id: session } = await sessions.create({ cwd: fixture.workspace }, TEST);
	const goal = await holdIn(owner, Goal, { session }, "owner");
	const target = { conversation: 1 };
	await goal.start({ ...target, objective: "Stale transcript fixture", limit: 2 }, TEST);
	await poll(async () => (await goal.status(target, TEST))?.phase === "paused", 5000, "stale goal paused");
	const paused = await goal.status(target, TEST);
	assert.equal(paused?.steps, 0);
	assert.equal(paused.submission, null);
	assert.match(paused.evidence, /Conversation changed/);
	await goal.resume(target, TEST);
	await poll(async () => (await goal.status(target, TEST))?.phase === "blocked", 5000, "reviewed goal admitted");
	assert.equal((await goal.status(target, TEST))?.steps, 1);
});

async function localProvider(t: { after(fn: () => unknown): void }, dataDir: string, provider: Server) {
	await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
	t.after(
		() =>
			new Promise<void>((resolve, reject) => {
				provider.close((error) => (error ? reject(error) : resolve()));
				provider.closeAllConnections();
			}),
	);
	const addr = provider.address();
	assert.ok(addr && typeof addr !== "string");
	writeFileSync(
		join(dataDir, "models.json"),
		JSON.stringify({
			providers: {
				local: {
					baseUrl: `http://127.0.0.1:${addr.port}/v1`,
					apiKey: "fixture",
					api: "openai-completions",
					models: [{ id: "m1", contextWindow: 8000, maxTokens: 100 }],
				},
			},
		}),
	);
	return { provider: "local", modelId: "m1" };
}

it("preserves a busy-paused goal across restart and requires explicit resume", { timeout: 25000 }, async (t) => {
	const fixture = await startFixture();
	let restarted: Awaited<ReturnType<typeof startServer>> | undefined;
	const requested = Promise.withResolvers<void>();
	const model = await localProvider(
		t,
		fixture.dataDir,
		createServer((request) => {
			request.resume();
			requested.resolve();
		}),
	);
	let browser: ReturnType<typeof clientHost> | undefined;
	try {
		const owner = fixture.browser();
		const sessions = await holdIn(owner, Sessions, {}, "owner");
		const { id: session } = await sessions.create({ cwd: fixture.workspace }, TEST);
		const target = { conversation: 1 };
		const chat = await holdIn(owner, Chat, { session, ...target }, "participant");
		const goal = await holdIn(owner, Goal, { session }, "owner");
		await chat.configure({ model }, TEST);
		await chat.send({ text: "Hold this run open", requestId: "busy" }, TEST);
		await requested.promise;
		await goal.start({ ...target, objective: "Restart fixture", limit: 2 }, TEST);
		await poll(async () => (await goal.status(target, TEST))?.phase === "paused", 3000, "busy goal paused");
		const paused = await goal.status(target, TEST);
		assert.equal(paused?.steps, 0);
		assert.match(paused.evidence, /busy/);
		await chat.stop(TEST);
		await until(chat.view, (view) => !JSON.stringify(view?.docs["pi.live"] ?? {}).includes(JSON.stringify("run")));
		await chat.configure({ model: { provider: "faux", modelId: "faux-1" } }, TEST);
		await fixture.server.close();
		restarted = await startServer({ dataDir: fixture.dataDir, port: 0, fake: true, web: false });
		browser = clientHost(await localOwner(restarted));
		const after = await holdIn(browser, Goal, { session }, "owner");
		assert.deepEqual(await after.status(target, TEST), paused);
		await after.resume(target, TEST);
		await poll(async () => (await after.status(target, TEST))?.phase === "blocked", 5000, "resumed goal settled");
		assert.equal((await after.status(target, TEST))?.steps, 1);
	} finally {
		await browser?.close(TEST);
		await restarted?.close();
		await fixture.close();
	}
});

it("runs two native steps from a typed TUI command and reports completion", { timeout: 25000 }, async (t) => {
	const fixture = await startFixture();
	const rounds: number[] = [];
	const shareStep = Promise.withResolvers<void>();
	const finishShareStep = Promise.withResolvers<void>();
	const blockStep = Promise.withResolvers<void>();
	const finishBlockStep = Promise.withResolvers<void>();
	const provider = createServer(async (req, res) => {
		const chunks: Buffer[] = [];
		for await (const chunk of req) chunks.push(chunk);
		const body = JSON.parse(Buffer.concat(chunks).toString());
		const marker = /GOAL ([0-9a-f-]+):(\d+) CONTINUE:/.exec(JSON.stringify(body.messages.at(-1)));
		if (!marker) {
			res.writeHead(400).end();
			return;
		}
		const round = Number(marker[2]);
		rounds.push(round);
		const last = JSON.stringify(body.messages.at(-1));
		const ownerPaused = last.includes("Block while paused");
		if (ownerPaused) {
			blockStep.resolve();
			await finishBlockStep.promise;
		}
		if (last.includes("Pause on sharing")) {
			shareStep.resolve();
			await finishShareStep.promise;
		}
		const report = `GOAL ${marker[1]}:${round} ${ownerPaused ? "BLOCKED: workspace unavailable" : round === 1 ? "CONTINUE: desktop checked" : "COMPLETE: both layouts checked"}`;
		res.writeHead(200, { "Content-Type": "text/event-stream" });
		for (const [delta, finish_reason] of [
			[{ content: report }, null],
			[{}, "stop"],
		]) {
			res.write(
				`data: ${JSON.stringify({ id: "goal", object: "chat.completion.chunk", created: 1, model: "m1", choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
			);
		}
		res.end("data: [DONE]\n\n");
	});
	const model = await localProvider(t, fixture.dataDir, provider);
	const owner = fixture.browser([
		{ name: "tui-core", facet: tuiCoreFacet },
		{ name: "tui-chat", facet: chatTui },
		{ name: "tui-goal", facet: goalTui },
	]);
	const terminal = new VirtualTerminal(100, 24);
	const tui = new TuiAltScreen(terminal);
	const runtime = new TuiRuntime(owner, tui);
	try {
		const sessions = await holdIn(owner, Sessions, {}, "owner");
		const { id: session } = await sessions.create({ cwd: fixture.workspace }, TEST);
		const target = { conversation: 1 };
		const chat = await holdIn(owner, Chat, { session, ...target }, "participant");
		await chat.configure({ model }, TEST);
		const goal = await holdIn(owner, Goal, { session }, "owner");
		runtime.connected = true;
		runtime.role = "owner";
		runtime.session = session;
		runtime.screen = "chat";
		await runtime.start();
		tui.setLayoutRoot(runtime.root);
		tui.setFocus(runtime);
		tui.start();
		for (const key of "/goal start 3 Compare UI layouts\r") terminal.sendInput(key);
		await poll(
			async () => (await goal.status(target, TEST))?.phase === "reported-complete",
			10000,
			"TUI goal report",
		);
		const result = await goal.status(target, TEST);
		assert.equal(result?.steps, 2);
		assert.equal(result.evidence, "both layouts checked");
		assert.ok(result.submission && result.answer);
		assert.deepEqual(rounds, [1, 2]);
		for (const key of "/goal status\r") terminal.sendInput(key);
		await poll(
			async () => (await terminal.flushAndGetViewport()).join("\n").includes("reported-complete"),
			3000,
			"TUI status notice",
		);
		await goal.start({ ...target, objective: "Block while paused", limit: 3 }, TEST);
		await poll(() => rounds.length === 3, 5000, "blocked step admitted");
		await blockStep.promise;
		assert.equal((await goal.pause(target, TEST))?.phase, "paused");
		finishBlockStep.resolve();
		await poll(
			async () => (await goal.status(target, TEST))?.phase === "blocked",
			5000,
			"paused step reports blocker",
		);
		assert.equal((await goal.status(target, TEST))?.evidence, "workspace unavailable");
		await assert.rejects(goal.resume(target, TEST), /Only a paused goal/);
		await goal.start({ ...target, objective: "Pause on sharing", limit: 3 }, TEST);
		await shareStep.promise;
		assert.equal((await goal.status(target, TEST))?.pending, true);
		const sharing = await holdIn(owner, Sharing, { session }, "owner");
		await sharing.share({ email: "preview@example.com", mode: "view" }, TEST);
		finishShareStep.resolve();
		await poll(async () => (await goal.status(target, TEST))?.phase === "paused", 5000, "shared goal stopped");
		assert.equal((await goal.status(target, TEST))?.steps, 1);
		assert.deepEqual(rounds, [1, 2, 1, 1], "no subsequent step was admitted after sharing");
	} finally {
		finishShareStep.resolve();
		finishBlockStep.resolve();
		tui.stop();
		runtime.dispose();
		await fixture.close();
	}
});
