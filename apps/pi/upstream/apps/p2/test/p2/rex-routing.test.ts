// Fixed target routing preserves existing ownership, suppression and explicit close-before-create transitions.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { RexConfig, RexState } from "../../plugins/rex/config.ts";
import { routes } from "../../plugins/rex/routing.ts";

const fallback = `session:${randomUUID()}`;
const project = `session:${randomUUID()}`;
const config: RexConfig = {
	endpoint: "unix:///tmp/rex.sock",
	hostId: randomUUID(),
	sessionId: fallback,
	projects: { rea: project },
};
const key = (id: string) => JSON.stringify([config.endpoint, config.hostId, id]);
const rows = [
	{ id: "a", archivedAt: null },
	{ id: "b", archivedAt: null },
];

test("new sessions route by membership, not folders; existing and suppressed viewers are sticky", () => {
	const state: RexState = { namespace: randomUUID(), targets: {} };
	let plan = routes(config, state, rows, { a: "rea" });
	assert.deepEqual(
		plan.targets.map((t) => [t.config.sessionId, t.sessions.map((s) => s.id)]),
		[
			[fallback, ["b"]],
			[project, ["a"]],
		],
	);
	state.targets[key(fallback)] = { a: { phase: "open", blockId: "exact" }, b: { phase: "suppressed" } };
	plan = routes(config, state, rows, { a: "rea", b: "rea" });
	assert.equal(plan.notices.length, 2);
	assert.deepEqual(plan.targets[0]!.sessions, rows);
	assert.equal(routes(config, state, rows, { a: "rea", b: "rea" }).notices.length, 0);
	assert.equal(state.targets[key(fallback)]!.b!.phase, "suppressed");
	state.targets[key(fallback)]!.b!.phase = "archived";
	plan = routes(config, state, rows, { a: "rea", b: "rea" });
	assert.deepEqual(plan.targets.find((t) => t.config.sessionId === project)!.sessions, [rows[1]]);
});

test("removed project targets retain sticky ownership; explicit relocation releases only after archived", () => {
	const state: RexState = {
		namespace: randomUUID(),
		targets: { [key(fallback)]: { a: { phase: "relocating", blockId: "exact", destination: project } } },
	};
	assert.deepEqual(routes(config, state, rows, { a: "rea" }).targets[0]!.sessions, rows);
	assert.throws(() => routes(config, state, rows, {}), /destination no longer matches/);
	state.targets[key(fallback)]!.a!.phase = "archived";
	assert.deepEqual(routes(config, state, rows, { a: "rea" }).targets[1]!.sessions, [rows[0]]);
	state.targets[key(project)] = { a: { phase: "pending", nonce: randomUUID() } };
	const plan = routes({ ...config, projects: {} }, state, rows, {});
	assert.deepEqual(plan.targets.find((t) => t.config.sessionId === project)!.sessions, [rows[0]]);
	assert.equal(plan.notices.length, 1);
});

test("duplicate active ownership and malformed persisted target keys refuse routing", () => {
	const state: RexState = {
		namespace: randomUUID(),
		targets: { [key(fallback)]: { a: { phase: "open" } }, [key(project)]: { a: { phase: "pending" } } },
	};
	assert.throws(() => routes(config, state, rows, {}), /Multiple Rex mappings/);
	state.targets = { bad: {} };
	assert.throws(() => routes(config, state, rows, {}));
});
