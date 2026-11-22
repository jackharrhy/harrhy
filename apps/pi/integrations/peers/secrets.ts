// The credentials this instance keeps to call peers, `<P2_DATA_DIR>/peers-secrets.json` (private, 0600). Only the server
// reads it. What peers use to call this instance is kept as hashes in the settings, never here.
import { join } from "node:path";
import { LockedFile } from "@p2/app/v1/node";

type Secrets = {
	/** The token this instance sends when it calls peer `id`. */
	outgoing: Record<string, string>;
	/** What a link request carries until the owner answers: the token to call the requester with (by request ID), and the token this instance gave a peer it asked (by peer ID). */
	pending: Record<string, string>;
};

const parse = (text: string | undefined): Secrets => {
	const value: unknown = text?.trim() ? JSON.parse(text) : {};
	const read = (key: string): Record<string, string> => {
		const entry = (value as Record<string, unknown>)[key];
		return typeof entry === "object" && entry !== null && !Array.isArray(entry)
			? (entry as Record<string, string>)
			: {};
	};
	return { outgoing: read("outgoing"), pending: read("pending") };
};

export function openSecrets(dataDir: string) {
	const file = new LockedFile(join(dataDir, "peers-secrets.json"));
	const edit = <T>(change: (secrets: Secrets) => T) =>
		file.withLockAsync(async (text) => {
			const secrets = parse(text);
			const result = change(secrets);
			return { result, next: `${JSON.stringify(secrets, null, 2)}\n` };
		});
	const read = <T>(pick: (secrets: Secrets) => T) =>
		file.withLockAsync(async (text) => ({ result: pick(parse(text)) }));
	return {
		outgoing: (peer: string) => read((secrets) => secrets.outgoing[peer]),
		setOutgoing: (peer: string, token: string) =>
			edit((secrets) => {
				secrets.outgoing[peer] = token;
			}),
		pending: (key: string) => read((secrets) => secrets.pending[key]),
		setPending: (key: string, token: string) =>
			edit((secrets) => {
				secrets.pending[key] = token;
			}),
		dropPending: (key: string) =>
			edit((secrets) => void delete secrets.pending[key]),
		/** Forgets everything kept for a peer and its requests. */
		forget: (peer: string, keys: readonly string[]) =>
			edit((secrets) => {
				delete secrets.outgoing[peer];
				for (const key of keys) delete secrets.pending[key];
			}),
		close: () => file.close(),
	};
}
export type PeerSecrets = ReturnType<typeof openSecrets>;
