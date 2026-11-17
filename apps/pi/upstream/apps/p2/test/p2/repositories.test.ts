// Disposable Git fixtures exercise registration parsing, counts, authorization and explicit-refresh observations.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { arr, bool, obj, str } from "@earendil-works/pi-schema";
import { BACKGROUND_CONTEXT, method, remote, serverHost, whenLive } from "@p2/app/v1";
import { Chat } from "../../plugins/chat/contract.ts";
import {
	AssociationSchema,
	LocatedV1Schema,
	ReadSchema,
	Repositories,
	SeedSchema,
	StatusSchema,
} from "../../plugins/repositories/contract.ts";
import {
	associateLocations,
	countStatus,
	localPath,
	parseTrees,
	readRepository,
	readStatus,
} from "../../plugins/repositories/git.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { expectChord, holdIn, startFixture, until } from "./helpers.ts";

const run = (cwd: string, ...args: string[]) =>
	execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

test("NUL records preserve unusual paths and count rename/untracked entries without filenames", () => {
	const trees = parseTrees(
		"worktree /repo\nwith space\0HEAD abc\0branch refs/heads/main\0\0worktree /repo\nwith space/nested\0HEAD def\0detached\0locked reason\0prunable gone\0\0",
	);
	assert.equal(trees[0]?.path, "/repo\nwith space");
	assert.equal(trees[1]?.locked, "reason");
	assert.deepEqual(countStatus("R  new\nname\0old name\0?? directory/\0 M tracked\0"), { tracked: 2, untracked: 1 });
	assert.deepEqual(countStatus(""), { tracked: 0, untracked: 0 });
	assert.throws(() => parseTrees("worktree bad\0"), /Malformed/);
	assert.throws(() => countStatus("R  target\0"), /rename/);
});

test("real linked/detached/locked/missing/bare registrations and status are read-only", async (t) => {
	const fixture = await startFixture({ plugins: ["devices"] });
	t.after(() => fixture.close());
	const root = fixture.workspace;
	run(root, "init", "-b", "main");
	run(
		root,
		"-c",
		"user.name=Test",
		"-c",
		"user.email=test@example.invalid",
		"commit",
		"--allow-empty",
		"-m",
		"initial",
	);
	const linked = join(root, "linked\nspace");
	run(root, "worktree", "add", "--detach", linked);
	run(root, "worktree", "lock", "--reason", "test lock", linked);
	const common = await localPath(join(root, ".git"));
	const observed = await readRepository(root, common, new AbortController().signal);
	assert.equal(observed.trees.length, 2);
	assert.equal(observed.trees[1]?.path, linked);
	assert.equal(observed.trees[1]?.detached, true);
	assert.equal(observed.trees[1]?.locked, "test lock");
	assert.equal(observed.trees[1]?.presence, "existing");
	mkdirSync(join(linked, "untracked"));
	writeFileSync(join(linked, "untracked", "private-name"), "not read");
	const status = await readStatus(linked, new AbortController().signal);
	assert.equal(status.untracked, 1);
	const alias = join(root, "alias");
	symlinkSync(linked, alias);
	const locations = [root, join(alias, "untracked"), join(root, "absent")].map((cwd, index) => ({
		session: "fixture",
		conversation: index + 1,
		title: "Fixture",
		env: null,
		cwd,
		archived: false,
		activity: "Stopped",
	}));
	const associated = await associateLocations(locations, observed.trees, common, new AbortController().signal);
	assert.deepEqual(
		associated.map((row) => row.tree),
		[root, linked, null],
	);
	assert.equal(associated[1]?.qualification, "Resolved through a different path");
	assert.equal(associated[2]?.qualification, "Location could not be resolved");
	const ambiguous = await associateLocations(
		[locations[1]!],
		[...observed.trees, { ...observed.trees[1]!, path: alias }],
		common,
		new AbortController().signal,
	);
	assert.equal(ambiguous[0]?.tree, null);
	assert.equal(ambiguous[0]?.qualification, "Ambiguous registered paths");
	const nested = join(root, "nested");
	mkdirSync(nested);
	run(nested, "init", "-b", "main");
	const different = await associateLocations(
		[{ ...locations[0]!, cwd: nested }],
		observed.trees,
		common,
		new AbortController().signal,
	);
	assert.equal(different[0]?.tree, null);
	assert.equal(different[0]?.qualification, "Different nested repository");
	assert.equal(JSON.stringify(status).includes("private-name"), false);
	rmSync(linked, { recursive: true });
	const missing = await readRepository(root, common, new AbortController().signal);
	assert.equal(missing.trees[1]?.path, linked);
	assert.equal(missing.trees[1]?.presence, "missing");
	assert.equal(missing.trees[1]?.prunable, undefined); // Locked missing registrations are not prunable.
	run(root, "worktree", "unlock", linked);
	const prunable = await readRepository(root, common, new AbortController().signal);
	assert.equal(prunable.trees[1]?.presence, "missing");
	assert.ok(prunable.trees[1]?.prunable);
	run(root, "worktree", "prune");
	assert.equal((await readRepository(root, common, new AbortController().signal)).trees.length, 1);
	const bare = join(root, "bare.git");
	run(root, "init", "--bare", bare);
	assert.equal((await readRepository(bare, bare, new AbortController().signal)).trees[0]?.bare, true);
	const cancelled = new AbortController();
	cancelled.abort();
	await assert.rejects(readRepository(root, common, cancelled.signal), /abort/i);
});

