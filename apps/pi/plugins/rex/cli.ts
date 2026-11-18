// Rex's supported CLI boundary: bounded JSON calls and one event stream, never shell command strings or raw sockets.
import { execFile, spawn } from "node:child_process";
import { arr, compile, int, nul, obj, opt, str, union } from "@earendil-works/pi-schema";

export type RexIdentity = { hostId: string; instanceId: string; endpoint: string };
export type RexBlock = { blockId: string; windowId: string; label: string; windowLabel?: string };
export type RexView = { blocks: RexBlock[] };
export type RexCreate = { sessionId: string; label: string; command: readonly string[]; cwd: string };
export type RexOptions = { binary?: string; endpoint: string };

const identitySchema = compile(
	obj(
		{
			principal: obj({ kind: str(), transport: str(), uid: int() }, { open: true }),
			host_id: str({ format: "uuid" }),
			instance_id: str({ format: "uuid" }),
			endpoint: str(),
		},
		{ open: true },
	),
);
const blockIdSchema = str({ pattern: "^block:[0-9a-f-]{36}$" });
const windowIdSchema = str({ pattern: "^window:[0-9a-f-]{36}$" });
const blockSchema = obj({ block_id: blockIdSchema, label: opt(str()) }, { open: true });
const viewSchema = compile(
	obj(
		{
			session_id: str(),
			windows: opt(
				union([
					nul(),
					arr(
						obj(
							{
								window_id: windowIdSchema,
								label: opt(str()),
								layers: arr(obj({ blocks: arr(blockSchema) }, { open: true })),
							},
							{ open: true },
						),
					),
				]),
			),
		},
		{ open: true },
	),
);
const createdSchema = compile(obj({ block_ids: arr(blockIdSchema), window_id: windowIdSchema }, { open: true }));
const methodSchema = compile(obj({ name: str() }, { open: true }));
const eventSchema = compile(obj({ type: str() }, { open: true }));

/** Connects only to an explicitly configured same-user local Rex endpoint; commands never autostart a server. */
export class RexCli {
	readonly #binary: string;
	readonly #endpoint: string;
	#capabilitiesFor: string | undefined;

	constructor(options: RexOptions) {
		this.#binary = options.binary ?? "rex";
		this.#endpoint = options.endpoint;
	}

	/** Verifies the server identity, local peer authority, and the methods used to manage panes. */
	async identity(): Promise<RexIdentity> {
		const value = await this.#json(["whoami", "--json"]);
		// CLI output is an external trust boundary, including the peer authority and selected endpoint.
		if (
			!identitySchema.check(value) ||
			value.principal.kind !== "peer" ||
			value.principal.transport !== "unix" ||
			value.principal.uid !== process.getuid?.() ||
			value.endpoint !== this.#endpoint ||
			!value.endpoint.startsWith("unix://")
		)
			throw new Error("Rex must be the configured same-user local Unix server");
		if (this.#capabilitiesFor !== value.instance_id) {
			for (const method of [
				"session.new_window",
				"block.close",
				"session.set_block_label",
				"session.set_window_label",
				"session.view",
			]) {
				const described = await this.#json(["api", "describe", method, "--json"]);
				if (!methodSchema.check(described) || described.name !== method)
					throw new Error("Rex lacks a required pane capability");
			}
			this.#capabilitiesFor = value.instance_id;
		}
		return { hostId: value.host_id, instanceId: value.instance_id, endpoint: value.endpoint };
	}

	/** Returns the target's placed panes; a missing target never causes a replacement session to be created. */
	async view(sessionId: string): Promise<RexView | undefined> {
		let value: unknown;
		try {
			value = await this.#json(["api", "call", "session.view", JSON.stringify({ session_id: sessionId })]);
		} catch (error) {
			if (error instanceof RexMissingSession) return undefined;
			throw error;
		}
		if (!viewSchema.check(value) || value.session_id !== sessionId) throw new Error("Invalid Rex session view");
		return {
			blocks: (value.windows ?? []).flatMap((window) =>
				window.layers.flatMap((layer) =>
					layer.blocks.map((block) => ({
						blockId: block.block_id,
						windowId: window.window_id,
						label: block.label ?? "",
						windowLabel: window.label ?? "",
					})),
				),
			),
		};
	}

