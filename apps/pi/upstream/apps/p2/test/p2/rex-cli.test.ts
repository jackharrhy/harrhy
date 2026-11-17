// The Rex CLI adapter against a disposable executable: external JSON, safe argv, identity, missing targets and events.
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { RexCli } from "../../plugins/rex/cli.ts";

const uuid = "00000000-0000-4000-8000-000000000001";
const session = `session:${uuid}`;
const block = `block:${uuid}`;
const window = `window:${uuid}`;
const endpoint = "unix:///tmp/p2-rex-disposable.sock";

async function fixture(t: TestContext) {
	const directory = await mkdtemp(join(tmpdir(), "p2-rex-cli-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const config = join(directory, "response.json");
	const calls = join(directory, "calls.jsonl");
	const binary = join(directory, "rex");
	await writeFile(
		binary,
		`#!${process.execPath}
import { readFileSync, appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args) + '\\n');
const config = JSON.parse(readFileSync(${JSON.stringify(config)}, 'utf8'));
if (args.includes('events')) {
  process.stdout.write(config.event ?? '{"type":"block_closed"}\\n');
  setTimeout(() => process.exit(0), 50);
} else if (config.failure) {
  console.error(config.failure);
  process.exit(1);
} else if (config.raw) process.stdout.write(config.raw);
else if (args.includes('whoami')) console.log(JSON.stringify(config.identity));
else if (args.includes('describe')) console.log(JSON.stringify({name:args[args.indexOf('describe')+1]}));
else if (args.includes('session.view')) console.log(JSON.stringify(config.view));
else if (args.includes('session.new_window')) console.log(JSON.stringify(config.created));
else console.log('{}');
`,
	);
	await chmod(binary, 0o700);
	const value = {
		identity: {
			principal: { kind: "peer", transport: "unix", uid: process.getuid!() },
			endpoint,
			host_id: uuid,
			instance_id: uuid,
		},
		view: {
			session_id: session,
			windows: [{ window_id: window, layers: [{ blocks: [{ block_id: block, label: "Existing Logs" }] }] }],
		},
		created: { block_ids: [block], window_id: window },
	};
	await writeFile(config, JSON.stringify(value));
	return { client: new RexCli({ binary, endpoint }), config, calls, value };
}

test("Rex verifies the local identity/capabilities and never autostarts or relies on inherited target", async (t) => {
	const f = await fixture(t);
	assert.deepEqual(await f.client.identity(), { hostId: uuid, instanceId: uuid, endpoint });
	const calls: string[][] = (await readFile(f.calls, "utf8"))
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
	assert.equal(calls.length, 6);
	await f.client.identity();
	assert.equal(
		(await readFile(f.calls, "utf8")).trim().split("\n").length,
		7,
		"capabilities are checked once per server instance",
	);
	for (const args of calls)
		assert.deepEqual(args.slice(0, 5), ["--autostart=false", "--timeout", "5s", "-S", endpoint]);
	for (const identity of [
		{ ...f.value.identity, endpoint: "unix:///wrong.sock" },
		{ ...f.value.identity, principal: { ...f.value.identity.principal, uid: process.getuid!() + 1 } },
		{ ...f.value.identity, principal: { ...f.value.identity.principal, transport: "tailscale" } },
	]) {
		await writeFile(f.config, JSON.stringify({ ...f.value, identity }));
		await assert.rejects(f.client.identity(), /same-user local Unix/);
	}
});

test("Rex keeps arguments literal, creates background tabs and closes only exact blocks", async (t) => {
	const f = await fixture(t);
	assert.deepEqual(await f.client.view(session), {
		blocks: [{ blockId: block, windowId: window, label: "Existing Logs", windowLabel: "" }],
	});
	const label = 'p2 $(touch /tmp/never) "quoted"';
	const command = ["/usr/bin/env", "P2_DATA_DIR=/private path", "/node", "--session", uuid];
	assert.deepEqual(await f.client.create({ sessionId: session, label, command, cwd: "/safe path" }), {
		blockId: block,
		windowId: window,
	});
	await f.client.rename(session, block, label);
	await f.client.renameWindow(session, window, label);
	await f.client.close(session, block);
	const calls: string[][] = (await readFile(f.calls, "utf8"))
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
	const create = calls.find((args) => args.includes("session.new_window"))!;
	const input = JSON.parse(create.at(-1)!);
	assert.equal(input.focus, false);
	assert.equal(input.window_label, label);
	assert.deepEqual(input.layout.block.options.command, command);
	assert.equal(input.layout.block.options.shell, "none");
	assert.equal(input.layout.block.options.exit.on_completion, false);
	assert.deepEqual(JSON.parse(calls.at(-1)!.at(-1)!), { session_id: session, block_id: block });
});

test("Rex rejects malformed results and redacts errors; missing target is distinct", async (t) => {
	const f = await fixture(t);
	await writeFile(f.config, JSON.stringify({ failure: "session_not_found" }));
	assert.equal(await f.client.view(session), undefined);
	await writeFile(f.config, JSON.stringify({ failure: "secret-owner-token" }));
	await assert.rejects(
		f.client.create({ sessionId: session, label: "x", command: ["node"], cwd: "/tmp" }),
		(error) => {
			assert(error instanceof Error);
			assert(!error.message.includes("secret-owner-token"));
			return true;
		},
	);
	await writeFile(f.config, JSON.stringify({ raw: "not-json" }));
	await assert.rejects(f.client.view(session), /Invalid JSON/);
	await writeFile(f.config, JSON.stringify({ ...f.value, created: { block_ids: ["wrong"], window_id: window } }));
	await assert.rejects(
		f.client.create({ sessionId: session, label: "x", command: ["node"], cwd: "/tmp" }),
		/Invalid Rex pane creation/,
	);
});

test("Rex event stream delivers changes and reports disconnect once", async (t) => {
	const f = await fixture(t);
	let changes = 0;
	let failures = 0;
	await new Promise<void>((resolve) => {
		const stop = f.client.events(
			session,
			() => changes++,
			() => {
				failures++;
				stop();
				resolve();
			},
		);
	});
	assert.equal(changes, 1);
	assert.equal(failures, 1);
});
