import type { ModelInfo, StartSpec } from "./client.ts";
import type { StartArgs } from "./contract.ts";
import { MODEL_PATTERN, REPO_PATTERN } from "./limits.ts";
import { modelLabel, type Resolved, resolveModel } from "./models.ts";

/** The owner's choices (Settings › Cursor) that decide a run. */
export type Policy = {
	model: string;
	repos: readonly string[];
	allowCloudEdits: boolean;
};

const REPO = new RegExp(REPO_PATTERN);
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
export function plan(args: Omit<StartArgs, "runId">, policy: Policy, models?: readonly ModelInfo[]): { spec: StartSpec; model?: string } {
	const mode = args.mode ?? "plan";
	const name = args.model ?? (policy.model || undefined);
	if (name !== undefined && !MODEL_PATTERN.test(name)) throw new Error("That is not a model id");
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
	if (!REPO.test(args.repo)) throw new Error("`repo` is owner/name");
	if (!repoAllowed(args.repo, policy.repos))
		throw new Error(`${args.repo} is not a repository cloud agents may use: the owner can allow it in Settings › Cursor`);
	if (args.branch !== undefined && !BRANCH.test(args.branch)) throw new Error("That is not a usable branch name");
	if (mode === "agent" && !policy.allowCloudEdits)
		throw new Error("Cloud agents may not change repositories (agent mode): the owner can allow it in Settings › Cursor. Use mode `plan`");
	return {
		...(model === undefined ? {} : { model }),
		spec: {
			prompt: args.prompt,
			mode,
			repo: args.repo,
			...(args.branch === undefined ? {} : { branch: args.branch }),
			...modelSpec,
		},
	};
}
