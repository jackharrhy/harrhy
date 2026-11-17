// Real Rex on its own private socket/state and a fake-provider p2: target attachment without another agent run.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { BACKGROUND_CONTEXT } from "@p2/app/v1";
import { RexCli } from "../../plugins/rex/cli.ts";
import { type RexState, RexStore } from "../../plugins/rex/config.ts";
import { readReceipt, receiptPath } from "../../plugins/rex/receipt.ts";
import { reconcile } from "../../plugins/rex/reconcile.ts";
import { routes } from "../../plugins/rex/routing.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { SessionStatus } from "../../plugins/status/contract.ts";
import { APP, holdIn, poll, startFixture, until } from "./helpers.ts";

const exec = promisify(execFile);
let available = true;
try {
	await exec("rex", ["version"]);
} catch {
	available = false;
}

test(
	"Rex attaches existing p2 sessions, reconciles lifecycle, and preserves unmanaged panes",
	{ skip: !available, timeout: 120_000 },
	async (t) => {
		const directory = await mkdtemp(join(tmpdir(), "p2-rex-integration-"));
		const config = join(directory, "init.lua");
		await writeFile(config, "");
		const endpoint = `unix://${join(directory, "rex.sock")}`;
		const server = spawn(
			"rex",
			[
				"server",
				"run",
				"--listen",
				endpoint,
				"--state-dir",
				join(directory, "state"),
				"--config",
				config,
				"--restore=false",
			],
			{ stdio: "ignore" },
		);
		let closeP2: (() => Promise<void>) | undefined;
		t.after(async () => {
			await closeP2?.();
			if (server.exitCode === null) {
				const ended = once(server, "exit");
				server.kill();
				await ended;
			}
			await rm(directory, { recursive: true, force: true });
		});
		const cli = new RexCli({ endpoint });
		let identity: Awaited<ReturnType<RexCli["identity"]>> | undefined;
		for (let attempt = 0; attempt < 50 && !identity; attempt++) {
			try {
				identity = await cli.identity();
			} catch {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}
		assert(identity, "disposable Rex started");
		const created = JSON.parse(
			(
				await exec("rex", [
					"--autostart=false",
					"-S",
					endpoint,
					"new",
					"Fixture",
					"--shell=none",
					"--json",
					"--",
					"/bin/cat",
				])
			).stdout,
		);
		const target: string = created.session_id;
		const probe = join(directory, "probe.mjs");
		const probeResult = join(directory, "probe.json");
		await writeFile(
			probe,
			`import {writeFileSync} from 'node:fs'; writeFileSync(process.argv[2], JSON.stringify({session:process.env.REX_SESSION, block:process.env.REX_BLOCK, server:process.env.REX_SERVER}));`,
		);
		const probePane = await cli.create({
			sessionId: target,
			label: "Environment probe",
			cwd: directory,
			command: [process.execPath, probe, probeResult],
		});
		await poll(async () => {
			try {
				await readFile(probeResult);
				return true;
			} catch {
				return false;
			}
		});
		const environment = JSON.parse(await readFile(probeResult, "utf8"));
		assert.equal(environment.session, target);
		assert.equal(environment.block, probePane.blockId);
		// REX_SERVER is absent on some installed versions; only these documented IDs are required.
		await cli.close(target, probePane.blockId);
		const fixture = await startFixture();
		closeP2 = () => fixture.close();
		const sessions = await holdIn(fixture.browser(), Sessions, {}, "owner");
		const first = await sessions.create({ cwd: fixture.workspace, title: "Unrelated session" }, BACKGROUND_CONTEXT);
		const selected = await sessions.create({ cwd: fixture.workspace, title: "Rex exact target" }, BACKGROUND_CONTEXT);
		const before = sessions.sessions.value.length;
		const pane = await cli.create({
			sessionId: target,
			label: "TUI attach fixture",
			cwd: APP,
			command: [
				"/usr/bin/env",
				`P2_DATA_DIR=${fixture.dataDir}`,
				process.execPath,
				"--import",
				join(APP, "src/source.ts"),
				join(APP, "src/hosts/tui.ts"),
				`http://127.0.0.1:${fixture.server.port}`,
				"--session",
				selected.id,
			],
		});
		let screen = "";
		for (let attempt = 0; attempt < 100; attempt++) {
			screen = (
				await exec("rex", [
					"--autostart=false",
					"-S",
					endpoint,
					"capture",
					"-s",
					target,
					"-b",
					pane.blockId,
					"--trim",
				])
			).stdout;
			if (screen.includes("Rex exact target")) break;
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
		const status = await holdIn(fixture.browser(), SessionStatus, {}, "reader");
		await until(status.statuses, (rows) => rows[selected.id]?.running === true);
		status.release();
		assert.match(screen, /Rex exact target/);
		assert(!screen.includes("Unrelated session"), "opened chat rather than the picker");
		assert.equal(sessions.sessions.value.length, before, "no session was created by attachment");
		assert(sessions.sessions.value.some((row) => row.id === first.id));
		const view = await cli.view(target);
		assert.equal(view?.blocks.length, 2, "original fixture block preserved");
		// Real target transition: old exact viewer closes before a fresh project-bound receipt/launch.
		const projectTarget: string = JSON.parse(
			(
				await exec("rex", [
					"--autostart=false",
					"-S",
					endpoint,
					"api",
					"call",
					"session.create",
					JSON.stringify({ label: "Project" }),
				])
			).stdout,
		).session_id;
		const grouped = { endpoint, hostId: identity.hostId, sessionId: target, projects: { rea: projectTarget } };
		const groupState: RexState = { namespace: "00000000-0000-4000-8000-000000000001", targets: {} };
		const groupRows = [{ id: selected.id, title: "Grouped viewer", archivedAt: null as number | null }];
		const pass = async (membership: Record<string, string>) => {
			const plan = routes(grouped, groupState, groupRows, membership);
			const budget = { remaining: 1 };
			for (const route of plan.targets)
				await reconcile(
					cli,
					route.config,
					groupState,
					route.sessions,
					{ app: APP, dataDir: fixture.dataDir, url: `http://127.0.0.1:${fixture.server.port}` },
					async () => {},
					() => {},
					budget,
				);
		};
		await pass({});
		const oldMapping = groupState.targets[JSON.stringify([endpoint, identity.hostId, target])]![selected.id]!;
		const oldBlock = oldMapping.blockId!;
		await pass({ [selected.id]: "rea" });
		assert.equal(oldMapping.blockId, oldBlock, "membership changes keep viewers sticky");
		assert.equal(oldMapping.relocationNeeded, projectTarget);
		oldMapping.phase = "relocating";
		oldMapping.destination = projectTarget;
		await pass({ [selected.id]: "rea" });
		assert(!(await cli.view(target))!.blocks.some((b) => b.blockId === oldBlock));
		assert.equal((await cli.view(projectTarget))!.blocks.length, 0, "no new launch in the close pass");
		await pass({ [selected.id]: "rea" });
		const newMapping = groupState.targets[JSON.stringify([endpoint, identity.hostId, projectTarget])]![selected.id]!;
		assert.notEqual(newMapping.blockId, oldBlock);
		await poll(async () => Boolean(await readReceipt(receiptPath(fixture.dataDir, newMapping.nonce!))));
		assert.equal((await readReceipt(receiptPath(fixture.dataDir, newMapping.nonce!)))!.sessionId, projectTarget);
		assert.equal((await cli.view(projectTarget))!.blocks.length, 1);
		assert.equal(sessions.sessions.value.length, before);
		await cli.close(projectTarget, newMapping.blockId!);
		await pass({});
		assert.equal(newMapping.phase, "suppressed", "manual close remains suppressed after membership changes");
		assert.equal((await cli.view(target))!.blocks.length, 2, "unmanaged panes untouched by project migration");
		await writeFile(
			join(fixture.dataDir, "rex.json"),
			JSON.stringify({
				endpoint,
				hostId: identity.hostId,
				sessionId: target,
				projects: { missing: "session:00000000-0000-4000-8000-000000000099" },
			}),
			{ mode: 0o600 },
		);
		const mirror = new RexStore(fixture.dataDir);
		const mappings = async () =>
			Object.values((await mirror.load()).targets)
				.flatMap((target) => Object.values(target))
				.filter((mapping) => mapping.phase === "open");
		const managed = async () => {
			const ids = new Set((await mappings()).map((mapping) => mapping.blockId));
			return (await cli.view(target))!.blocks.filter((block) => ids.has(block.blockId));
		};
		await poll(async () => (await managed()).length === 2, 45_000);
		assert.equal((await cli.view(target))?.blocks.length, 4, "the optional plugin preserves both unmanaged panes");
		assert.equal(
			await cli.view("session:00000000-0000-4000-8000-000000000099"),
			undefined,
			"a missing configured target is not recreated while healthy targets progress",
		);
		// Receipts bind the verified host/target and nonce to the real Rex environment's block ID.
		await poll(
			async () =>
				(
					await Promise.all(
						(
							await mappings()
						).map(async (mapping) => {
							const receipt = await readReceipt(receiptPath(fixture.dataDir, mapping.nonce!));
							return (
								receipt?.blockId === mapping.blockId &&
								receipt?.sessionId === target &&
								receipt?.hostId === identity.hostId &&
								receipt?.endpoint === endpoint
							);
						}),
					)
				).every(Boolean),
			10_000,
		);
		const managedSelected = (await managed()).find((block) => block.label === "Rex exact target")!;
		const managedFirst = (await managed()).find((block) => block.label === "Unrelated session")!;
		assert.equal(managedSelected.windowLabel, "Rex exact target");
		await sessions.archive({ id: selected.id }, BACKGROUND_CONTEXT);
		await poll(async () => !(await managed()).some((block) => block.blockId === managedSelected.blockId), 35_000);
		assert(
			(await cli.view(target))!.blocks.some((block) => block.blockId === pane.blockId),
			"archive does not close an unmanaged view of the same p2 session",
		);
		await sessions.restore({ id: selected.id }, BACKGROUND_CONTEXT);
		await poll(async () => (await managed()).some((block) => block.label === "Rex exact target"), 35_000);
		await cli.close(target, managedFirst.blockId);
		// A catalog change wakes reconciliation; it must not fight a manually closed managed pane.
		await sessions.rename({ id: first.id, title: "Manually closed session" }, BACKGROUND_CONTEXT);
		await new Promise((resolve) => setTimeout(resolve, 1500));
		assert(!(await managed()).some((block) => block.label === "Manually closed session"));
		assert.equal(sessions.sessions.value.length, before, "mirroring did not create agent sessions");
		await cli.close(target, pane.blockId);
	},
);
