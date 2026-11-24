// The runs: starting one (after policy.ts), watching it until it ends, keeping its result and publishing one stimulus when
// it is done. Cloud and long local runs never hold a turn: the tool returns at once, this wakes the session later.
//
// A local run is a detached agent process (agent-process.ts) that Pi only observes through its run directory, so a Pi restart
// does not stop it. That is a convenience, not durability: a Cursor run is not a Pi session. If its process dies (Pi stopped
// under it, a crash, a kill, a reboot) the observer calls the run `interrupted` and says what interrupted it and what it had
// produced. The Cursor agent keeps its conversation and its edits are on disk, so `cursor_resume` (or the owner's auto-resume)
// starts a new worker that resumes the same agent with a message saying what happened.
import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { uptime } from "node:os";
import { join } from "node:path";
import { type Ctx, type Ref, signalOf } from "@p2/app/v1";
import { bindStimulusPublisher, WakeStore } from "@p2/app/v1/server";
import {
	type ClientFactory,
	type CursorClient,
	type ModelInfo,
	oneLine,
	type Outcome,
	type RunHandle,
	redact,
} from "./client.ts";
import { CursorRun } from "./contract.server.ts";
import {
	type CursorEvent,
	type Health,
	type RunView,
	type SandboxStatus,
	SOURCE_ID,
	SOURCE_VERSION,
	type StartArgs,
	type Status,
	type Survival,
} from "./contract.ts";
import { LIMITS, STALE_BEATS } from "./limits.ts";
import { checkRequest } from "./local-policy.ts";
import { paramsText } from "./models.ts";
import { plan } from "./policy.ts";
import {
	archiveAttempt,
	FILES,
	isWorker,
	makeRunDirectory,
	processStart,
	readJson,
	readText,
	type WorkerExit,
	type WorkerRequest,
	type WorkerStatus,
	writeJsonAtomic,
} from "./rundir.ts";
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
	/** `<data>/cursor-runs`: one directory per local run. */
	runsDir: string;
	/** The detached agent process's script, and the node that runs it. */
	agentScript: string;
	node: string;
	/** How often a local worker reports, and how often the server looks at the files. */
	heartbeatMs: number;
	pollMs: number;
	log: (message: string) => void;
};

type Store = Ref<typeof CursorStore>;
/** A run this process is watching. */
type Active = {
	session: string;
	handle?: RunHandle;
	cancelRequested: boolean;
	cancelAt?: number;
	timedOut: boolean;
	/** Ends the wait for a cloud run that does not answer its cancellation. */
	force: () => void;
	/** A local run's directory, and what the worker last reported. */
	directory?: string;
	status?: WorkerStatus;
	savedAt?: number;
};

const clean = (text: string) => text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g, " ");

/** Said when the service manager seems to take detached workers down with the server. */
const KILLED_AT_STOP =
	" The worker died when the Pi server stopped: the service manager is probably killing detached processes (under launchd set AbandonProcessGroup to true in the plist).";
/** At most this many automatic resumes per run. */
const AUTO_RESUMES = 2;
const iso = (at: number) => new Date(at).toISOString();
const bootTime = () => Date.now() - Math.round(uptime() * 1000);

/** The variables a worker gets besides the key: what Node and the SDK need to run and reach Cursor, not the server's secrets. */
const WORKER_ENV = /^(?:PATH|HOME|USER|LOGNAME|TMPDIR|LANG|LC_.*|SHELL|TERM|TZ|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|SSL_CERT_DIR|(?:HTTPS?|NO|ALL)_PROXY|(?:https?|no|all)_proxy|P2_CURSOR_.*|CURSOR_FAKE_.*)$/;

