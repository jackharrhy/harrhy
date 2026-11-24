// What a run may do, decided before Cursor sees anything: the owner's settings against what the agent asked for. The one
// place that says where a local run may work, which repositories a cloud run may use and when files may change.
import type { ModelInfo, StartSpec } from "./client.ts";
import type { Mode, Runtime, SandboxMode, StartArgs } from "./contract.ts";
import { MODEL_PATTERN, REPO_PATTERN } from "./limits.ts";
import { resolveBelow } from "./local-policy.ts";
import { modelLabel, type Resolved, resolveModel } from "./models.ts";

/** The owner's choices (Settings › Cursor) that decide a run. */
export type Policy = {
	model: string;
	runtime: Runtime;
	repos: readonly string[];
	allowLocalEdits: boolean;
	allowCloudEdits: boolean;
	/** Absent in settings stored before the sandbox choice existed: `when-possible`. */
	sandbox?: SandboxMode;
};

export type Plan = {
	runtime: Runtime;
	mode: Mode;
	spec: StartSpec;
	/** Local runs: the session's real directory and the real directory the agent works in. */
	base?: string;
	cwd?: string;
	repo?: string;
	branch?: string;
	/** The model as a run's view shows it, parameters included. */
	model?: string;
	sandbox: SandboxMode;
};

const REPO = new RegExp(REPO_PATTERN);
const MODEL = MODEL_PATTERN;
/** A branch name for git, without anything that makes it an option, a revision expression or a path escape. */
const BRANCH = /^(?!-)(?!.*\.\.)(?!.*[\s~^:?*[\\])[^\p{C}]{1,255}$/u;

/** Whether `repo` is allowed by `patterns`: `owner/name` or `owner/*`, case-insensitive. */
export function repoAllowed(repo: string, patterns: readonly string[]): boolean {
	const lower = repo.toLowerCase();
	return patterns.some((pattern) => {
		const wanted = pattern.toLowerCase();
		return wanted.endsWith("/*") ? lower.startsWith(wanted.slice(0, -1)) : wanted === lower;
	});
}

/** The plan for a request, or the reason it is refused (an Error whose message is for the agent). */
export async function plan(args: Omit<StartArgs, "runId">, policy: Policy, models?: readonly ModelInfo[]): Promise<Plan> {
	const runtime = args.runtime ?? policy.runtime;
	const mode = args.mode ?? "ask";
	const name = args.model ?? (policy.model || undefined);
	if (name !== undefined && !MODEL.test(name)) throw new Error("That is not a model id");
	let chosen: Resolved | undefined;
	if (name !== undefined) {
		// The live list decides; when it cannot be had, the name goes to Cursor as it is and Cursor decides.
		if (models !== undefined && models.length > 0) chosen = resolveModel(name, args.modelParams, models);
		else if (args.modelParams !== undefined && Object.keys(args.modelParams).length > 0)
			throw new Error("The model list is not available, so model parameters cannot be checked: try again, or leave them out");
		else chosen = { id: name, params: [] };
	}
	const model = chosen === undefined ? undefined : modelLabel(chosen);
	const modelSpec = chosen === undefined ? {} : { model: chosen.id, ...(chosen.params.length ? { modelParams: chosen.params } : {}) };
	const sandbox = policy.sandbox ?? "when-possible";
	if (runtime === "cloud") {
		if (args.path !== undefined) throw new Error("`path` is for local runs: a cloud run works on a repository, not a directory");
		if (args.repo === undefined) throw new Error("A cloud run needs `repo` (owner/name)");
		if (!REPO.test(args.repo)) throw new Error("`repo` is owner/name");
		if (!repoAllowed(args.repo, policy.repos))
			throw new Error(`${args.repo} is not a repository cloud agents may use: the owner can allow it in Settings › Cursor`);
		if (args.branch !== undefined && !BRANCH.test(args.branch)) throw new Error("That is not a usable branch name");
		if (mode === "agent" && !policy.allowCloudEdits)
			throw new Error("Cloud agents may not change repositories (agent mode): the owner can allow it in Settings › Cursor. Use mode `plan` or `ask`");
		// Cloud agents have no read-only `ask`: a plan is the closest, and it changes nothing.
		const cloudMode = mode === "agent" ? "agent" : "plan";
		return {
			runtime,
			mode,
			sandbox,
			repo: args.repo,
			...(args.branch === undefined ? {} : { branch: args.branch }),
			...(model === undefined ? {} : { model }),
			spec: {
				runtime: "cloud",
				prompt: args.prompt,
				mode: cloudMode,
				repo: args.repo,
				...(args.branch === undefined ? {} : { branch: args.branch }),
				...modelSpec,
			},
		};
	}
	if (args.repo !== undefined || args.branch !== undefined) throw new Error("`repo` and `branch` are for cloud runs; a local run works in this session's directory");
	if (args.env !== null) throw new Error(`This session works on ${args.env}, not on the Pi server: local Cursor runs work only on the server's machine. Use a cloud run`);
	if (mode === "agent" && !policy.allowLocalEdits)
		throw new Error("Local agents may not edit files (agent mode): the owner can allow it in Settings › Cursor. Use mode `ask` or `plan`");
	if (chosen === undefined || model === undefined) throw new Error("No model: the owner can choose a default in Settings › Cursor, or pass `model`");
	const { base, cwd } = await resolveBelow(args.cwd, args.path);
	return {
		runtime,
		mode,
		base,
		cwd,
		model,
		sandbox,
		spec: { runtime: "local", prompt: args.prompt, model: chosen.id, ...(chosen.params.length ? { modelParams: chosen.params } : {}), cwd, mode, sandbox: mode === "agent" && sandbox !== "off" },
	};
}
