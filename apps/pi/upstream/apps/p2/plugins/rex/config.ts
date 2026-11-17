// Private, local-only Rex configuration and crash-safe mapping storage.

import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { compile, obj, opt, type Static, str, union } from "@earendil-works/pi-schema";
import { literal, record } from "@p2/app/v1";

const sessionId = str({ pattern: "^session:[0-9a-f-]{36}$" });
const schema = obj({
	sessionId,
	projects: opt(record(sessionId)),
	hostId: str({ format: "uuid" }),
	endpoint: str({ pattern: "^unix:///" }),
	binary: opt(str({ minLength: 1 })),
});
const validator = compile(schema);
export type RexConfig = Static<typeof schema>;

/** Reads the owner's optional configuration; refuses shared or foreign files. */
export async function readConfig(directory: string): Promise<RexConfig | undefined> {
	const path = join(directory, "rex.json");
	let stat: Stats;
	try {
		stat = await lstat(path);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
		throw error;
	}
	if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0)
		throw new Error("rex.json must be a same-user regular file with mode 0600");
	const value: unknown = JSON.parse(await readFile(path, "utf8"));
	if (!validator.check(value)) throw new Error("Invalid rex.json");
	return value;
}

const mappingSchema = obj({
	// Retained only to verify the initial in-place migration of already-managed visible markers.
	label: opt(str()),
	nonce: opt(str({ format: "uuid" })),
	phase: union([
		literal("pending"),
		literal("open"),
		literal("suppressed"),
		literal("archived"),
		literal("relocating"),
	]),
	// Explicit maintenance intent: close the old exact viewer before routing a fresh launch.
	destination: opt(sessionId),
	// A sticky viewer differs from current project routing; no automatic relocation.
	relocationNeeded: opt(sessionId),
	blockId: opt(str()),
	windowId: opt(str()),
});
export type Mapping = Static<typeof mappingSchema>;
const stateSchema = obj({
	namespace: str({ format: "uuid" }),
	targets: record(record(mappingSchema)),
});
export type RexState = Static<typeof stateSchema>;
const stateValidator = compile(stateSchema);

/** Owns only the server plugin's private mappings, never a session's store. */
export class RexStore {
	readonly path: string;
	constructor(directory: string) {
		this.path = join(directory, "rex-state.json");
	}
	async load(): Promise<RexState> {
		try {
			const value: unknown = JSON.parse(await readFile(this.path, "utf8"));
			if (!stateValidator.check(value)) throw new Error("Invalid rex-state.json");
			return value;
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT")
				return { namespace: randomUUID(), targets: {} };
			throw error;
		}
	}
	async save(state: RexState): Promise<void> {
		const temporary = `${this.path}.${randomUUID()}.tmp`;
		await writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: "wx" });
		await rename(temporary, this.path);
	}
}
