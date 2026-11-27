// Where a local run may work and when it may change files. Used by policy.ts when a run is planned and again by the
// detached agent process before it starts the SDK, so neither trusts the other. Plain Node modules only.
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { LIMITS, MODEL_PATTERN } from "./limits.ts";
import type { WorkerRequest } from "./rundir.ts";

/** Whether `inner` is `outer` or below it (both real paths). */
export const within = (outer: string, inner: string) =>
	inner === outer || inner.startsWith(outer.endsWith(sep) ? outer : outer + sep);

async function directoryBelow(base: string, target: string): Promise<{ base: string; cwd: string }> {
	let realBase: string;
	let cwd: string;
	try {
		realBase = await realpath(base);
		cwd = await realpath(target);
	} catch {
		throw new Error("That directory does not exist");
	}
	// Real paths on both sides: a link that leaves the session's directory is outside.
	if (!within(realBase, cwd)) throw new Error("`path` is outside this session's directory");
	if (realBase === sep) throw new Error("A local run will not work in the filesystem root");
	if (!(await stat(cwd)).isDirectory()) throw new Error("`path` is not a directory");
	return { base: realBase, cwd };
}

/** The real directory `path` names below the real directory `base`; throws why not (messages are for the agent). */
export async function resolveBelow(base: string, path: string | undefined): Promise<{ base: string; cwd: string }> {
	if (path !== undefined && isAbsolute(path)) throw new Error("`path` is relative to the session's directory");
	let realBase: string;
	try {
		realBase = await realpath(base);
	} catch {
		throw new Error("That directory does not exist");
	}
	return directoryBelow(realBase, resolve(realBase, path ?? "."));
}

/** The agent process's own check of what it was asked to do. Throws why it refuses. */
export async function checkRequest(request: WorkerRequest): Promise<void> {
	if (request.version !== 1) throw new Error("Unknown request version");
	if (request.prompt.length < 1 || request.prompt.length > LIMITS.prompt) throw new Error("The prompt has a bad size");
	if (!MODEL_PATTERN.test(request.model)) throw new Error("That is not a model id");
	if (request.mode === "agent" && !request.allowEdits) throw new Error("Local agents may not edit files (agent mode)");
	await directoryBelow(request.base, request.cwd);
	if (request.deadline - Date.now() > LIMITS.maxMinutes * 60_000 + 60_000)
		throw new Error("The deadline is past the longest a run may take");
}
