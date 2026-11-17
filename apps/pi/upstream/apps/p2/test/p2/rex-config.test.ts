// Private configuration and mapping persistence use only disposable directories.
import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { RexStore, readConfig } from "../../plugins/rex/config.ts";

test("absent config is off, config is private, mappings survive reopening", async (t) => {
	const directory = await mkdtemp(join(tmpdir(), "p2-rex-config-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	assert.equal(await readConfig(directory), undefined);
	const config = {
		sessionId: "session:00000000-0000-4000-8000-000000000001",
		hostId: "00000000-0000-4000-8000-000000000002",
		endpoint: "unix:///tmp/disposable.sock",
		projects: { rea: "session:00000000-0000-4000-8000-000000000003" },
	};
	const path = join(directory, "rex.json");
	await writeFile(path, JSON.stringify(config), { mode: 0o600 });
	assert.deepEqual(await readConfig(directory), config);
	await writeFile(path, JSON.stringify({ ...config, projects: { rea: "not-a-session" } }));
	await assert.rejects(readConfig(directory), /Invalid rex.json/);
	await chmod(path, 0o644);
	await assert.rejects(readConfig(directory), /0600/);
	const store = new RexStore(directory);
	const state = await store.load();
	state.targets.target = { session: { phase: "relocating", blockId: "exact-old", destination: config.projects.rea } };
	await store.save(state);
	assert.deepEqual(await new RexStore(directory).load(), state);
	await writeFile(store.path, "{}");
	await assert.rejects(store.load(), /Invalid/);
});
