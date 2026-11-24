// A data directory that already holds what the first release of the cursor integration stored (version 1 of
// p2.cursor-config and p2.cursor-runs, written by __tests__/fixtures/cursor-v1-store.ts) must load under the current
// plugin, keep its values and gain what version 2 added. A stored schema that changes without version+1 and `migrate`
// fails to load where the old object is stored, which is what this guards.
import assert from "node:assert/strict";
import { cpSync } from "node:fs";
import { join } from "node:path";
import { it } from "node:test";
import { BACKGROUND_CONTEXT as TEST } from "@p2/app/v1";
import { CursorRuns, CursorSettings } from "../../integrations/cursor/contract.ts";
import { CursorStore } from "../../integrations/cursor/store.ts";
import { createHost, Server } from "../../src/runtime/chord.ts";
import { openHostStore, userPluginsDirectory } from "../../src/runtime/host-dirs.ts";
import { type RunRecordV1, StoreV1, writerV1 } from "../fixtures/cursor-v1-store.ts";
import { APP, holdIn, startFixture } from "./helpers.ts";

const SESSION = "legacy-session";
const finished: RunRecordV1 = {
	id: `cursor-${"a".repeat(24)}`,
	runtime: "local",
	mode: "ask",
	status: "finished",
	model: "composer-2",
	cwd: "/tmp/work",
	prompt: "what does this repo do?",
	createdAt: 1_700_000_000_000,
	finishedAt: 1_700_000_005_000,
	durationMs: 5000,
	usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, chargedCents: 3 },
	git: { branch: "cursor/x", prUrl: "https://example.test/pr/1" },
	resultChars: 11,
	session: SESSION,
	conversation: 1,
	agentId: "agent-1",
	cursorRunId: "run-1",
	deadline: 1_700_001_800_000,
	text: "It is a game.",
	notified: "yes",
};
const failed: RunRecordV1 = {
	id: `cursor-${"b".repeat(24)}`,
	runtime: "cloud",
	mode: "plan",
	status: "failed",
	repo: "acme/site",
	branch: "main",
	prompt: "review auth",
	createdAt: 1_700_000_100_000,
	finishedAt: 1_700_000_101_000,
	error: "quota exceeded",
	session: SESSION,
	conversation: 1,
	deadline: 1_700_001_900_000,
	text: "",
	notified: "gave-up",
};

/** A run version 2 of the plugin left going inside the server process: no worker directory, so no way to follow it. */
const going: RunRecordV1 = {
	id: `cursor-${"c".repeat(24)}`,
	runtime: "local",
	mode: "ask",
	status: "running",
	prompt: "still going when the server stopped",
	createdAt: 1_700_000_200_000,
	session: SESSION,
	conversation: 1,
	agentId: "agent-3",
	cwd: "/tmp/work",
	deadline: 4_000_000_000_000,
	text: "",
	notified: "no",
};

/** Writes version 1's stored objects into `dataDir` with the first release's schemas, as that release did. */
async function writeVersion1(dataDir: string): Promise<void> {
	const store = await openHostStore(join(dataDir, "server"), { outbox: false }, TEST);
	const old = createHost({ store, address: Server(), onError: () => {} });
	const report = await old.load([{ name: "cursor-v1", facet: writerV1 }], TEST);
	assert.deepEqual(report.failed, []);
	try {
		await old.root(async (ctx) => (await ctx.get(StoreV1, {})).seed({ runs: [finished, failed, going] }, ctx), TEST);
	} finally {
		await old.close(TEST);
		await store.close(TEST);
	}
}

it("loads settings and runs stored by version 1, keeps their values and gives them the default sandbox", { timeout: 90_000 }, async () => {
	const fixture = await startFixture({
		integrations: ["cursor"],
		prepare: async (dataDir) => {
			await writeVersion1(dataDir);
			cpSync(join(APP, "__tests__/fixtures/fake-cursor-sdk"), join(userPluginsDirectory(dataDir), "cursor", "node_modules", "@cursor", "sdk"), {
				recursive: true,
			});
		},
	});
	try {
		// The stored objects themselves.
		await fixture.server.host.root(async (ctx) => {
			const store = await ctx.get(CursorStore, {});
			assert.deepEqual(store.config.value, {
				// Version 1 stored true; at start the plugin sets it from the key file, and this data directory has none.
				keyStored: false,
				model: "composer-2",
				runtime: "cloud",
				repos: ["acme/*", "Other/Site"],
				allowLocalEdits: true,
				allowCloudEdits: false,
				sandbox: "when-possible",
				autoResume: false,
			});
			assert.deepEqual(store.runs.value.slice(0, 2), [finished, failed]);
			assert.equal(store.config.value.autoResume, false, "settings stored before auto-resume read as off");
		}, TEST);

		// What the owner sees.
		const settings = await holdIn(fixture.browser(), CursorSettings, {}, "owner");
		assert.equal(settings.model.value, "composer-2");
		assert.equal(settings.runtime.value, "cloud");
		assert.deepEqual(settings.repos.value, ["acme/*", "Other/Site"]);
		assert.equal(settings.allowLocalEdits.value, true);
		assert.equal(settings.allowCloudEdits.value, false);
		assert.equal(settings.sandbox.value, "when-possible");
		assert.equal(settings.autoResume.value, false);
		assert.equal(settings.workerSurvival.value.status, "unknown");

		// What the session's agent sees: its old runs, readable, without a sandbox label.
		const runs = await holdIn(fixture.as({ kind: "worker", session: SESSION, generation: 1 }), CursorRuns, {}, "worker");
		const listed = await runs.list({}, TEST);
		assert.deepEqual(
			listed.map((run) => [run.id, run.status, run.sandbox]),
			[
				[going.id, "interrupted", undefined],
				[failed.id, "failed", undefined],
				[finished.id, "finished", undefined],
			],
		);
		// A run an older version was running in the server process left no worker, but its Cursor agent is known: interrupted.
		const legacy = await runs.status({ id: going.id }, TEST);
		assert.match(legacy.interruption!, /older version of this plugin/);
		const result = await runs.result({ id: finished.id }, TEST);
		assert.equal(result.text, "It is a game.");
		assert.deepEqual(result.run.usage, finished.usage);
		assert.equal((await runs.status({ id: failed.id }, TEST)).error, "quota exceeded");
		runs.release();
		settings.release();
	} finally {
		await fixture.close();
	}
});
