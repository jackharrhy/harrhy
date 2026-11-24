// The one interface Pi talks to Cursor through. The real `@cursor/sdk` sits behind it in sdk.ts; tests give it a fake.
// Nothing here knows about the SDK's types, so the rest of the plugin builds without the package installed.

/** A model as the SDK lists it: its id, other names that point at it and the parameters it takes. */
export type ModelInfo = { id: string; name: string; aliases: string[]; params: { id: string; values: string[] }[] };

export type Usage = { inputTokens: number; outputTokens: number; totalTokens: number; chargedCents?: number };

/** How a run ended, as the SDK reports it. Text and errors are Cursor's: untrusted. */
export type Outcome = {
	status: "finished" | "error" | "cancelled";
	text?: string;
	error?: string;
	usage?: Usage;
	durationMs?: number;
	git?: { branch?: string; prUrl?: string };
};

/** What a running agent does, as the SDK streams it. */
export type RunEvent =
	| { type: "text"; text: string }
	| { type: "tool"; name: string; status: string; path?: string };

/** One run Pi started or found again. */
export type RunHandle = {
	agentId: string;
	/** Cursor's id of the run. */
	runId: string;
	/** Resolves when the run ends. Rejects on a lost connection: ask again with `attach` (cloud runs only). */
	wait(): Promise<Outcome>;
	cancel(): Promise<void>;
	/** Reports what the agent does while it runs (text, tools). Best effort: the stream may end or fail without the run doing so. */
	watch?(onEvent: (event: RunEvent) => void): void;
	/** Frees what the handle holds (a local agent's resources); the run itself is not stopped. */
	dispose(): void;
};

/** What a run is allowed to do, decided by policy.ts before the client sees it. */
export type StartSpec =
	| {
			runtime: "local";
			prompt: string;
			model: string;
			modelParams?: { id: string; value: string }[];
			/** Ask the SDK for its shell sandbox (agent mode only; the SDK says if it cannot). */
			sandbox: boolean;
			/** A directory that exists and lies inside the session's. */
			cwd: string;
			/** `ask`: read-only tools. `plan`: read-only tools, plan mode. `agent`: every tool, in the SDK's sandbox. */
			mode: "ask" | "plan" | "agent";
			/** Go on with an interrupted agent: its id, and the message to send it. */
			resume?: { agentId: string; message: string };
	  }
	| {
			runtime: "cloud";
			prompt: string;
			model?: string;
			modelParams?: { id: string; value: string }[];
			/** `owner/name`, on the owner's list. */
			repo: string;
			branch?: string;
			/** `plan` reads and drafts; `agent` may change the repository on a branch of its own. */
			mode: "plan" | "agent";
			resume?: { agentId: string; message: string };
	  };

export type CursorClient = {
	/** Who the key is (its name): proves it works. */
	whoAmI(): Promise<string>;
	models(): Promise<ModelInfo[]>;
	/** Whether the SDK can sandbox a local agent on this machine: one tiny request in an empty directory. */
	probeSandbox(model: string): Promise<"supported" | "unsupported">;
	start(spec: StartSpec): Promise<RunHandle>;
	/** A cloud run again after the server restarted or the connection dropped. */
	attach(ref: { agentId: string; runId: string }): Promise<RunHandle>;
};

/** Makes a client for one API key; throws why when the SDK is not there. */
export type ClientFactory = (apiKey: string) => Promise<CursorClient>;

/** The SDK refused to start a local agent with its sandbox, because this machine cannot give one. */
export class SandboxUnsupportedError extends Error {}

/** The SDK's own words for it: "Local SDK sandboxing was requested, but sandboxing is not supported in this environment." */
export const isSandboxUnsupported = (message: string) => /sandbox\w*\b[^.]{0,80}\b(?:not|isn't|is not|cannot|can't|unable)\b[^.]{0,40}\b(?:supported|available|enabled|possible)/i.test(message);

const KEY_LIKE = /\b(?:crsr|cursor|key|sk)[_-][A-Za-z0-9_-]{16,}\b/gi;

/** Text with the API key (and anything shaped like a Cursor key) taken out: for errors, logs and anything stored. */
export function redact(text: string, apiKey?: string): string {
	let out = text;
	if (apiKey && apiKey.length >= 8) out = out.split(apiKey).join("[redacted]");
	return out.replace(KEY_LIKE, "[redacted]");
}

/** One line, no control characters, at most `max` characters: for anything Cursor or an error says that Pi shows. */
export function oneLine(text: string, max: number): string {
	const flat = text.replace(/[\p{C}\u2028\u2029]+/gu, " ").trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
