// The real `@cursor/sdk` behind CursorClient. The package is not bundled: package.json lists it under `chord.external`, so
// it loads from this plugin's own `node_modules` (README: `npm install` in the plugin directory) the first time a client is
// made, and a missing package is an error message, not a failed plugin.
import type { ClientFactory, CursorClient, ModelInfo, Outcome, RunHandle, StartSpec, Usage } from "./client.ts";

/** The parts of the SDK used here. Structural on purpose: only this file knows the SDK's shapes. */
type SdkRun = {
	id: string;
	agentId: string;
	wait(): Promise<{
		status: "finished" | "error" | "cancelled";
		result?: string;
		error?: { message: string };
		usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
		durationMs?: number;
		git?: { branches: { branch?: string; prUrl?: string }[] };
	}>;
	cancel(): Promise<void>;
};
type SdkAgent = {
	agentId: string;
	send(message: string, options?: { mode?: "agent" | "plan" }): Promise<SdkRun>;
	close(): void;
	getUsage(options?: { runId?: string }): Promise<{ cost?: { chargedCents: number } }>;
};
type Sdk = {
	Agent: {
		create(options: Record<string, unknown>): Promise<SdkAgent>;
		getRun(runId: string, options: Record<string, unknown>): Promise<SdkRun>;
	};
	Cursor: {
		me(options: { apiKey: string }): Promise<{ apiKeyName: string }>;
		models: { list(options: { apiKey: string }): Promise<{ id: string; displayName: string }[]> };
	};
};

/** What `ask` and `plan` runs may use: look at files, never change or run anything, no MCP, no subagents. */
export const READ_ONLY_TOOLS = ["read", "grep", "glob", "ls"];

let loaded: Sdk | undefined;
async function loadSdk(): Promise<Sdk> {
	if (loaded !== undefined) return loaded;
	// A computed specifier: the build leaves it to the plugin's `require`, which answers `chord.external` packages.
	const name = "@cursor/sdk";
	try {
		const module = (await import(name)) as Sdk & { default?: Sdk };
		loaded = module.Agent === undefined && module.default !== undefined ? module.default : module;
		return loaded;
	} catch {
		throw new Error(
			"The @cursor/sdk package is not installed: run `npm install --omit=dev --ignore-scripts` in the cursor plugin's directory and reload the plugin",
		);
	}
}

const usageOf = (usage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined): Usage | undefined =>
	usage === undefined
		? undefined
		: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens };

function handle(run: SdkRun, agent: SdkAgent | undefined): RunHandle {
	let closed = false;
	const dispose = () => {
		if (agent === undefined || closed) return;
		closed = true;
		try {
			agent.close();
		} catch {
			// Closing is best effort.
		}
	};
	return {
		agentId: run.agentId,
		runId: run.id,
		async wait(): Promise<Outcome> {
			const result = await run.wait();
			const outcome: Outcome = {
				status: result.status,
				...(result.result === undefined ? {} : { text: result.result }),
				...(result.error === undefined ? {} : { error: result.error.message }),
				...(result.durationMs === undefined ? {} : { durationMs: result.durationMs }),
			};
			const usage = usageOf(result.usage);
			if (usage !== undefined) outcome.usage = usage;
			const branch = result.git?.branches[0];
			if (branch !== undefined && (branch.branch !== undefined || branch.prUrl !== undefined))
				outcome.git = {
					...(branch.branch === undefined ? {} : { branch: branch.branch }),
					...(branch.prUrl === undefined ? {} : { prUrl: branch.prUrl }),
				};
			if (agent !== undefined) {
				// Billed cost lags a little and may not exist (plan-included usage): best effort, never an error.
				try {
					const billed = await agent.getUsage({ runId: run.id });
					const cents = billed.cost?.chargedCents;
					if (cents !== undefined && outcome.usage !== undefined) outcome.usage.chargedCents = Math.round(cents);
				} catch {
					// No cost to report.
				}
			}
			return outcome;
		},
		cancel: () => run.cancel(),
		dispose,
	};
}

export const sdkClient: ClientFactory = async (apiKey): Promise<CursorClient> => {
	const sdk = await loadSdk();
	return {
		async whoAmI() {
			return (await sdk.Cursor.me({ apiKey })).apiKeyName;
		},
		async models(): Promise<ModelInfo[]> {
			return (await sdk.Cursor.models.list({ apiKey })).map((model) => ({ id: model.id, name: model.displayName }));
		},
		async start(spec: StartSpec) {
			let agent: SdkAgent;
			if (spec.runtime === "local") {
				const readOnly = spec.mode !== "agent";
				agent = await sdk.Agent.create({
					apiKey,
					model: { id: spec.model },
					// No ambient hooks, rules or MCP servers from the machine's Cursor settings.
					local: { cwd: spec.cwd, settingSources: [], ...(readOnly ? {} : { sandboxOptions: { enabled: true } }) },
					...(readOnly ? { tools: READ_ONLY_TOOLS } : {}),
					...(spec.mode === "plan" ? { mode: "plan" } : {}),
				});
			} else {
				agent = await sdk.Agent.create({
					apiKey,
					...(spec.model === undefined ? {} : { model: { id: spec.model } }),
					cloud: {
						repos: [{ url: `https://github.com/${spec.repo}`, ...(spec.branch === undefined ? {} : { startingRef: spec.branch }) }],
						autoCreatePR: false,
						skipReviewerRequest: true,
					},
					...(spec.mode === "plan" ? { mode: "plan" } : {}),
				});
			}
			try {
				return handle(await agent.send(spec.prompt, spec.mode === "plan" ? { mode: "plan" } : undefined), agent);
			} catch (error) {
				agent.close();
				throw error;
			}
		},
		async attach({ agentId, runId }) {
			return handle(await sdk.Agent.getRun(runId, { runtime: "cloud", agentId, apiKey }), undefined);
		},
	};
};
