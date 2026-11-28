// Where a local run may work and when it may change files. Used by policy.ts when a run is planned and again by the
// detached agent process before it launches Cursor, so neither trusts the other. Plain Node modules only.
import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
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

export const ACP_SANDBOX_REQUIRED = "Local sandboxing is set to “required” in Settings › Cursor, but Cursor ACP is unsandboxed. Use a cloud run, or change the setting if you accept unsandboxed local access";

export const isAcpModelId = (model: string) => typeof model === "string" && model.length > 0 && model.length <= 200 && model.trim() === model && !/[\p{C}\u2028\u2029]/u.test(model);

export async function checkAcpCommand(command: string | undefined): Promise<string> {
	if (typeof command !== "string" || !isAbsolute(command))
		throw new Error("Local Cursor ACP needs the absolute path of the signed-in Cursor CLI in local-acp.json (or P2_CURSOR_ACP_COMMAND on the Pi server)");
	if (process.platform === "win32") throw new Error("Local Cursor ACP requires POSIX process groups");
	try {
		if (!(await stat(command)).isFile()) throw new Error();
		await access(command, constants.X_OK);
	} catch {
		throw new Error("The configured local Cursor ACP executable is unavailable or not executable");
	}
	return command;
}

/** The agent process's own check of what it was asked to do. Throws why it refuses. */
export async function checkRequest(request: WorkerRequest): Promise<void> {
	if (request.version !== 1 && request.version !== 2) throw new Error("Unknown request version");
	if (request.prompt.length < 1 || request.prompt.length > LIMITS.prompt) throw new Error("The prompt has a bad size");
	if (request.version === 1 ? !MODEL_PATTERN.test(request.model) : request.model !== undefined && !isAcpModelId(request.model))
		throw new Error("That is not a model id");
	if (request.mode === "agent" && !request.allowEdits) throw new Error("Local agents may not edit files (agent mode)");
	if (request.mode !== "ask" && request.mode !== "plan" && request.mode !== "agent") throw new Error("Unknown run mode");
	if (request.version === 2) {
		if (request.backend !== "acp") throw new Error("Unknown local Cursor backend");
		if (request.sandboxMode === "required") throw new Error(ACP_SANDBOX_REQUIRED);
		await checkAcpCommand(request.command);
	}
	const resolved = await directoryBelow(request.base, request.cwd);
	if (request.version === 2 && (resolved.base !== request.base || resolved.cwd !== request.cwd))
		throw new Error("The local Cursor working directory changed after admission");
	if (request.deadline - Date.now() > LIMITS.maxMinutes * 60_000 + 60_000)
		throw new Error("The deadline is past the longest a run may take");
}
