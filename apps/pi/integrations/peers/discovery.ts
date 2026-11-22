// How a Pi instance is found on a machine: each one writes `<state>/pi-peers/<instanceId>.json` (one JSON line), and
// finding them is `cat` of that directory over SSH. The files say where to look; `hello` over the link says who answers.
import { execFile } from "node:child_process";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { compile, int, obj, type Static, str } from "@earendil-works/pi-schema";
import { CandidateSchema } from "./contract.ts";

const run = promisify(execFile);

const Announcement = obj({
	protocol: int(),
	instanceId: str(),
	name: str(),
	port: int(),
	pid: int(),
	startedAt: int(),
});
const recordCheck = compile(Announcement);
const candidateCheck = compile(CandidateSchema);

/** The directory this machine's Pi instances announce themselves in. */
export function announceDirectory(
	env: NodeJS.ProcessEnv = process.env,
): string {
	return join(
		env.XDG_STATE_HOME || join(homedir(), ".local", "state"),
		"pi-peers",
	);
}

/** Writes (or refreshes) this instance's announcement, and returns what removes it. */
export async function announce(
	record: { protocol: number; instanceId: string; name: string; port: number },
	directory = announceDirectory(),
): Promise<() => Promise<void>> {
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const path = join(directory, `${record.instanceId}.json`);
	const startedAt = Date.now();
	const write = async () => {
		const temporary = `${path}.${process.pid}.tmp`;
		await writeFile(
			temporary,
			`${JSON.stringify({ ...record, pid: process.pid, startedAt })}\n`,
			{ mode: 0o600 },
		);
		await rename(temporary, path);
	};
	await write();
	const timer = setInterval(() => void write().catch(() => {}), 60_000);
	timer.unref();
	return async () => {
		clearInterval(timer);
		await rm(path, { force: true });
	};
}

// The login shell may be anything (fish, say), so the command is one `sh -c` with the script in single quotes.
const SCRIPT = `sh -c 'cat "\${XDG_STATE_HOME:-\$HOME/.local/state}"/pi-peers/*.json 2>/dev/null; true'`;
const MAX_OUTPUT = 64 * 1024;

/** The SSH arguments every call here shares: no prompts, a known host key, and a time limit. */
export function sshOptions(): string[] {
	return [
		"-o",
		"BatchMode=yes",
		"-o",
		"StrictHostKeyChecking=yes",
		"-o",
		"ConnectTimeout=8",
	];
}

/** The Pi instances announced on `target` (`user@host`), whichever still answers is the caller's to check. */
export async function findOver(
	ssh: string,
	target: string,
): Promise<Static<typeof CandidateSchema>[]> {
	let stdout: string;
	try {
		({ stdout } = await run(ssh, [...sshOptions(), "--", target, SCRIPT], {
			timeout: 20_000,
			maxBuffer: MAX_OUTPUT,
		}));
	} catch (error) {
		const text =
			String((error as { stderr?: unknown }).stderr ?? "")
				.trim()
				.split("\n")
				.pop() ?? "";
		throw new Error(
			text.includes("Host key verification failed") ||
				text.includes("REMOTE HOST IDENTIFICATION")
				? `SSH does not trust ${target.split("@")[1]} yet: connect once from a terminal so its host key is known`
				: text.includes("Permission denied")
					? `SSH was refused for ${target}: this machine's key is not accepted there`
					: `Could not reach ${target} over SSH${text ? `: ${text.slice(0, 160)}` : ""}`,
		);
	}
	const found: Static<typeof CandidateSchema>[] = [];
	for (const line of stdout.split("\n")) {
		if (!line.trim()) continue;
		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch {
			continue;
		}
		if (!recordCheck.check(value)) continue;
		const candidate = {
			instanceId: value.instanceId,
			name: value.name,
			port: value.port,
		};
		if (candidateCheck.check(candidate)) found.push(candidate);
	}
	return found;
}
