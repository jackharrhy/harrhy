// The runs: starting one (after policy.ts), watching it until it ends, keeping its result and publishing one stimulus when
// it is done. Cloud and long local runs never hold a turn: the tool returns at once, this wakes the session later.
import { type Ctx, type Ref, signalOf } from "@p2/app/v1";
import { bindStimulusPublisher, WakeStore } from "@p2/app/v1/server";
import {
	type ClientFactory,
	type CursorClient,
	isSandboxUnsupported,
	type ModelInfo,
	oneLine,
	type Outcome,
	type RunHandle,
	redact,
	SandboxUnsupportedError,
} from "./client.ts";
import { CursorRun } from "./contract.server.ts";
import {
	type CursorEvent,
	LIMITS,
	type RunView,
	type SandboxStatus,
	SOURCE_ID,
	SOURCE_VERSION,
	type StartArgs,
	type Status,
} from "./contract.ts";
import { paramsText } from "./models.ts";
import { plan } from "./policy.ts";
import type { CursorSecrets } from "./secrets.ts";
import type { CursorStore, RunRecord } from "./store.ts";

export type Deps = {
	secrets: CursorSecrets;
	factory: ClientFactory;
	/** `CURSOR_API_KEY` is the key when none is stored. */
	env: NodeJS.ProcessEnv;
	/** How long a minute of a run's allowed time is: 60 000, shorter only in tests. */
	minuteMs: number;
	/** How long a run that ignores its cancellation is waited for. */
	graceMs: number;
	log: (message: string) => void;
};

type Store = Ref<typeof CursorStore>;
/** A run this process is watching. */
type Active = {
	session: string;
	handle?: RunHandle;
	cancelRequested: boolean;
	timedOut: boolean;
	/** Ends the wait for a run that does not answer its cancellation. */
	force: () => void;
};

/** The runs of one session see each other; no run is visible to another session. */
export const view = (record: RunRecord): RunView => {
	const { session: _s, conversation: _c, agentId: _a, cursorRunId: _r, deadline: _d, text, notified: _n, ...rest } = record;
	return { ...rest, resultChars: text.length };
};

const clean = (text: string) => text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g, " ");