test("owner-only inventory derives known locations, validates scope, caches and retains last good reads", async (t) => {
	const fixture = await startFixture();
	t.after(() => fixture.close());
	const owner = fixture.browser();
	const sessions = await holdIn(owner, Sessions, {}, "owner");
	const root = fixture.workspace;
	run(root, "init", "-b", "main");
	const session = await sessions.create({ cwd: root, title: "Repository fixture" }, BACKGROUND_CONTEXT);
	const repositories = await holdIn(owner, Repositories, {}, "owner");
	const seeds = await until(repositories.seeds, (value) => value.some((seed) => seed.cwd === root));
	const seed = seeds.find((seed) => seed.cwd === root)!;
	assert.ok(repositories.locations.value.some((location) => location.session === session.id));
	await assert.rejects(
		repositories.inspect({ seed: "not-known", refresh: false }, BACKGROUND_CONTEXT),
		/location is no longer known/,
	);
	await assert.rejects(repositories.status({ seed: seed.id, tree: root }, BACKGROUND_CONTEXT), /not observed/);
	const first = await repositories.inspect({ seed: seed.id, refresh: false }, BACKGROUND_CONTEXT);
	assert.equal(first.failure, null);
	assert.equal(first.data?.trees.length, 1);
	const associations = await repositories.associate({ seed: seed.id }, BACKGROUND_CONTEXT);
	assert.equal(associations.find((row) => row.session === session.id)?.tree, root);
	const cached = await repositories.inspect({ seed: seed.id, refresh: false }, BACKGROUND_CONTEXT);
	assert.equal(cached.data?.checked, first.data?.checked);
	const clean = await repositories.status({ seed: seed.id, tree: root }, BACKGROUND_CONTEXT);
	assert.equal(clean.failure, null);
	renameSync(join(root, ".git"), join(root, "saved.git"));
	run(root, "init", "-b", "other", "--separate-git-dir", join(root, "other.git"));
	const replaced = await repositories.status({ seed: seed.id, tree: root }, BACKGROUND_CONTEXT);
	assert.match(replaced.failure ?? "", /another repository/);
	assert.equal(replaced.checked, clean.checked);
	rmSync(join(root, ".git"), { recursive: true });
	const failed = await repositories.inspect({ seed: seed.id, refresh: true }, BACKGROUND_CONTEXT);
	assert.ok(failed.failure);
	assert.deepEqual(failed.data, first.data);
	writeFileSync(
		join(fixture.dataDir, "projects.json"),
		JSON.stringify({
			remote: [{ env: "not-connected", path: "/never-inspect" }],
			missing: [{ path: join(root, "absent") }],
		}),
	);
	const configured = await until(repositories.seeds, (value) => value.some((entry) => entry.env === "not-connected"));
	const remote = configured.find((entry) => entry.env === "not-connected")!;
	await assert.rejects(
		repositories.inspect({ seed: remote.id, refresh: true }, BACKGROUND_CONTEXT),
		/Remote inspection unavailable/,
	);
	const missing = configured.find((entry) => entry.cwd.endsWith("/absent"))!;
	const missingRead = await repositories.inspect({ seed: missing.id, refresh: false }, BACKGROUND_CONTEXT);
	assert.equal(missingRead.data, null);
	assert.match(missingRead.failure ?? "", /ENOENT/);
	for (const access of ["view", "full"] as const) {
		const guest = fixture.as({
			kind: "guest",
			id: `guest-${access}`,
			name: "Guest",
			home: session.id,
			sessions: { [session.id]: access },
			revision: 1,
		});
		const ref = guest.hold(Repositories, {}, BACKGROUND_CONTEXT);
		await expectChord(whenLive(ref), "forbidden");
		ref.release();
	}
});

