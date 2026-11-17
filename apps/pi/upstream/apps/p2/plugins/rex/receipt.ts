// Private launch receipts bind a precommitted nonce to Rex's supplied terminal identity without visible labels.
import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { compile, obj, type Static, str } from "@earendil-works/pi-schema";

const schema = obj({
	nonce: str({ format: "uuid" }),
	hostId: str({ format: "uuid" }),
	endpoint: str({ pattern: "^unix:///" }),
	sessionId: str({ pattern: "^session:[0-9a-f-]{36}$" }),
	blockId: str({ pattern: "^block:[0-9a-f-]{36}$" }),
});
export type LaunchReceipt = Static<typeof schema>;
const validator = compile(schema);

/** Locates a receipt by its schema-validated pending nonce, never by a session title or shell string. */
export function receiptPath(directory: string, nonce: string): string {
	return join(directory, "rex-receipts", `${nonce}.json`);
}

/** Reads a private regular receipt; missing means the create outcome is still unknown. */
export async function readReceipt(path: string): Promise<LaunchReceipt | undefined> {
	try {
		const stat = await lstat(path);
		if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0)
			throw new Error("Rex launch receipt must be private and same-user");
		const value: unknown = JSON.parse(await readFile(path, "utf8"));
		if (!validator.check(value)) throw new Error("Invalid Rex launch receipt");
		return value;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
		throw error;
	}
}

/** Atomically publishes one validated CLI/environment receipt without overwriting another terminal's claim. */
export async function writeReceipt(path: string, value: unknown): Promise<void> {
	// The wrapper's command arguments and Rex environment are external input, not trusted typed plugin values.
	if (!validator.check(value)) throw new Error("Invalid Rex launch identity");
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const parent = await lstat(dirname(path));
	if (!parent.isDirectory() || parent.uid !== process.getuid?.() || (parent.mode & 0o077) !== 0)
		throw new Error("Rex receipt directory must be private and same-user");
	const temporary = `${path}.${randomUUID()}.tmp`;
	await writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: "wx" });
	try {
		try {
			await link(temporary, path);
		} catch (error) {
			if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
			const existing = await readReceipt(path);
			if (!existing || JSON.stringify(existing) !== JSON.stringify(value))
				throw new Error("Rex launch nonce already belongs to another terminal");
		}
	} finally {
		await rm(temporary);
	}
}
