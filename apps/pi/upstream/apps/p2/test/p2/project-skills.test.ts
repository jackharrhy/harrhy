// Project skill discovery and real filesystem observer updates, without a model or network.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as paths from "node:path";
import { type TestContext, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import {
	type LoadedPrompt,
	loadPromptResources,
	localFiles,
	projectSkillRoots,
} from "../../plugins/prompt/context-files.ts";
import { envFiles, promptObserver } from "../../plugins/prompt/environment.ts";

function fixture(t: TestContext) {
	const root = mkdtempSync(paths.join(tmpdir(), "p2-project-skills-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const cwd = paths.join(root, "repo", "packages", "app");
	const data = paths.join(root, "data");
	mkdirSync(cwd, { recursive: true });
	mkdirSync(data);
	return { root, cwd, data, repo: paths.join(root, "repo") };
}

function write(path: string, content: string) {
	mkdirSync(paths.dirname(path), { recursive: true });
	writeFileSync(path, content);
}

function skill(root: string, name: string, description = name, body = "PRIVATE BODY") {
	const path = paths.join(root, name, "SKILL.md");
	write(path, `---\nname: ${name}\ndescription: ${description}\n---\n${body}`);
	return path;
}

for (const marker of ["file", "directory"] as const) {
	test(`nearest .git ${marker} stops ancestor skills; nearest cwd wins`, async (t) => {
		const { root, cwd, data, repo } = fixture(t);
		if (marker === "file") write(paths.join(repo, ".git"), "gitdir: elsewhere");
		else mkdirSync(paths.join(repo, ".git"));
		skill(paths.join(root, ".agents", "skills"), "outside");
		skill(paths.join(repo, ".agents", "skills"), "same", "repository");
		skill(paths.join(repo, ".agents", "skills"), "ancestor");
		const nearest = skill(paths.join(cwd, ".agents", "skills"), "same", "nearest");
		write(
			paths.join(cwd, ".agents", "skills", "group", "loose.md"),
			"---\nname: loose\ndescription: nested loose\n---\n",
		);
		const loaded = await loadPromptResources(data, cwd);
		assert.deepEqual(
			loaded.skillFiles.map((s) => s.name),
			["loose", "same", "ancestor"],
		);
		assert.equal(loaded.skillFiles.find((s) => s.name === "same")?.path, nearest);
	});
}

test("without .git discovery reaches the filesystem root", async (t) => {
	const { cwd } = fixture(t);
	const roots = await projectSkillRoots(localFiles, cwd);
	assert.equal(roots[0], paths.join(cwd, ".agents", "skills"));
	assert.equal(roots.at(-1), paths.join(paths.parse(cwd).root, ".agents", "skills"));
	assert.equal(roots.length, cwd.split(paths.sep).filter(Boolean).length + 1);
});

test("data then legacy then ancestors then shared; canonical dedup and locked provenance", async (t) => {
	const { root, repo, cwd, data } = fixture(t);
	mkdirSync(paths.join(repo, ".git"));
	const shared = paths.join(root, "shared");
	const dataRoot = paths.join(data, "skills");
	const legacy = paths.join(cwd, ".pi", "skills");
	const project = paths.join(cwd, ".agents", "skills");
	for (const base of [dataRoot, legacy, project, shared]) skill(base, "collision", base);
	for (const base of [legacy, project, shared]) skill(base, "legacy-wins", base);
	for (const base of [project, shared]) skill(base, "project-wins", base);
	const linked = skill(shared, "linked");
	mkdirSync(project, { recursive: true });
	symlinkSync(paths.dirname(linked), paths.join(project, "alias"));
	const alias = paths.join(root, "shared-alias");
	symlinkSync(shared, alias);
	const reads: string[] = [];
	const loaded = await loadPromptResources(
		data,
		cwd,
		{
			...localFiles,
			async readText(path) {
				reads.push(path);
				return localFiles.readText(path);
			},
		},
		undefined,
		undefined,
		[shared, alias],
	);
	assert.equal(loaded.skillFiles.find((s) => s.name === "collision")?.description, dataRoot);
	assert.equal(loaded.skillFiles.find((s) => s.name === "legacy-wins")?.description, legacy);
	assert.equal(loaded.skillFiles.find((s) => s.name === "project-wins")?.description, project);
	assert.equal(reads.filter((path) => path === linked).length, 1);
	assert.deepEqual(loaded.project?.skillFiles.map((s) => s.name).sort(), ["legacy-wins", "project-wins"]);
	assert.equal(
		loaded.project?.skillFiles.find((s) => s.name === "linked"),
		undefined,
	);
});

test("registered shared directory links work, cycles terminate, outside links are rejected", async (t) => {
	const { root, repo, cwd, data } = fixture(t);
	mkdirSync(paths.join(repo, ".git"));
	const project = paths.join(cwd, ".agents", "skills");
	const shared = paths.join(root, "shared");
	const outside = paths.join(root, "outside");
	const expected = skill(shared, "allowed");
	skill(outside, "forbidden");
	mkdirSync(project, { recursive: true });
	symlinkSync(shared, paths.join(project, "shared"));
	symlinkSync(project, paths.join(shared, "cycle"));
	symlinkSync(outside, paths.join(project, "outside"));
	const loaded = await loadPromptResources(data, cwd, localFiles, undefined, undefined, [shared]);
	assert.deepEqual(
		loaded.skillFiles.map((s) => s.path),
		[expected],
	);
	assert.deepEqual(loaded.project?.skillFiles, []);
});

test("a global root also found as an ancestor stays excluded from locked project skills", async (t) => {
	const { repo, cwd, data } = fixture(t);
	mkdirSync(paths.join(repo, ".git"));
	const shared = paths.join(repo, ".agents", "skills");
	const global = skill(shared, "global-ancestor");
	const project = skill(paths.join(cwd, ".agents", "skills"), "project-copy");
	const loaded = await loadPromptResources(data, cwd, localFiles, undefined, undefined, [shared]);
	assert.deepEqual(loaded.skillFiles.map((s) => s.path).sort(), [global, project].sort());
	assert.deepEqual(
		loaded.project?.skillFiles.map((s) => s.path),
		[project],
	);
});

for (const component of [".agents", "skills"] as const) {
	test(`discovered ${component} root symlinks cannot register outside trees`, async (t) => {
		const { root, repo, cwd, data } = fixture(t);
		mkdirSync(paths.join(repo, ".git"));
		const outside = paths.join(root, "outside");
		const target = component === ".agents" ? paths.join(outside, "skills") : outside;
		skill(target, "forbidden");
		const link = component === ".agents" ? paths.join(cwd, ".agents") : paths.join(cwd, ".agents", "skills");
		mkdirSync(paths.dirname(link), { recursive: true });
		symlinkSync(outside, link);
		const projectRoot = paths.join(cwd, ".agents", "skills");
		for (const files of [localFiles, envFiles(new NodeExecutionEnv({ cwd }), paths)]) {
			assert.equal((await projectSkillRoots(files, cwd)).includes(projectRoot), false);
			const loaded = await loadPromptResources(data, cwd, files);
			assert.deepEqual(loaded.skillFiles, []);
			assert.deepEqual(loaded.project?.skillFiles, []);
		}
	});
}

test("malformed and missing metadata are skipped; large bodies are never advertised", async (t) => {
	const { repo, cwd, data } = fixture(t);
	mkdirSync(paths.join(repo, ".git"));
	const project = paths.join(cwd, ".agents", "skills");
	write(paths.join(project, "bad", "SKILL.md"), "---\nname: [broken\n---\n");
	write(paths.join(project, "missing", "SKILL.md"), "---\nname: missing\n---\nBODY");
	write(paths.join(project, "empty", "SKILL.md"), "---\ndescription: ''\n---\n");
	mkdirSync(paths.join(project, "no-file"), { recursive: true });
	const expected = skill(project, "large", "metadata only", "SECRET_BODY".repeat(100_000));
	const loaded = await loadPromptResources(data, cwd);
	assert.deepEqual(
		loaded.skillFiles.map((s) => s.path),
		[expected],
	);
	assert.match(loaded.skills, /metadata only/);
	assert.doesNotMatch(loaded.skills, /SECRET_BODY/);
	assert.doesNotMatch(JSON.stringify(loaded.skillFiles), /SECRET_BODY/);
	assert.equal(loaded.project?.skills, loaded.skills);
});

test(
	"promptObserver notices creation, edit, deletion and recreation of nested ancestor directories",
	{ timeout: 30_000 },
	async (t) => {
		const { repo, cwd, data } = fixture(t);
		mkdirSync(paths.join(repo, ".git"));
		const env = new NodeExecutionEnv({ cwd });
		let latest: LoadedPrompt | undefined;
		let failure: string | undefined;
		const observer = promptObserver({
			env,
			directory: data,
			cwd,
			paths: async () => paths,
			skillsRoot: async () => paths.join(data, "skills"),
			fallbackMs: 60_000,
			apply(prompt, error) {
				latest = prompt;
				failure = error;
			},
		});
		t.after(() => observer.close());
		await observer.start();
		assert.deepEqual(latest?.skillFiles, []);
		const waitFor = async (description: string | undefined) => {
			const deadline = Date.now() + 5_000;
			while (Date.now() < deadline) {
				assert.equal(failure, undefined);
				if (latest?.skillFiles.find((s) => s.name === "observed")?.description === description) return;
				await delay(25);
			}
			assert.fail(`observer did not reach ${description ?? "deleted"}: ${JSON.stringify(latest?.skillFiles)}`);
		};
		const ancestor = paths.join(repo, "packages", ".agents");
		const root = paths.join(ancestor, "skills", "group", "nested");
		const file = skill(root, "observed", "created");
		await waitFor("created");
		write(file, "---\nname: observed\ndescription: edited\n---\nCHANGED BODY");
		await waitFor("edited");
		rmSync(ancestor, { recursive: true });
		await waitFor(undefined);
		skill(root, "observed", "recreated");
		await waitFor("recreated");
		const direct = await loadPromptResources(data, cwd, envFiles(env, paths));
		assert.deepEqual(latest?.skillFiles, direct.skillFiles);
	},
);