	/** Creates one background tab with a direct argv program, preserving every existing tab and pane. */
	async create(input: RexCreate): Promise<{ blockId: string; windowId: string }> {
		const value = await this.#json([
			"api",
			"call",
			"session.new_window",
			JSON.stringify({
				session_id: input.sessionId,
				window_label: input.label,
				focus: false,
				layout: {
					block: {
						flavor: "com.superlogical.terminal.shell",
						label: input.label,
						options: { shell: "none", command: input.command, cwd: input.cwd, exit: { on_completion: false } },
					},
				},
			}),
		]);
		if (!createdSchema.check(value) || value.block_ids.length !== 1)
			throw new Error("Invalid Rex pane creation result; reconcile before retrying");
		return { blockId: value.block_ids[0]!, windowId: value.window_id };
	}

	/** Closes only the explicitly identified managed block, never a whole Rex tab or session. */
	async close(sessionId: string, blockId: string): Promise<void> {
		await this.#json(["api", "call", "block.close", JSON.stringify({ session_id: sessionId, block_id: blockId })]);
	}

	/** Updates a pane's managed identity/title label without sending terminal input. */
	async rename(sessionId: string, blockId: string, label: string): Promise<void> {
		await this.#json([
			"api",
			"call",
			"session.set_block_label",
			JSON.stringify({ session_id: sessionId, block_id: blockId, label }),
		]);
	}

	/** Updates a managed tab title without changing focus or any sibling pane. */
	async renameWindow(sessionId: string, windowId: string, label: string): Promise<void> {
		await this.#json([
			"api",
			"call",
			"session.set_window_label",
			JSON.stringify({ session_id: sessionId, window_id: windowId, label }),
		]);
	}

	/** Follows Rex changes through one bounded NDJSON stream; the caller owns reconnect/backoff and snapshot recovery. */
	events(sessionId: string, onChanged: () => void, onError: (error: Error) => void): () => void {
		const child = spawn(this.#binary, [...this.#args(), "events", "-s", sessionId, "--json"], {
			stdio: ["ignore", "pipe", "ignore"],
		});
		let stopped = false;
		let buffer = "";
		const fail = () => {
			if (stopped) return;
			stopped = true;
			child.kill();
			onError(new Error("Rex event stream disconnected; snapshot reconciliation will retry"));
		};
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			buffer += chunk;
			if (buffer.length > 1024 * 1024) return fail();
			for (;;) {
				const end = buffer.indexOf("\n");
				if (end < 0) break;
				const line = buffer.slice(0, end);
				buffer = buffer.slice(end + 1);
				if (!line.trim()) continue;
				try {
					const event: unknown = JSON.parse(line);
					if (!eventSchema.check(event)) return fail();
					onChanged();
				} catch {
					return fail();
				}
			}
		});
		child.once("error", fail);
		child.once("close", fail);
		return () => {
			stopped = true;
			child.kill();
		};
	}

	#args(): string[] {
		return ["--autostart=false", "--timeout", "5s", "-S", this.#endpoint];
	}

	#json(args: string[]): Promise<unknown> {
		return new Promise((resolve, reject) => {
			execFile(
				this.#binary,
				[...this.#args(), ...args],
				{ timeout: 7000, maxBuffer: 4 * 1024 * 1024 },
				(error, stdout, stderr) => {
					if (error) {
						// Never expose CLI stderr: launch failures can echo argv or owner task text.
						reject(
							stderr.includes("session_not_found")
								? new RexMissingSession()
								: new Error("Rex CLI request failed; reconcile uncertain outcomes before retrying"),
						);
						return;
					}
					try {
						resolve(JSON.parse(stdout));
					} catch {
						reject(new Error("Invalid JSON from Rex CLI"));
					}
				},
			);
		});
	}
}

class RexMissingSession extends Error {}