/** What the operator and this plugin recorded about the last stop: attached to the runs it interrupted. */
type Context = {
	/** An operator's `_interruption.json`: what they were doing, and who. */
	operator?: { event: string; by?: string; at?: number };
	stopped?: { at: number; signal?: string; ids: Set<string> };
};

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
	let context: Context = {};
	/** Set while a run's interruption is being recorded and Pi will resume it by itself (its wake says so). */
	const autoPending = new Set<string>();
	let lastSignal: string | undefined;
	const staleMs = deps.heartbeatMs * STALE_BEATS;

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

	/** A run as the agent and the owner see it, with its health: no prompt, no result text (`cursor_result` has that). */
	const viewOf = (record: RunRecord): RunView => {
		const { session: _s, conversation: _c, agentId: _a, cursorRunId: _r, deadline: _d, text, notified: _n, ...rest } = record;
		const entry = active.get(record.id);
		const beat = entry?.status?.heartbeatAt ?? record.heartbeatAt;
		const activity = entry?.status?.activity ?? record.activity;
		const files = entry?.status?.files.length ? entry.status.files.slice(0, 20) : record.files;
		const health: Health =
			record.status === "running" && record.runtime === "local" && beat !== undefined && Date.now() - beat > staleMs
				? "stale-heartbeat"
				: record.status;
		return {
			...rest,
			resultChars: text.length,
			health,
			...(beat === undefined ? {} : { heartbeatAt: beat }),
			...(activity === undefined ? {} : { activity }),
			...(files === undefined || files.length === 0 ? {} : { files }),
		};
	};

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
	const directoryOf = (id: string) => join(deps.runsDir, id);

	/** Ends a run: its status, its bounded text, then the stimulus. */
	async function finish(
		id: string,
		status: Status,
		outcome: Outcome | undefined,
		problem: string | undefined,
		key: string,
		extra: Partial<RunRecord> = {},
	) {
		const record = find(id);
		if (record === undefined) return;
		const now = Date.now();
		let text = clean(redact(outcome?.text ?? "", key)).slice(0, LIMITS.result);
		// A run that ends badly with nothing new keeps what it had before (a resumed run that could not resume).
		if (text === "" && status !== "finished") text = record.text;
		const error = problem ?? (status === "failed" && outcome?.error ? safe(outcome.error, key) : undefined);
		const { heartbeatAt: _h, interruption: _i, interruptedAt: _t, ...kept } = record;
		const next: RunRecord = {
			...kept,
			...extra,
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

	/** Watches one cloud run until it ends, is cancelled or runs out of time. */
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
					// The facet is replaced or the server stops: a cloud run is found again by the next one.
					if (result === "stopped") return;
					if (result === "hard") {
						entry.timedOut ||= !entry.cancelRequested;
						problem = entry.timedOut ? "The run did not end in time and was given up on" : "The run did not answer its cancellation";
					} else outcome = result;
				} catch (error) {
					if (signal.aborted) return;
					// A lost connection to a cloud run is not the end of the run: look for it again.
					if (Date.now() < record.deadline && attempts < 12 && !entry.cancelRequested) {
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

	const sleep = (ms: number, signal: AbortSignal) =>
		new Promise<void>((resolve) => {
			const timer = setTimeout(resolve, ms);
			signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
		});

	/** Whether the worker of `status` is that process still. */
	const aliveOf = (status: WorkerStatus | undefined) => (status === undefined ? Promise.resolve(false) : isWorker(status.pid, status.start));

	const killGroup = (pid: number) => {
		for (const target of [-pid, pid]) {
			try {
				process.kill(target, "SIGKILL");
				return;
			} catch {
				// Not that one.
			}
		}
	};

	/** Reads what a local run left in its directory into an outcome (clean exit). */
	async function outcomeOf(directory: string, exit: WorkerExit): Promise<{ outcome: Outcome; extra: Partial<RunRecord> }> {
		const saved = (await readJson<{ text: string }>(join(directory, FILES.result)))?.text;
		const text = saved ?? (await readText(join(directory, FILES.partial), LIMITS.result));
		return {
			outcome: {
				status: exit.status === "finished" ? "finished" : exit.status === "failed" ? "error" : "cancelled",
				text,
				...(exit.error === undefined ? {} : { error: exit.error }),
				durationMs: exit.durationMs,
				...(exit.usage === undefined ? {} : { usage: exit.usage }),
				...(exit.git === undefined ? {} : { git: exit.git }),
			},
			extra: {
				...(exit.sandbox === undefined ? {} : { sandbox: exit.sandbox }),
				...(exit.files.length === 0 ? {} : { files: exit.files.slice(0, 20) }),
			},
		};
	}

	/** Follows one local run through its directory until it ends, dies or is given up on. */
	async function observe(id: string, key: string, atStart = false) {
		const entry = active.get(id);
		const directory = entry?.directory;
		if (entry === undefined || directory === undefined) return;
		const { ctx } = await whenReady;
		const signal = signalOf(ctx);
		while (!signal.aborted) {
			const record = find(id);
			if (record === undefined || record.status !== "running") return;
			const exit = await readJson<WorkerExit>(join(directory, FILES.exit));
			if (exit !== undefined) {
				const { outcome, extra } = await outcomeOf(directory, exit);
				if (exit.sandboxUnsupported) await setSandbox({ status: "unsupported", detail: UNSUPPORTED });
				else if (exit.sandbox === "on" && sandboxSeen.status !== "supported") await setSandbox({ status: "supported", detail: "A sandboxed run ran" });
				await finish(id, exit.status, outcome, exit.error, key, extra).catch((error: unknown) => deps.log(`${id}: could not record the end: ${safe(error, key)}`));
				return;
			}
			const status = await readJson<WorkerStatus>(join(directory, FILES.status));
			if (status !== undefined) entry.status = status;
			const alive = await aliveOf(entry.status);
			// A worker that has not written its first status yet (the server restarted a moment after starting it) is given a while.
			const starting = entry.status === undefined && Date.now() - record.createdAt < Math.max(5_000, deps.heartbeatMs);
			if (!alive && !starting) {
				// The exit file is written last, just before the process ends: look once more before saying it is lost.
				const late = await readJson<WorkerExit>(join(directory, FILES.exit));
				if (late === undefined) return void (await interrupt(id, key, directory, atStart));
				continue;
			}
			// Persist what the worker reported now and then, so a restart of Pi still knows.
			if (entry.status !== undefined && Date.now() - (entry.savedAt ?? 0) >= deps.heartbeatMs) {
				entry.savedAt = Date.now();
				await put({
					...record,
					heartbeatAt: entry.status.heartbeatAt,
					...(entry.status.activity === undefined ? {} : { activity: entry.status.activity }),
					...(entry.status.files.length === 0 ? {} : { files: entry.status.files.slice(0, 20) }),
					...(entry.status.sandbox === undefined ? {} : { sandbox: entry.status.sandbox }),
				}).catch(() => {});
			}
			// Backstops: the worker enforces its own deadline and cancellation, but it may be hung.
			const overdue = Date.now() > record.deadline + deps.graceMs * 2 + deps.pollMs * 2;
			const ignored = entry.cancelAt !== undefined && Date.now() > entry.cancelAt + deps.graceMs * 2 + deps.pollMs * 2;
			if (alive && (overdue || ignored) && entry.status !== undefined) {
				killGroup(entry.status.pid);
				const text = await readText(join(directory, FILES.partial), LIMITS.result);
				const timedOut = overdue && !entry.cancelRequested;
				await finish(
					id,
					timedOut ? "timed-out" : "cancelled",
					{ status: "cancelled", text },
					timedOut ? "The run did not end in time and its process was stopped" : "The run did not answer its cancellation and its process was stopped",
					key,
					{ ...(entry.status.files.length ? { files: entry.status.files.slice(0, 20) } : {}) },
				).catch(() => {});
				return;
			}
			await sleep(deps.pollMs, signal);
		}
	}

	/** Why a worker died, from what Pi recorded: the operator's note, Pi's own stop record, a reboot, or nothing. */
	function eventFor(id: string, status: WorkerStatus | undefined, atStart: boolean): { event: string; at: number; stopped: boolean } {
		const parts: string[] = [];
		let at = status?.heartbeatAt ?? Date.now();
		let stopped = false;
		if (atStart && context.operator !== undefined) {
			parts.push(`${context.operator.event}${context.operator.by ? ` (noted by ${context.operator.by})` : ""}`);
			at = context.operator.at ?? context.stopped?.at ?? at;
		} else if (atStart && context.stopped?.ids.has(id)) {
			parts.push(`the Pi server stopping or restarting${context.stopped.signal ? ` (${context.stopped.signal})` : ""}`);
			at = context.stopped.at;
			stopped = true;
		}
		if (status !== undefined && Math.abs(bootTime() - status.bootAt) > 120_000) parts.push("the machine rebooting");
		return { event: parts.length ? parts.join(" and ") : "a worker process that died without a recorded reason", at, stopped };
	}

	/**
	 * The worker is gone and did not say how it ended: the run is interrupted (resumable) with whatever it had produced, or
	 * failed when there is no Cursor agent to resume.
	 */
	async function interrupt(id: string, key: string, directory: string, atStart: boolean) {
		const record = find(id);
		const entry = active.get(id);
		if (record === undefined) return;
		const status = entry?.status ?? (await readJson<WorkerStatus>(join(directory, FILES.status)));
		const text = (await readText(join(directory, FILES.partial), LIMITS.result)) || record.text;
		const agentId = status?.agentId ?? record.agentId;
		const { event, at, stopped } = eventFor(id, status, atStart);
		const extra: Partial<RunRecord> = {
			...(status?.activity === undefined ? {} : { activity: status.activity }),
			...(status === undefined || status.files.length === 0 ? {} : { files: status.files.slice(0, 20) }),
			...(status?.sandbox === undefined ? {} : { sandbox: status.sandbox }),
			...(agentId === undefined ? {} : { agentId }),
			...(status?.cursorRunId === undefined ? {} : { cursorRunId: status.cursorRunId }),
		};
		const durationMs = Math.max(0, (status?.heartbeatAt ?? record.createdAt) - record.createdAt);
		if (agentId === undefined) {
			// Nothing to resume: the worker died before Cursor made its agent.
			await finish(id, "failed", { status: "error", text, durationMs }, `The worker died (${event}) before the Cursor agent was created, so there is nothing to resume. Start the task again.`, key, extra).catch(() => {});
			return;
		}
		const auto = await autoResumable(record);
		if (auto) autoPending.add(id);
		await finish(id, "interrupted", { status: "error", text, durationMs }, undefined, key, {
			...extra,
			interruption: `${event}${stopped ? KILLED_AT_STOP : ""}`.slice(0, 500),
			interruptedAt: at,
			...(auto ? { autoResumes: (record.autoResumes ?? 0) + 1 } : {}),
		}).catch((error: unknown) => deps.log(`${id}: could not record the end: ${safe(error, key)}`));
		autoPending.delete(id);
		if (auto) await resumeRun(record.session, id, undefined, true).catch((error: unknown) => deps.log(`${id}: automatic resume failed: ${safe(error, key)}`));
	}

	/** Whether Pi should resume this interrupted run by itself: the owner allowed it, and it has not been twice. */
	async function autoResumable(record: RunRecord): Promise<boolean> {
		const { store } = await whenReady;
		return store.config.value.autoResume === true && (record.autoResumes ?? 0) < AUTO_RESUMES;
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
			...(record.activity === undefined ? {} : { activity: record.activity }),
			...(record.files === undefined ? {} : { files: record.files }),
			...(status !== "interrupted" ? {} : { interruption: record.interruption ?? "a worker process that died without a recorded reason", ...(record.interruptedAt === undefined ? {} : { interruptedAt: record.interruptedAt }), ...(record.cwd === undefined ? {} : { cwd: record.cwd }), ...(autoPending.has(id) ? { autoResumed: record.autoResumes ?? 1 } : {}) }),
			...(record.error === undefined ? {} : { error: record.error }),
			...(record.git === undefined ? {} : { git: record.git }),
			...(record.durationMs === undefined ? {} : { durationMs: record.durationMs }),
		};
		// One event per run and ending: polling again, a restart or a replay never repeats it.
		const eventId = `${record.id}:${status}:${record.attempt ?? 1}`;
		const publisher = bindStimulusPublisher(wake, CursorRun, row);
		if ((await publisher.receipt({ eventId }, ctx)).state === "missing") await publisher.publish({ eventId, event }, ctx);
		await put({ ...(store.runs.value.find((run) => run.id === id) ?? record), notified: "yes" });
	}

	const STOPPED = "_stopped.json";
	const INTERRUPTION = "_interruption.json";
	/**
	 * What the last stop left behind, read once at start: Pi's own record of a graceful stop (the workers it had), the
	 * operator's note about a planned one, and whether the workers outlived it (for Settings).
	 */
	async function loadContext(store: Store, ctx: Ctx) {
		const stopped = await readJson<{ at: number; signal?: string; workers: { id: string; pid: number; start: string }[] }>(join(deps.runsDir, STOPPED));
		const note = await readJson<{ event?: unknown; by?: unknown; at?: unknown }>(join(deps.runsDir, INTERRUPTION));
		await rm(join(deps.runsDir, STOPPED), { force: true });
		await rm(join(deps.runsDir, INTERRUPTION), { force: true });
		context = {};
		if (typeof note?.event === "string" && note.event.trim() !== "") {
			const at = typeof note.at === "string" || typeof note.at === "number" ? new Date(note.at).getTime() : Number.NaN;
			context.operator = {
				event: oneLine(note.event, 200),
				...(typeof note.by === "string" ? { by: oneLine(note.by, 80) } : {}),
				...(Number.isFinite(at) ? { at } : {}),
			};
		}
		if (stopped === undefined) return;
		let survived = 0;
		const ids = new Set<string>();
		for (const worker of stopped.workers) {
			if (await isWorker(worker.pid, worker.start)) survived++;
			else if ((await readJson(join(directoryOf(worker.id), FILES.exit))) === undefined) ids.add(worker.id);
		}
		context.stopped = { at: stopped.at, ...(stopped.signal === undefined ? {} : { signal: stopped.signal }), ids };
		let next: Survival | undefined;
		if (survived > 0) next = { status: "survives", detail: `${survived} detached worker${survived === 1 ? "" : "s"} outlived the last Pi stop.` };
		else if (ids.size > 0)
			next = {
				status: "killed",
				detail: `${ids.size} detached worker${ids.size === 1 ? " was" : "s were"} killed when Pi stopped: the service manager takes detached processes down with the server. Under launchd set AbandonProcessGroup to true in the plist, then restart the job.`,
			};
		if (next !== undefined) await store.setSurvival(next, ctx);
	}

	/** Written when Pi stops gracefully, before the observers go: the workers it was watching, why, and the signal if it knows. */
	async function writeStopped() {
		const workers = [...active.entries()].flatMap(([id, entry]) => (entry.status === undefined || entry.directory === undefined ? [] : [{ id, pid: entry.status.pid, start: entry.status.start }]));
		if (workers.length === 0) return;
		await writeJsonAtomic(join(deps.runsDir, STOPPED), {
			event: "the Pi server stopped or restarted",
			at: Date.now(),
			...(lastSignal === undefined ? {} : { signal: lastSignal }),
			workers,
		}).catch(() => {});
	}

	/** Looks after runs that outlived the last process (a local worker is followed, a cloud run found again), then after wakes. */
	async function run(ctx: Ctx, store: Store) {
		live = { ctx, store };
		ready(live);
		const signal = signalOf(ctx);
		const tries = new Map<string, number>();
		// The record of a graceful stop is written the moment the stop starts, before anything else lets go.
		let stopping: Promise<void> = Promise.resolve();
		// The signal that started the stop, if the server already handles it (adding a handler would otherwise change what it does).
		const noted = new Map<NodeJS.Signals, () => void>();
		for (const name of ["SIGTERM", "SIGINT", "SIGHUP"] as const)
			if (process.listenerCount(name) > 0) noted.set(name, () => void (lastSignal = name));
		for (const [name, listener] of noted) process.on(name, listener);
		signal.addEventListener(
			"abort",
			() => {
				stopping = writeStopped();
				for (const [name, listener] of noted) process.off(name, listener);
			},
			{ once: true },
		);
		await loadContext(store, ctx).catch((error: unknown) => deps.log(`could not read the last stop's record: ${safe(error, undefined)}`));
		for (const record of store.runs.value.filter((entry) => entry.status === "running" && !active.has(entry.id))) {
			const key = await apiKey().catch(() => undefined);
			const directory = directoryOf(record.id);
			const entry: Active = { session: record.session, cancelRequested: false, timedOut: false, force: () => {} };
			if (record.runtime === "local") {
				active.set(record.id, entry);
				if ((await readJson(join(directory, FILES.request))) !== undefined) {
					entry.directory = directory;
					void observe(record.id, key ?? "", true);
				} else {
					await finish(record.id, "failed", undefined, `This run was going inside the Pi server process of an older version of this plugin, which stopped; it left no worker and no record Pi can resume from.${record.agentId ? ` Its Cursor agent id is ${record.agentId}: the Cursor CLI can resume it (cursor-agent --resume).` : ""}`, key ?? "");
				}
				continue;
			}
			if (key !== undefined && record.agentId !== undefined && record.cursorRunId !== undefined) {
				try {
					const client = await clientFor(key);
					const handle = await client.attach({ agentId: record.agentId, runId: record.cursorRunId });
					active.set(record.id, entry);
					void supervise(record.id, handle, client, key);
					continue;
				} catch {
					// Not found again: it is over as far as Pi can tell.
				}
			}
			active.set(record.id, entry);
			// A cloud agent lives at Cursor: if it cannot be found again now, it can still be resumed by its id later.
			await finish(
				record.id,
				record.agentId === undefined ? "failed" : "interrupted",
				undefined,
				record.agentId === undefined ? "The Pi server restarted before the cloud agent was created" : undefined,
				key ?? "",
				record.agentId === undefined
					? {}
					: { interruption: "the Pi server restarting, after which the cloud run could not be found again", interruptedAt: Date.now() },
			);
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
			await sleep(3_000, signal);
		}
		// Stopping: local workers go on without this process.
		await stopping;
	}

	const mine = (session: string, id: string): RunRecord => {
		const record = find(id);
		if (record === undefined || record.session !== session) throw new Error("No such run");
		return record;
	};

	/** Whether to ask the SDK for its sandbox for an agent-mode local run; throws when it is required and not available. */
	async function wantSandbox(client: CursorClient, model: string, sandboxMode: "when-possible" | "required" | "off"): Promise<boolean> {
		if (sandboxMode === "off") return false;
		// Ask once per process before a real run has to fail; if the probe cannot tell, the worker's own start is the test.
		if (sandboxSeen.status === "unknown") await probe(client, model).catch(() => undefined);
		if (sandboxSeen.status === "unsupported") {
			if (sandboxMode === "required")
				throw new Error(`Local sandboxing is set to “required” in Settings › Cursor, but ${UNSUPPORTED}. Set it to “when possible” or “off”, or use a cloud run`);
			return false;
		}
		return true;
	}

	/** Starts a detached agent process for a local run and waits briefly to see whether it got going. */
	async function startLocal(record: RunRecord, request: WorkerRequest, key: string, entry: Active): Promise<void> {
		const directory = request.attempt > 1 ? directoryOf(record.id) : await makeRunDirectory(deps.runsDir, record.id);
		entry.directory = directory;
		await writeJsonAtomic(join(directory, FILES.request), request);
		const env: NodeJS.ProcessEnv = {};
		for (const [name, value] of Object.entries(deps.env)) if (value !== undefined && WORKER_ENV.test(name)) env[name] = value;
		// The key goes by the environment only: not argv (visible in `ps`), not a file.
		env.CURSOR_API_KEY = key;
		const log = openSync(join(directory, FILES.log), "a", 0o600);
		try {
			const child = spawn(deps.node, [deps.agentScript, directory], { detached: true, stdio: ["ignore", log, log], env, cwd: directory });
			await new Promise<void>((resolve, reject) => {
				child.once("spawn", () => resolve());
				child.once("error", reject);
			});
			child.unref();
			entry.status = undefined;
			const pid = child.pid;
			// Until the worker writes its own status the process is known by the pid alone.
			if (pid !== undefined) {
				const start = await processStart(pid);
				if (start !== undefined) entry.status = { pid, start, startedAt: Date.now(), bootAt: bootTime(), state: "starting", heartbeatAt: Date.now(), files: [], chars: 0 };
			}
		} finally {
			closeSync(log);
		}
		// A run that cannot start (a bad request, no SDK, the SDK refusing) fails here, as it did when the SDK ran in this process.
		const until = Date.now() + 30_000;
		while (Date.now() < until) {
			const exit = await readJson<WorkerExit>(join(directory, FILES.exit));
			if (exit !== undefined) {
				const logged = oneLine(safe(await readText(join(directory, FILES.log), 400), key), 300);
				throw new Error(exit.error ?? `The agent process ended at once${logged ? `: ${logged}` : ""}`);
			}
			const status = await readJson<WorkerStatus>(join(directory, FILES.status));
			if (status !== undefined) entry.status = status;
			if (status?.state === "running") return;
			if (!(await aliveOf(entry.status))) {
				const late = await readJson<WorkerExit>(join(directory, FILES.exit));
				const logged = oneLine(safe(await readText(join(directory, FILES.log), 400), key), 300);
				throw new Error(late?.error ?? `The agent process died at start${logged ? `: ${logged}` : ""}`);
			}
			await new Promise((resolve) => setTimeout(resolve, Math.min(deps.pollMs, 100)));
		}
	}

	/** What an interrupted agent is told when it is resumed: what happened, and to check its files first. */
	const resumeMessage = (record: RunRecord, auto: boolean, instruction: string | undefined) =>
		[
			`You were interrupted by ${record.interruption ?? "a worker process that died without a recorded reason"} at ${record.interruptedAt === undefined ? "an unrecorded time" : iso(record.interruptedAt)}; your previous partial work is on disk in ${record.cwd ?? "the working directory"}; check the state of the files, then continue the task.`,
			record.activity ? `Your last recorded activity was: ${record.activity}.` : "",
			auto ? "Pi resumed you automatically (the owner allows that)." : "",
			instruction ? `Extra instruction from the Pi session:\n${instruction}` : "",
		]
			.filter(Boolean)
			.join("\n");

	/** Resumes an interrupted run: the same Cursor agent in a new worker (or a cloud resume), told what happened. */
	async function resumeRun(session: string, id: string, instruction: string | undefined, auto: boolean): Promise<RunView> {
		const { ctx, store } = await whenReady;
		const record = mine(session, id);
		if (record.status !== "interrupted")
			throw new Error(
				record.status === "running"
					? "That run is still going"
					: `That run ${record.status === "failed" ? "failed and cannot be resumed" : `is ${record.status}: only an interrupted run can be resumed`}. Start a new task instead`,
			);
		if (record.agentId === undefined) throw new Error("There is no Cursor agent to resume");
		const key = await apiKey();
		if (key === undefined) throw new Error("No Cursor API key: the owner can set one in Settings › Cursor");
		if (active.size >= LIMITS.active) throw new Error(`${LIMITS.active} Cursor runs are already going: wait for one to end or cancel one`);
		if ([...active.values()].filter((entry) => entry.session === session).length >= LIMITS.activePerSession)
			throw new Error(`This session already has ${LIMITS.activePerSession} Cursor runs going: wait for one to end or cancel one`);
		// The 120 minutes are for the whole run, however many workers it takes.
		const now = Date.now();
		const latest = record.createdAt + LIMITS.maxMinutes * deps.minuteMs;
		const deadline = Math.min(now + LIMITS.defaultMinutes * deps.minuteMs, latest);
		if (deadline - now < deps.minuteMs) throw new Error(`The run has used its ${LIMITS.maxMinutes} minutes: start a new task instead`);
		const message = resumeMessage(record, auto, instruction);
		const attempt = (record.attempt ?? 1) + 1;
		const entry: Active = { session, cancelRequested: false, timedOut: false, force: () => {} };
		const client = await clientFor(key).catch((error: unknown) => {
			throw new Error(safe(error, key));
		});
		const running: RunRecord = { ...record, status: "running", notified: "no", deadline, attempt };
		delete running.finishedAt;
		delete running.error;
		delete running.interruption;
		delete running.interruptedAt;
		let handle: RunHandle | undefined;
		try {
			if (record.runtime === "local") {
				const directory = directoryOf(id);
				const old = await readJson<WorkerRequest>(join(directory, FILES.request));
				if (old === undefined) throw new Error("The run's record of what it was asked is gone");
				const edits = store.config.value.allowLocalEdits;
				const sandboxMode = store.config.value.sandbox ?? "when-possible";
				const sandbox = old.mode === "agent" ? await wantSandbox(client, old.model, sandboxMode) : false;
				const request: WorkerRequest = { ...old, allowEdits: edits, sandboxMode, sandbox, deadline, attempt, resume: { agentId: record.agentId, message }, heartbeatMs: deps.heartbeatMs, pollMs: deps.pollMs };
				await checkRequest(request);
				active.set(id, entry);
				await archiveAttempt(directory, attempt - 1);
				await put(running);
				await startLocal(running, request, key, entry);
				const status = entry.status;
				await put({ ...running, ...(status?.sandbox === undefined ? {} : { sandbox: status.sandbox }), ...(status === undefined ? {} : { heartbeatAt: status.heartbeatAt }) });
			} else {
				active.set(id, entry);
				await put(running);
				handle = await client.start({
					runtime: "cloud",
					prompt: record.prompt,
					mode: record.mode === "agent" ? "agent" : "plan",
					repo: record.repo ?? "",
					...(record.branch === undefined ? {} : { branch: record.branch }),
					...(record.model === undefined ? {} : { model: record.model.split(" (")[0] ?? record.model }),
					resume: { agentId: record.agentId, message },
				});
			}
		} catch (error) {
			if (entry.status !== undefined) killGroup(entry.status.pid);
			// The agent could not be resumed (an id Cursor does not know, the SDK refusing): the run is over for good.
			await finish(id, "failed", { status: "error", text: record.text }, `It could not be resumed: ${safe(error, key)}`, key, { ...(record.activity === undefined ? {} : { activity: record.activity }) }).catch(() => {});
			throw new Error(`It could not be resumed: ${safe(error, key)}`);
		}
		if (handle !== undefined) void supervise(id, handle, client, key);
		else void observe(id, key);
		return viewOf(find(id) ?? running);
	}

	return {
		run,
		apiKey,
		clientFor,
		safe,

		async start(session: string, args: StartArgs): Promise<RunView> {
			const { ctx, store } = await whenReady;
			const existing = find(args.runId);
			if (existing !== undefined) return viewOf(mine(session, args.runId));
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
			let handle: RunHandle | undefined;
			let started = record;
			try {
				await store.put(record, ctx);
				let spec = chosen.spec;
				if (spec.runtime === "local" && chosen.mode === "agent" && !(await wantSandbox(client, spec.model, chosen.sandbox)))
					spec = { ...spec, sandbox: false };
				if (spec.runtime === "local") {
					if (chosen.base === undefined) throw new Error("No directory");
					await startLocal(
						record,
						{
							version: 1,
							runId: record.id,
							prompt: spec.prompt,
							model: spec.model,
							...(spec.modelParams === undefined ? {} : { modelParams: spec.modelParams }),
							mode: spec.mode,
							base: chosen.base,
							cwd: spec.cwd,
							allowEdits: store.config.value.allowLocalEdits,
							sandboxMode: chosen.sandbox,
							sandbox: spec.sandbox,
							deadline: record.deadline,
							heartbeatMs: deps.heartbeatMs,
							pollMs: deps.pollMs,
							attempt: 1,
						},
						key,
						entry,
					);
					const status = entry.status;
					started = {
						...record,
						...(status?.agentId === undefined ? {} : { agentId: status.agentId }),
						...(status?.cursorRunId === undefined ? {} : { cursorRunId: status.cursorRunId }),
						...(status?.sandbox === undefined ? {} : { sandbox: status.sandbox }),
						...(status === undefined ? {} : { heartbeatAt: status.heartbeatAt }),
					};
					if (spec.sandbox && status?.sandbox === "unavailable") await setSandbox({ status: "unsupported", detail: UNSUPPORTED });
					else if (status?.sandbox === "on" && sandboxSeen.status !== "supported") await setSandbox({ status: "supported", detail: "A sandboxed run started" });
				} else {
					handle = await client.start(spec);
					started = { ...record, agentId: handle.agentId, cursorRunId: handle.runId };
				}
			} catch (error) {
				active.delete(args.runId);
				if (entry.status !== undefined) killGroup(entry.status.pid);
				await rm(directoryOf(args.runId), { recursive: true, force: true }).catch(() => {});
				await store.remove({ id: args.runId }, ctx).catch(() => {});
				throw new Error(safe(error, key));
			}
			await store.put(started, ctx);
			if (handle !== undefined) void supervise(args.runId, handle, client, key);
			else void observe(args.runId, key);
			return viewOf(started);
		},

		async status(session: string, id: string): Promise<RunView> {
			await whenReady;
			return viewOf(mine(session, id));
		},

		async result(session: string, id: string, maxChars: number | undefined) {
			await whenReady;
			const record = mine(session, id);
			const limit = Math.min(maxChars ?? LIMITS.result, LIMITS.result);
			// A local run that is going: what it has streamed so far.
			const text =
				record.status === "running" && record.runtime === "local"
					? clean(redact(await readText(join(directoryOf(id), FILES.partial), LIMITS.result), await apiKey()))
					: record.text;
			return { run: viewOf(record), text: text.slice(0, limit), truncated: text.length > limit };
		},

		async cancel(session: string, id: string): Promise<RunView> {
			await whenReady;
			const record = mine(session, id);
			if (record.status !== "running") return viewOf(record);
			const entry = active.get(id);
			if (entry === undefined) {
				await finish(id, "cancelled", undefined, undefined, "");
				return viewOf(find(id) ?? record);
			}
			entry.cancelRequested = true;
			entry.cancelAt = Date.now();
			if (entry.directory !== undefined) {
				// The worker looks for this file and cancels its agent.
				await writeFile(join(entry.directory, FILES.cancel), "", { mode: 0o600 }).catch(() => {});
			} else {
				// If Cursor does not end a cloud run soon after, it is given up on.
				setTimeout(() => entry.force(), deps.graceMs).unref?.();
				await entry.handle?.cancel().catch(() => {});
			}
			return viewOf(find(id) ?? record);
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

		/** Continues an interrupted run (the agent's `cursor_resume`). */
		resume: (session: string, id: string, instruction: string | undefined) => resumeRun(session, id, instruction, false),

		async list(session: string): Promise<RunView[]> {
			await whenReady;
			return (live?.store.runs.value ?? [])
				.filter((record) => record.session === session)
				.sort((a, b) => b.createdAt - a.createdAt)
				.map(viewOf);
		},
	};
}
export type Manager = ReturnType<typeof createManager>;

