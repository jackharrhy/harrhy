// Skill frontmatter/prompt conventions adapted from earendil-works/pi (MIT).
// See third-party/pi.LICENSE. Project .agents roots follow pi’s cwd-to-repository discovery boundary.
import { lstat, readdir, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, type PlatformPath, relative, resolve, sep } from "node:path";
import { optionalText, stripBom } from "@p2/app/v1/node";
import { type PromptTemplate, parseFrontmatter, parseTemplate, type SkillFile } from "./templates.ts";

/**
 * A session's loaded prompt resources: the instructions and skills sections, every skill (including those hidden from
 * the model with `disable-model-invocation`, which `/skill:` still invokes, as in pi) and the prompt templates.
 */
export type LoadedPrompt = {
	agents: string;
	skills: string;
	fingerprint: string;
	skillFiles: SkillFile[];
	templates: PromptTemplate[];
	/**
	 * The same without the global `AGENTS.md`, skills and prompt templates (only the project's): what a locked session
	 * gets unless its owner picked the global instructions.
	 */
	project?: Omit<LoadedPrompt, "project" | "fingerprint">;
};

type Skill = { name: string; description: string; path: string; disabled: boolean; global: boolean };

/**
 * Where project instructions and skills are read: the local filesystem, or a session's execution environment. Missing
 * files and directories are `undefined`; other failures throw.
 */
export type PromptFiles = {
	readonly paths: Pick<PlatformPath, "join" | "dirname" | "resolve" | "basename" | "relative" | "sep" | "isAbsolute">;
	/** Files of this machine (not an SSH environment's): the global `AGENTS.md` may be among the project's ones. */
	readonly local: boolean;
	readText(path: string): Promise<string | undefined>;
	exists(path: string): Promise<boolean>;
	canonical(path: string): Promise<string>;
	/** Entries of a directory, without following symbolic links. */
	entries(path: string): Promise<{ name: string; kind: "file" | "directory" | "symlink" | "other" }[] | undefined>;
};

/** The local filesystem. */
export const localFiles: PromptFiles = {
	paths: { join, dirname, resolve, basename, relative, sep, isAbsolute },
	local: true,
	readText: optionalText,
	canonical,
	async exists(path) {
		try {
			await lstat(path);
			return true;
		} catch (error) {
			if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
			throw error;
		}
	},
	async entries(path) {
		try {
			return (await readdir(path, { withFileTypes: true })).map((entry) => ({
				name: entry.name,
				kind: entry.isFile()
					? "file"
					: entry.isDirectory()
						? "directory"
						: entry.isSymbolicLink()
							? "symlink"
							: "other",
			}));
		} catch (error) {
			if (
				error &&
				typeof error === "object" &&
				"code" in error &&
				(error.code === "ENOENT" || error.code === "ENOTDIR")
			)
				return undefined;
			throw new Error("Could not scan skills directory");
		}
	},
};

function escapeXml(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

/** Project skill roots, nearest cwd first, stopping at the nearest .git file/directory or filesystem root. */
export async function projectSkillRoots(files: PromptFiles, cwd: string): Promise<string[]> {
	const roots: string[] = [];
	for (let path = files.paths.resolve(cwd); ; path = files.paths.dirname(path)) {
		const ancestor = await files.canonical(path);
		const agents = files.paths.join(ancestor, ".agents");
		const root = files.paths.join(agents, "skills");
		// Discovered roots cannot redirect the scan/watch to an arbitrary external tree. Explicit global/plugin
		// roots retain their existing symlink support; CLI links inside project roots are checked during descent.
		if ((await files.canonical(agents)) === agents && (await files.canonical(root)) === root) roots.push(root);
		if (await files.exists(files.paths.join(path, ".git"))) break;
		if (path === files.paths.dirname(path)) break;
	}
	return roots;
}

/**
 * A SKILL.md directory stops descent. Legacy roots accept loose .md files only at the root; .agents accepts them
 * below it, as pi's package manager does. Links may resolve only inside registered skill roots, where the observer
 * already watches changes. Canonical directory identities stop cycles; hidden and dependency trees stay excluded.
 */
async function skillFiles(
	files: PromptFiles,
	path: string,
	allowedRoots: readonly string[],
	mode: "pi" | "agents" = "pi",
	root = true,
	seen = new Set<string>(),
): Promise<string[]> {
	const identity = await files.canonical(path);
	if (seen.has(identity)) return [];
	seen.add(identity);
	const entries = await files.entries(path);
	if (!entries) return [];
	if (entries.some((entry) => entry.kind === "file" && entry.name === "SKILL.md"))
		return [files.paths.join(path, "SKILL.md")];
	const found: string[] = [];
	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
		const child = files.paths.join(path, entry.name);
		if (entry.kind === "directory") found.push(...(await skillFiles(files, child, allowedRoots, mode, false, seen)));
		else if (entry.kind === "symlink") {
			const target = await files.canonical(child);
			const contained = allowedRoots.some((allowed) => {
				const relative = files.paths.relative(allowed, target);
				return (
					!files.paths.isAbsolute(relative) &&
					relative.split(files.paths.sep).every((part) => !part.startsWith(".") && part !== "node_modules")
				);
			});
			// Only directory links are followed, never arbitrary external files or trees.
			if (contained) found.push(...(await skillFiles(files, target, allowedRoots, mode, false, seen)));
		} else if (entry.kind === "file" && entry.name.endsWith(".md") && (mode === "agents" ? !root : root))
			found.push(child);
	}
	return found;
}

