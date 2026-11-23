// The API key, `<P2_DATA_DIR>/cursor-secrets.json` (private, 0600). Only the server reads it; it goes in through Settings and
// never comes back out. Every key seen is also registered with the server's log redactor.
import { join } from "node:path";
import { LockedFile, processLogs } from "@p2/app/v1/node";

type Secrets = { apiKey?: string };

const parse = (text: string | undefined): Secrets => {
	const value: unknown = text?.trim() ? JSON.parse(text) : {};
	const key = typeof value === "object" && value !== null ? (value as Record<string, unknown>).apiKey : undefined;
	return typeof key === "string" && key !== "" ? { apiKey: key } : {};
};

export function openSecrets(dataDir: string) {
	const file = new LockedFile(join(dataDir, "cursor-secrets.json"));
	return {
		/** The stored key, if any. */
		async read(): Promise<string | undefined> {
			const key = await file.withLockAsync(async (text) => ({ result: parse(text).apiKey }));
			if (key !== undefined) processLogs.redactor.addSecret(key);
			return key;
		},
		async write(key: string): Promise<void> {
			processLogs.redactor.addSecret(key);
			await file.withLockAsync(async () => ({ result: null, next: `${JSON.stringify({ apiKey: key }, null, 2)}\n` }));
		},
		async clear(): Promise<void> {
			await file.withLockAsync(async () => ({ result: null, next: "{}\n" }));
		},
		close: () => file.close(),
	};
}
export type CursorSecrets = ReturnType<typeof openSecrets>;