// The applied first slice's unchanged contract must keep binding after the additive inspector API ships.
const RepositoriesV1 = remote("p2.repositories", {
	version: 1,
	params: {},
	hostAddress: serverHost,
	variants: {
		owner: {
			state: { seeds: arr(SeedSchema), locations: arr(LocatedV1Schema) },
			methods: {
				inspect: method(obj({ seed: str(), refresh: bool() }), ReadSchema),
				associate: method(obj({ seed: str() }), arr(AssociationSchema)),
				status: method(obj({ seed: str(), tree: str() }), StatusSchema),
			},
		},
	},
});

test("linked context spans reported child locations, shared/unoccupied trees, explicit previews and v1 readers", async (t) => {
	const fixture = await startFixture();
	t.after(() => fixture.close());
	const root = fixture.workspace;
	run(root, "init", "-b", "main");
	run(
		root,
		"-c",
		"user.name=Test",
		"-c",
		"user.email=test@example.invalid",
		"commit",
		"--allow-empty",
		"-m",
		"initial",
	);
	const linked = join(root, "../linked");
	const unoccupied = join(root, "../unoccupied");
	run(root, "worktree", "add", "-b", "child", linked);
	run(root, "worktree", "add", "-b", "unoccupied", unoccupied);
	const owner = fixture.browser();
	const sessions = await holdIn(owner, Sessions, {}, "owner");
	const first = await sessions.create({ cwd: root, title: "First" }, BACKGROUND_CONTEXT);
	const second = await sessions.create({ cwd: root, title: "Second" }, BACKGROUND_CONTEXT);
	const chat = await holdIn(owner, Chat, { session: first.id, conversation: 1 }, "participant");
	await chat.send(
		{
			text: `subagent ${JSON.stringify({ action: "spawn", name: "Independent child", message: "hello child", cwd: linked, tools: ["read"] })}`,
			requestId: "context-child",
		},
		BACKGROUND_CONTEXT,
	);
	writeFileSync(
		join(fixture.dataDir, "work-context.json"),
		JSON.stringify({
			previews: [
				{
					id: "ui",
					name: "UI",
					url: "https://ui.example/",
					session: first.id,
					location: { env: null, cwd: linked },
				},
				{
					id: "published",
					name: "Published",
					url: "https://published.example/",
					session: second.id,
					nonExpiring: true,
				},
				{
					id: "remote",
					name: "Remote",
					url: "https://remote.example/",
					location: { env: "not-connected", cwd: "/not-inspected" },
				},
			],
		}),
	);
	const repositories = await holdIn(owner, Repositories, {}, "owner");
	const reported = await until(repositories.locations, (rows) =>
		rows.some((row) => row.title === "Independent child"),
	);
	const child = reported.find((row) => row.title === "Independent child")!;
	const metadata = await repositories.previews({ refresh: false }, BACKGROUND_CONTEXT);
	assert.equal(metadata.items.length, 3);
	const context = await repositories.context(
		{ scope: { kind: "session", id: first.id }, refresh: true },
		BACKGROUND_CONTEXT,
	);
	assert.equal(context.repositories.length, 1);
	assert.equal(context.repositories[0]?.trees.length, 3);
	assert.equal(
		context.associations.find((row) => row.session === first.id && row.conversation === child.conversation)?.tree,
		linked,
	);
	assert.equal(context.associations.find((row) => row.session === second.id)?.tree, root);
	assert.equal(context.previewTrees.find((row) => row.preview === "declared:ui")?.tree, linked);
	assert.equal(
		context.previewTrees.some((row) => row.preview === "declared:published"),
		false,
	);
	const all = await repositories.context({ scope: { kind: "all" }, refresh: true }, BACKGROUND_CONTEXT);
	assert.equal(all.repositories.length, 1);
	assert.ok(all.failures.some((failure) => failure.error.includes("Remote inspection unavailable")));
	await assert.rejects(
		repositories.context({ scope: { kind: "session", id: "unknown" }, refresh: false }, BACKGROUND_CONTEXT),
		/no longer known/,
	);
	await assert.rejects(
		repositories.context({ scope: { kind: "preview", id: "unknown" }, refresh: false }, BACKGROUND_CONTEXT),
		/no longer known/,
	);
	const old = await holdIn(owner, RepositoriesV1, {}, "owner");
	assert.ok(old.seeds.value.some((seed) => seed.cwd === root));
	old.release();
	const latestMetadata = await repositories.previews({ refresh: false }, BACKGROUND_CONTEXT);
	writeFileSync(join(fixture.dataDir, "work-context.json"), "{invalid");
	const failed = await repositories.previews({ refresh: true }, BACKGROUND_CONTEXT);
	assert.deepEqual(failed.items, metadata.items);
	assert.equal(failed.checked, latestMetadata.checked);
	assert.match(failed.failures[0] ?? "", /Invalid work-context/);
});