/** Each `AGENTS.md` candidate from the filesystem root down to `cwd`. */
export function agentsCandidates(paths: Pick<PlatformPath, "join" | "dirname" | "resolve">, cwd: string): string[] {
	const ancestors: string[] = [];
	for (let path = paths.resolve(cwd); ; path = paths.dirname(path)) {
		ancestors.unshift(path);
		if (path === paths.dirname(path)) break;
	}
	return ancestors.map((path) => paths.join(path, "AGENTS.md"));
}

/**
 * Instructions and skills for a session: the global `AGENTS.md` of the data directory (always local), then the
 * project's `AGENTS.md` files and skills under `<directory>/skills` and `<cwd>/.pi/skills` on the local filesystem,
 * ancestor `.agents/skills` up to the nearest repository root, then shared and plugin skills (`pluginSkillRoots`,
 * given only on the server's own machine).
 * Canonical paths are read once. First name wins: environment, cwd .pi, .agents nearest-first, shared, then plugins.
 */
export async function loadPromptResources(
	directory: string,
	cwd: string,
	files: PromptFiles = localFiles,
	skillsRoot = join(directory, "skills"),
	promptsRoot = join(directory, "prompts"),
	pluginSkillRoots: readonly string[] = [],
): Promise<LoadedPrompt> {
	const agents: { text: string; global: boolean }[] = [];
	const fingerprint: string[] = [];
	const read = async (path: string, from: PromptFiles, isGlobal = false) => {
		const content = await from.readText(path);
		fingerprint.push(`${path}\n${content ?? ""}`);
		if (content !== undefined) agents.push({ text: `## ${path}\n${stripBom(content)}`, global: isGlobal });
	};
	const global = join(directory, "AGENTS.md");
	await read(global, localFiles, true);
	// On this machine the global file is also a project's when the session works in p2's data directory (or below it,
	// `<data>/plugins`), maybe by another path (a symbolic link): read once, compared by canonical path. The same path
	// on a remote environment is another file.
	const globalFile = files.local ? await canonical(global) : undefined;
	for (const path of agentsCandidates(files.paths, cwd))
		if (globalFile === undefined || (await canonical(path)) !== globalFile) await read(path, files);
	const skills = new Map<string, Skill>();
	const globalRoots = [skillsRoot, ...pluginSkillRoots];
	const globalIdentities = await Promise.all(globalRoots.map((root) => files.canonical(root)));
	const ancestors = [];
	for (const root of await projectSkillRoots(files, cwd))
		if (!globalIdentities.includes(await files.canonical(root))) ancestors.push(root);
	const legacy = files.paths.join(cwd, ".pi", "skills");
	const allowedRoots = await Promise.all([...globalRoots, legacy, ...ancestors].map((root) => files.canonical(root)));
	const environmentSkills = await skillFiles(files, skillsRoot, allowedRoots);
	const projectSkills = [
		...(await skillFiles(files, legacy, allowedRoots)),
		...(await Promise.all(ancestors.map((root) => skillFiles(files, root, allowedRoots, "agents")))).flat(),
	];
	const pluginSkills = (
		await Promise.all(pluginSkillRoots.map((root) => skillFiles(files, root, allowedRoots)))
	).flat();
	// A project alias cannot turn an existing global file into project instructions for a locked session.
	const globalFiles = new Set(
		await Promise.all([...environmentSkills, ...pluginSkills].map((path) => files.canonical(path))),
	);
	const paths = [
		...environmentSkills.map((path) => ({ path, global: true })),
		...projectSkills.map((path) => ({ path, global: false })),
		...pluginSkills.map((path) => ({ path, global: true })),
	];
	const seen = new Set<string>();
	for (const { path: original, global } of paths) {
		const path = await files.canonical(original);
		if (seen.has(path)) continue;
		seen.add(path);
		const content = await files.readText(path);
		if (content === undefined) continue;
		fingerprint.push(`${path}\n${content}`);
		// pi's rules (`loadSkillFromFile`): a file whose frontmatter does not parse or has no description is skipped (a
		// README next to the skills, say); other spec violations, such as the name's characters or lengths, only warn in
		// pi and load here too. The name defaults to the parent directory's; the first skill of a name wins.
		let frontmatter: Record<string, unknown>;
		try {
			({ frontmatter } = parseFrontmatter(content));
		} catch {
			continue;
		}
		const description = frontmatter.description;
		if (typeof description !== "string" || !description.trim()) continue;
		const name =
			typeof frontmatter.name === "string" && frontmatter.name
				? frontmatter.name
				: files.paths.basename(files.paths.dirname(path));
		if (!skills.has(name))
			skills.set(name, {
				name,
				description,
				path,
				disabled: frontmatter["disable-model-invocation"] === true,
				global: global || globalFiles.has(path),
			});
	}
	// Prompt templates (pi's format): `.md` files directly in the global and the project's prompts directory. An
	// unreadable or invalid template is skipped (pi warns and goes on); symbolic links are not followed.
	const templates: PromptTemplate[] = [];
	for (const [root, source] of [
		[promptsRoot, "global"],
		[files.paths.join(cwd, ".pi", "prompts"), "project"],
	] as const) {
		const entries = (await files.entries(root)) ?? [];
		for (const entry of entries
			.filter((item) => item.kind === "file" && item.name.endsWith(".md"))
			.sort((a, b) => a.name.localeCompare(b.name))) {
			const path = files.paths.join(root, entry.name);
			const content = await files.readText(path).catch(() => undefined);
			if (content === undefined) continue;
			fingerprint.push(`${path}\n${content}`);
			try {
				const template = parseTemplate(entry.name, content, source, path);
				if (/^[^\s/]+$/.test(template.name)) templates.push(template);
			} catch {
				// Invalid frontmatter: skipped.
			}
		}
	}
	const assemble = (all: boolean) => {
		const kept = [...skills.values()].filter((skill) => all || !skill.global);
		const visible = kept.filter((skill) => !skill.disabled);
		return {
			agents: agents
				.filter((entry) => all || !entry.global)
				.map((entry) => entry.text)
				.join("\n\n"),
			skills:
				visible.length === 0
					? ""
					: [
							"Use the read tool to load a skill's file when the task matches its description.",
							"Resolve relative paths against the skill's directory.",
							"<available_skills>",
							...visible.map(
								(skill) =>
									`<skill><name>${escapeXml(skill.name)}</name><description>${escapeXml(skill.description)}</description><location>${escapeXml(skill.path)}</location></skill>`,
							),
							"</available_skills>",
						].join("\n"),
			skillFiles: kept.map(({ name, description, path }) => ({
				name,
				description,
				path,
				baseDir: files.paths.dirname(path),
			})),
			templates: templates.filter((template) => all || template.source !== "global"),
		};
	};
	return { ...assemble(true), fingerprint: fingerprint.join("\n\0\n"), project: assemble(false) };
}

/** `path` with symbolic links resolved on this machine; itself when it does not exist (nothing to read there). */
async function canonical(path: string): Promise<string> {
	return realpath(path).catch(() => path);
}
