// What the adapter is set up with: the owner's allowed repositories (Settings › GitHub, kept in the server's store) and an
// optional `github-checks.json` for what the UI does not cover. Nothing needs configuring: `gh`'s login and the owner's
// list are enough.
import { join } from "node:path";
import { arr, compile, int, obj, opt, type Static, str } from "@earendil-works/pi-schema";
import { type Ctx, defineState, local, method } from "@p2/app/v1";
import { optionalText, processLogs } from "@p2/app/v1/node";
import { Server } from "@p2/app/v1/server";

// `github-checks.json`, all optional; the README says what each timing (in ms) does and its default.
const ConfigSchema = obj({
	token: opt(str({ minLength: 20 })),
	ghPath: opt(str({ minLength: 1, maxLength: 1024 })),
	apiBase: opt(str({ minLength: 1, maxLength: 2048 })),
	pollMs: opt(int({ minimum: 20, maximum: 300_000 })),
	idleMs: opt(int({ minimum: 20, maximum: 3_600_000 })),
	settleMs: opt(int({ minimum: 0, maximum: 300_000 })),
	graceMs: opt(int({ minimum: 0, maximum: 3_600_000 })),
	lingerMs: opt(int({ minimum: 0, maximum: 86_400_000 })),
});
const configCheck = compile(ConfigSchema);
export type Settings = {
	token: string | undefined;
	ghPath: string;
	repos: readonly string[];
	apiBase: string;
	pollMs: number;
	idleMs: number;
	settleMs: number;
	graceMs: number;
	lingerMs: number;
};

export const MAX_REPOS = 256;
/** The owner's list. Changing this schema needs `version: 2` and a `migrate`, or the object fails to load where version 1 is stored. */
const RepoList = obj({ repos: arr(str({ maxLength: 200 }), { maxItems: MAX_REPOS }) });
export const Allowed = defineState("p2.github-checks-allowed", {
	version: 1,
	schema: RepoList,
	initial: () => ({ repos: [] as string[] }),
	persist: true,
	checkpointWhen: () => true,
});
export const AllowedStore = local("p2.github-checks-allowed-store", {
	version: 1,
	params: {},
	members: { repos: arr(str()), allow: method(obj({ repo: str() })), remove: method(obj({ repo: str() })) },
});
export const REPO = /^(?!\.{1,2}\/)[A-Za-z0-9._-]+\/(?:\*|(?!\.{1,2}$)[A-Za-z0-9._-]+)$/;

/** The settings, read afresh; throws why when `github-checks.json` is unusable. */
export async function readSettings(ctx: Ctx): Promise<Settings> {
	const server = await ctx.get(Server, {});
	const allowed = (await ctx.get(AllowedStore, {})).repos.value;
	const text = await optionalText(join(server.info.value.dataDir, "github-checks.json"));
	let value: Static<typeof ConfigSchema> = {};
	if (text !== undefined) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			throw new Error("github-checks.json is not valid JSON");
		}
		if (!configCheck.check(parsed)) throw new Error("github-checks.json is invalid");
		value = parsed;
	}
	const apiBase = (value.apiBase ?? "https://api.github.com").replace(/\/+$/, "");
	try {
		const url = new URL(apiBase);
		const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
		if (url.username || url.password || !(url.protocol === "https:" || (url.protocol === "http:" && loopback)))
			throw new Error("bad");
	} catch {
		throw new Error("github-checks.json has an invalid apiBase (https, or http on loopback)");
	}
	if (value.token !== undefined) processLogs.redactor.addSecret(value.token);
	return {
		token: value.token,
		ghPath: value.ghPath ?? "gh",
		repos: allowed,
		apiBase,
		pollMs: value.pollMs ?? 15_000,
		idleMs: value.idleMs ?? 60_000,
		settleMs: value.settleMs ?? 20_000,
		graceMs: value.graceMs ?? 60_000,
		lingerMs: value.lingerMs ?? 600_000,
	};
}