export function createManager(deps: Deps) {
	let live: { ctx: Ctx; store: Store } | undefined;
	let ready: (value: { ctx: Ctx; store: Store }) => void = () => {};
	const whenReady = new Promise<{ ctx: Ctx; store: Store }>((resolve) => {
		ready = resolve;
	});
	const active = new Map<string, Active>();
	const clients = new Map<string, CursorClient>();
	/** The live model list, kept ten minutes (per key). */
	let catalog: { key: string; at: number; list: ModelInfo[] } | undefined;
	let probing: Promise<SandboxStatus> | undefined;
	/** What this process knows about sandboxing; the store only mirrors it for the Settings page. */
	let sandboxSeen: SandboxStatus = { status: "unknown", detail: "" };

	async function apiKey(): Promise<string | undefined> {
		const stored = await deps.secrets.read();
		return stored ?? (deps.env.CURSOR_API_KEY?.trim() || undefined);
	}
	async function clientFor(key: string): Promise<CursorClient> {
		const have = clients.get(key);
		if (have !== undefined) return have;
		const made = await deps.factory(key);
		clients.clear();
		clients.set(key, made);
		return made;
	}
	const safe = (error: unknown, key: string | undefined, max = 500) =>
		oneLine(redact(error instanceof Error ? error.message : String(error), key), max);

	const CATALOG_MS = 600_000;
	async function catalogOf(client: CursorClient, key: string): Promise<ModelInfo[] | undefined> {
		if (catalog?.key === key && Date.now() - catalog.at < CATALOG_MS) return catalog.list;
		try {
			const list = await client.models();
			catalog = { key, at: Date.now(), list };
			return list;
		} catch {
			// A stale list is better than none; with none the name goes to Cursor as it is.
			return catalog?.key === key ? catalog.list : undefined;
		}
	}

	const UNSUPPORTED = "Cursor's SDK says sandboxing is not supported on this machine";
	/** One tiny request asks the SDK whether it can sandbox here; concurrent askers share it. Throws when the SDK cannot say. */
	function probe(client: CursorClient, model: string): Promise<SandboxStatus> {
		probing ??= (async () => {
			try {
				const result = await client.probeSandbox(model);
				const status: SandboxStatus =
					result === "supported" ? { status: "supported", detail: "Checked with one small request" } : { status: "unsupported", detail: UNSUPPORTED };
				await setSandbox(status);
				return status;
			} finally {
				probing = undefined;
			}
		})();
		return probing;
	}
	async function setSandbox(status: SandboxStatus) {
		sandboxSeen = status;
		const { ctx, store } = await whenReady;
		await store.setSandboxStatus(status, ctx);
	}

	async function put(record: RunRecord) {
		const { ctx, store } = await whenReady;
		await store.put(record, ctx);
	}
	const find = (id: string) => live?.store.runs.value.find((run) => run.id === id);

	/** Ends a run: its status, its bounded text, then the stimulus. */
	async function finish(id: string, status: Status, outcome: Outcome | undefined, problem: string | undefined, key: string) {
		const record = find(id);
		if (record === undefined) return;
		const now = Date.now();
		const text = clean(redact(outcome?.text ?? "", key)).slice(0, LIMITS.result);
		const error = problem ?? (status === "failed" && outcome?.error ? safe(outcome.error, key) : undefined);
		const next: RunRecord = {
			...record,
			status,
			text,
			finishedAt: now,
			durationMs: outcome?.durationMs ?? now - record.createdAt,
			...(error === undefined ? {} : { error }),
			...(outcome?.usage === undefined ? {} : { usage: outcome.usage }),
			...(outcome?.git === undefined ? {} : { git: outcome.git }),
		};
		await put(next);
		active.delete(id);
		await notify(id).catch((error: unknown) => deps.log(`${id}: no wake yet: ${safe(error, key)}`));
	}

	/** Watches one run until it ends, is cancelled or runs out of time. */
	async function supervise(id: string, first: RunHandle, client: CursorClient, key: string) {
		const record = find(id);
		const entry = active.get(id);
		if (record === undefined || entry === undefined) return;
		const { ctx } = await whenReady;
		const signal = signalOf(ctx);
		let handle = first;
		entry.handle = handle;
		let hardTimer: ReturnType<typeof setTimeout> | undefined;
		const hard = new Promise<"hard">((resolve) => {
			entry.force = () => resolve("hard");
			hardTimer = setTimeout(() => resolve("hard"), Math.max(0, record.deadline - Date.now()) + deps.graceMs);
		});
		const deadline = setTimeout(() => {
			entry.timedOut = true;
			handle.cancel().catch(() => {});
		}, Math.max(0, record.deadline - Date.now()));
		if (entry.cancelRequested) handle.cancel().catch(() => {});
		let outcome: Outcome | undefined;
		let problem: string | undefined;
		let attempts = 0;
		const stopped = new Promise<"stopped">((resolve) => signal.addEventListener("abort", () => resolve("stopped"), { once: true }));
		try {
			while (outcome === undefined && problem === undefined) {
				try {
					const result = await Promise.race([handle.wait(), hard, stopped]);
					if (result === "stopped") {
						// The facet is replaced or the server stops: a local run cannot outlive this process; a cloud run is found again.
						if (record.runtime === "local") await handle.cancel().catch(() => {});
						return;
					}
					if (result === "hard") {
						entry.timedOut ||= !entry.cancelRequested;
						problem = entry.timedOut ? "The run did not end in time and was given up on" : "The run did not answer its cancellation";
					} else outcome = result;
				} catch (error) {
					if (signal.aborted) return;
					// A lost connection to a cloud run is not the end of the run: look for it again.
					if (record.runtime === "cloud" && Date.now() < record.deadline && attempts < 12 && !entry.cancelRequested) {
						attempts++;
						await new Promise((resolve) => setTimeout(resolve, Math.min(500 * 2 ** attempts, 30_000)));
						try {
							handle = await client.attach({ agentId: handle.agentId, runId: handle.runId });
							entry.handle = handle;
						} catch {
							// The next round tries again.
						}
						continue;
					}
					problem = safe(error, key);
				}
			}
		} finally {
			clearTimeout(deadline);
			clearTimeout(hardTimer);
		}
		handle.dispose();
		const status: Status = entry.timedOut
			? "timed-out"
			: entry.cancelRequested || outcome?.status === "cancelled"
				? "cancelled"
				: problem !== undefined || outcome?.status === "error"
					? "failed"
					: "finished";
		await finish(id, status, outcome, status === "timed-out" ? (problem ?? "The run took longer than its time limit") : problem, key).catch((error: unknown) =>
			deps.log(`${id}: could not record the end: ${safe(error, key)}`),
		);
	}

	/** Publishes the run's one stimulus, once. Throws while it cannot (no subscription yet, the stimuli plugin busy). */
	async function notify(id: string) {
		const { ctx, store } = await whenReady;
		const record = store.runs.value.find((run) => run.id === id);
		if (record === undefined || record.status === "running" || record.notified !== "no") return;
		const wake = await ctx.get(WakeStore, {});
		const row = (await wake.subscriptions({}, ctx)).find(
			(entry) => entry.id === id && entry.source.id === SOURCE_ID && entry.source.version === SOURCE_VERSION,
		);
		if (row === undefined || row.target.session !== record.session) throw new Error("no Cursor subscription for the run");
		if (!row.enabled) return void (await put({ ...record, notified: "yes" }));
		const status = record.status as Exclude<Status, "running">;
		const event: CursorEvent = {
			runId: record.id,
			runtime: record.runtime,
			mode: record.mode,
			status,
			summary: record.text.slice(0, LIMITS.summary),
			truncated: record.text.length > LIMITS.summary,
			...(record.sandbox === "off" || record.sandbox === "unavailable" ? { sandbox: record.sandbox } : {}),
			...(record.error === undefined ? {} : { error: record.error }),
			...(record.git === undefined ? {} : { git: record.git }),
			...(record.durationMs === undefined ? {} : { durationMs: record.durationMs }),
		};
		// One event per run and ending: polling again, a restart or a replay never repeats it.
		const eventId = `${record.id}:${status}`;
		const publisher = bindStimulusPublisher(wake, CursorRun, row);
		if ((await publisher.receipt({ eventId }, ctx)).state === "missing") await publisher.publish({ eventId, event }, ctx);
		await put({ ...(store.runs.value.find((run) => run.id === id) ?? record), notified: "yes" });
	}

	/** Looks after runs that outlived the last process (a cloud run is found again, a local one is over), then after wakes. */
	async function run(ctx: Ctx, store: Store) {
		live = { ctx, store };
		ready(live);
		const signal = signalOf(ctx);
		const tries = new Map<string, number>();
		for (const record of store.runs.value.filter((entry) => entry.status === "running" && !active.has(entry.id))) {
			const key = await apiKey().catch(() => undefined);
			if (record.runtime === "cloud" && key !== undefined && record.agentId !== undefined && record.cursorRunId !== undefined) {
				try {
					const client = await clientFor(key);
					const handle = await client.attach({ agentId: record.agentId, runId: record.cursorRunId });
					active.set(record.id, { session: record.session, cancelRequested: false, timedOut: false, force: () => {} });
					void supervise(record.id, handle, client, key);
					continue;
				} catch {
					// Not found again: it is over as far as Pi can tell.
				}
			}
			active.set(record.id, { session: record.session, cancelRequested: false, timedOut: false, force: () => {} });
			await finish(record.id, "failed", undefined, "The Pi server restarted while the run was going, and the run could not be found again", key ?? "");
		}
		while (!signal.aborted) {
			for (const record of store.runs.value) {
				if (record.status === "running" || record.notified !== "no") continue;
				const count = (tries.get(record.id) ?? 0) + 1;
				tries.set(record.id, count);
				try {
					await notify(record.id);
				} catch (error) {
					if (count >= 40) {
						deps.log(`${record.id}: giving up on its wake: ${safe(error, undefined)}`);
						await put({ ...record, notified: "gave-up" }).catch(() => {});
					}
				}
			}
			await new Promise((resolve) => {
				const timer = setTimeout(resolve, 3_000);
				signal.addEventListener("abort", () => (clearTimeout(timer), resolve(undefined)), { once: true });
			});
		}
	}

	const mine = (session: string, id: string): RunRecord => {
		const record = find(id);
		if (record === undefined || record.session !== session) throw new Error("No such run");
		return record;
	};

	return {
		run,
		apiKey,
		clientFor,
		safe,

		async start(session: string, args: StartArgs): Promise<RunView> {
			const { ctx, store } = await whenReady;
			const existing = find(args.runId);
			if (existing !== undefined) return view(mine(session, args.runId));
			const key = await apiKey();
			if (key === undefined) throw new Error("No Cursor API key: the owner can set one in Settings › Cursor");
			let client: CursorClient;
			try {
				client = await clientFor(key);
			} catch (error) {
				throw new Error(safe(error, key));
			}
			const chosen = await plan(args, store.config.value, await catalogOf(client, key));
			if (active.size >= LIMITS.active) throw new Error(`${LIMITS.active} Cursor runs are already going: wait for one to end or cancel one`);
			if ([...active.values()].filter((entry) => entry.session === session).length >= LIMITS.activePerSession)
				throw new Error(`This session already has ${LIMITS.activePerSession} Cursor runs going: wait for one to end or cancel one`);
			const entry: Active = { session, cancelRequested: false, timedOut: false, force: () => {} };
			active.set(args.runId, entry);
			const now = Date.now();
			const record: RunRecord = {
				id: args.runId,
				runtime: chosen.runtime,
				mode: chosen.mode,
				status: "running",
				prompt: oneLine(args.prompt, 200),
				createdAt: now,
				deadline: now + (args.timeoutMinutes ?? LIMITS.defaultMinutes) * deps.minuteMs,
				session,
				conversation: args.conversation,
				text: "",
				notified: "no",
				...(chosen.model === undefined ? {} : { model: chosen.model }),
				...(chosen.repo === undefined ? {} : { repo: chosen.repo }),
				...(chosen.branch === undefined ? {} : { branch: chosen.branch }),
				...(chosen.cwd === undefined ? {} : { cwd: chosen.cwd }),
			};
			let handle: RunHandle;
			let sandbox: RunRecord["sandbox"];
			try {
				await store.put(record, ctx);
				let spec = chosen.spec;
				const required = (why: string) =>
					new Error(`Local sandboxing is set to “required” in Settings › Cursor, but ${why}. Set it to “when possible” or “off”, or use a cloud run`);
				if (spec.runtime === "local" && chosen.mode === "agent") {
					if (chosen.sandbox === "off") sandbox = "off";
					else {
						// Ask once per process before a real run has to fail; if the probe cannot tell, the run itself is the test.
						if (sandboxSeen.status === "unknown") await probe(client, spec.model).catch(() => undefined);
						if (sandboxSeen.status === "unsupported") {
							if (chosen.sandbox === "required") throw required(UNSUPPORTED);
							spec = { ...spec, sandbox: false };
							sandbox = "unavailable";
						} else sandbox = "on";
					}
				}
				try {
					handle = await client.start(spec);
				} catch (error) {
					const refused = error instanceof SandboxUnsupportedError || (error instanceof Error && isSandboxUnsupported(error.message));
					if (!refused || spec.runtime !== "local" || !spec.sandbox) throw error;
					await setSandbox({ status: "unsupported", detail: UNSUPPORTED });
					if (chosen.sandbox === "required") throw required(UNSUPPORTED);
					spec = { ...spec, sandbox: false };
					sandbox = "unavailable";
					handle = await client.start(spec);
				}
				if (sandbox === "on" && sandboxSeen.status !== "supported")
					await setSandbox({ status: "supported", detail: "A sandboxed run started" });
			} catch (error) {
				active.delete(args.runId);
				await store.remove({ id: args.runId }, ctx).catch(() => {});
				throw new Error(safe(error, key));
			}
			const started: RunRecord = {
				...record,
				agentId: handle.agentId,
				cursorRunId: handle.runId,
				...(sandbox === undefined ? {} : { sandbox }),
			};
			await store.put(started, ctx);
			void supervise(args.runId, handle, client, key);
			return view(started);
		},

		async status(session: string, id: string): Promise<RunView> {
			await whenReady;
			return view(mine(session, id));
		},

		async result(session: string, id: string, maxChars: number | undefined) {
			await whenReady;
			const record = mine(session, id);
			const limit = Math.min(maxChars ?? LIMITS.result, LIMITS.result);
			return { run: view(record), text: record.text.slice(0, limit), truncated: record.text.length > limit };
		},

		async cancel(session: string, id: string): Promise<RunView> {
			await whenReady;
			const record = mine(session, id);
			if (record.status !== "running") return view(record);
			const entry = active.get(id);
			if (entry === undefined) {
				await finish(id, "cancelled", undefined, undefined, "");
				return view(find(id) ?? record);
			}
			entry.cancelRequested = true;
			// If Cursor does not end the run soon after, it is given up on.
			setTimeout(() => entry.force(), deps.graceMs).unref?.();
			await entry.handle?.cancel().catch(() => {});
			return view(find(id) ?? record);
		},

		/** Asks the SDK again whether it can sandbox here (the owner's button). */
		async checkSandbox(): Promise<SandboxStatus> {
			const { store } = await whenReady;
			const key = await apiKey();
			if (key === undefined) return { status: sandboxSeen.status, detail: "No API key: the check needs one" };
			try {
				const client = await clientFor(key);
				const model = store.config.value.model || (await catalogOf(client, key))?.[0]?.id;
				if (!model) return { status: sandboxSeen.status, detail: "Choose a default model first: the check makes one small request" };
				return await probe(client, model);
			} catch (error) {
				return { status: sandboxSeen.status, detail: safe(error, key, 300) };
			}
		},

		/** The model ids the key may use (the live list), the default marked, and how to pass parameters. */
		async models() {
			const { store } = await whenReady;
			const key = await apiKey();
			if (key === undefined) throw new Error("No Cursor API key: the owner can set one in Settings › Cursor");
			const list = await catalogOf(await clientFor(key), key);
			if (list === undefined) throw new Error("Cursor's model list is not available now: try again shortly");
			const chosen = store.config.value.model;
			return {
				default: chosen,
				models: list.map((model) => ({ id: model.id, name: model.name, default: model.id === chosen, params: paramsText(model) })),
				note: "Pass `model` as one of these ids. A model's parameters go in `modelParams`, for example {\"effort\":\"high\",\"thinking\":\"true\"}; a CLI-style name such as claude-opus-5-thinking-high is also understood when its id and every extra word match a parameter. The default is used when `model` is left out.",
			};
		},

		async list(session: string): Promise<RunView[]> {
			await whenReady;
			return (live?.store.runs.value ?? [])
				.filter((record) => record.session === session)
				.sort((a, b) => b.createdAt - a.createdAt)
				.map(view);
		},
	};
}
export type Manager = ReturnType<typeof createManager>;
