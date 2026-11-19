import {
	AssistantEntry,
	ConversationBusy,
	defineDoc,
	type EntryId,
	type SubmissionId,
} from "@earendil-works/pi-durable";
import {
	BACKGROUND_CONTEXT,
	type Ctx,
	defineFacet,
	expectVariant,
	forbidden,
	isOwner,
	local,
	PEER_MESSAGE_ENTRY,
	senderText,
	signalOf,
} from "@p2/app/v1";
import {
	harnessOf,
	InputGates,
	MainDoc,
	mainConversation,
	ReadOnlyConversations,
	SessionLockDoc,
	workerOf,
} from "@p2/app/v1/worker";
import { Goal, GoalEligibility, GoalMethods, type GoalView } from "./contract.ts";

type SavedGoal = Omit<GoalView, "submission"> & {
	submission: SubmissionId | null;
	id: string;
	epoch: string;
	expectedEntry: EntryId | null;
};
const Saved = defineDoc<{ goal: SavedGoal | null }>({
	kind: "p2.goal",
	version: 1,
	scope: "session",
	initial: () => ({ goal: null }),
	checkpointWhen: () => true,
});
const Runner = local("p2.goal-runner", { version: 1, params: {}, members: GoalMethods });

export default defineFacet((host) => {
	host.serve(Runner, (_params, self) => {
		const harness = harnessOf(self);
		const worker = workerOf(self);
		const eligibility = self.get(GoalEligibility, {});
		const gates = self.registry(InputGates);
		const readonly = self.registry(ReadOnlyConversations);
		let epoch = crypto.randomUUID();
		let wake = () => {};
		let revision = 0;
		const changed = () => {
			revision++;
			wake();
		};
		const durable = () => harness().durable;
		const read = async (ctx: Ctx) => (await durable().snapshot(Saved, ctx))?.goal ?? null;
		const check = async (ctx: Ctx) => expectVariant(eligibility, "worker").check({}, ctx);

		self.onLive(async (ctx) => {
			// Submission.wait and waitForIdle enable scheduling. Index scans must not call them.
			if (worker().init.values.session.resume === false) return;
			const signal = signalOf(ctx);
			signal.addEventListener("abort", changed);
			try {
				while (!signal.aborted) {
					const seen = revision;
					const goal = await read(ctx);
					if (goal?.phase === "active" && goal.epoch !== epoch) {
						await durable().commit(async (tx) => {
							const saved = (await tx.doc(Saved)).goal;
							if (saved?.phase === "active" && saved.epoch !== epoch) {
								saved.phase = "paused";
								saved.evidence = "Worker restarted; resume explicitly to admit another step.";
							}
						}, ctx);
						continue;
					}
					if (goal?.pending && goal.submission !== null) {
						const submission = await durable().submission(goal.submission, ctx);
						if (!submission) throw new Error("Goal receipt has no native submission");
						const result = await submission.wait(ctx);
						// Durable may settle the answer before the run's afterRun tasks finish.
						if (result.status === "done" && goal.phase === "active") {
							await (await durable().conversation(result.conversationId, ctx))?.waitForIdle(ctx);
						}
						await durable().commit(async (tx) => {
							const saved = (await tx.doc(Saved)).goal;
							if (saved?.id !== goal.id || saved.submission !== result.id || !saved.pending) return;
							saved.pending = false;
							if (result.status === "unanswered") {
								saved.phase = "blocked";
								saved.evidence = `Native submission unanswered: ${result.reason}`;
								return;
							}
							if (result.type !== "input") throw new Error("Goal receipt is not an input");
							saved.answer = result.answer;
							saved.expectedEntry = result.answer;
							const message = (await tx.entry(AssistantEntry, result.answer))?.model?.[0];
							const text =
								message?.role === "assistant" && message.stopReason === "stop"
									? message.content
											.flatMap((block) => (block.type === "text" ? [block.text] : []))
											.join("\n")
											.trimEnd()
									: "";
							const last = text.split("\n").at(-1) ?? "";
							const prefix = `GOAL ${goal.id}:${goal.steps} `;
							const verdict = last.startsWith(prefix)
								? /^(CONTINUE|COMPLETE|BLOCKED): (\S.*)$/.exec(last.slice(prefix.length))
								: null;
							saved.evidence =
								verdict?.[2]?.slice(0, 1000) ?? "No valid step report; inspect the native answer.";
							if (verdict?.[1] === "COMPLETE") saved.phase = "reported-complete";
							else if (!verdict || verdict[1] === "BLOCKED") saved.phase = "blocked";
							else if (saved.steps >= saved.limit) saved.phase = "exhausted";
						}, ctx);
						continue;
					}
					if (goal?.phase === "active") {
						const conversationId = await mainConversation(durable(), ctx);
						const conversation = await durable().conversation(conversationId, ctx);
						let reason = "";
						try {
							for (const gate of gates.value.values()) await gate(ctx);
							for (const guard of readonly.value.values()) reason ||= (await guard(conversationId, ctx)) ?? "";
							await worker().liveness.call(async () => {
								const reservation = !reason && conversation ? { token: crypto.randomUUID() } : null;
								// Keep the RPC scope alive through release even if the admission context is canceled.
								await worker().root(async (fenceCtx) => {
									const fence = expectVariant(await fenceCtx.get(GoalEligibility, {}), "worker");
									try {
										if (reservation && !(await fence.reserve(reservation, fenceCtx)))
											reason =
												"Goal mode requires a private, unarchived session with no access changes in progress.";
										signal.throwIfAborted();
										await durable().commit(async (tx) => {
											const saved = (await tx.doc(Saved)).goal;
											if (
												saved?.id !== goal.id ||
												saved.phase !== "active" ||
												saved.epoch !== epoch ||
												saved.pending
											)
												return;
											const main = (await tx.doc(MainDoc)).conversation;
											if (!conversation || main !== goal.conversation || main !== conversationId)
												reason ||= "The goal's conversation is no longer main.";
											if ((await tx.doc(SessionLockDoc)).lock !== null)
												reason ||= "Goal mode is unavailable in locked sessions.";
											if (reason || !conversation) {
												saved.phase = "paused";
												saved.evidence = reason;
												return;
											}
											if (((await tx.latestEntryId(conversation.id)) ?? null) !== saved.expectedEntry) {
												saved.phase = "paused";
												saved.evidence = "Conversation changed; review it before resuming.";
												return;
											}
											const step = saved.steps + 1;
											const label = "Goal mode";
											const text = `Objective: ${saved.objective}\n\nGoal step ${step}/${saved.limit}. Make bounded progress on the objective. Do not schedule work outside goal mode. If blocked or done, stop. Finish your answer with exactly one final line: GOAL ${saved.id}:${step} CONTINUE: <progress evidence>, GOAL ${saved.id}:${step} COMPLETE: <completion evidence>, or GOAL ${saved.id}:${step} BLOCKED: <blocker evidence>.`;
											saved.submission = await conversation.submit(tx, {
												type: "input",
												whenBusy: "reject-unless-idle",
												requestId: `goal:${saved.id}:${step}`,
												content: [
													{
														type: "text",
														text: senderText({ kind: "external", id: "p2.goal", name: label }),
													},
													{ type: "text", text },
												],
												entry: {
													kind: PEER_MESSAGE_ENTRY,
													data: { from: { id: "p2.goal", title: label, kind: "external" }, text },
												},
											});
											saved.steps = step;
											saved.pending = true;
											saved.answer = null;
										}, ctx);
									} finally {
										if (reservation) await fence.releaseReservation(reservation, fenceCtx);
									}
								}, BACKGROUND_CONTEXT);
							});
						} catch (error) {
							if (!(error instanceof ConversationBusy)) {
								// Suspend admissions before letting Chord report and retry the failed routine.
								epoch = crypto.randomUUID();
								throw error;
							}
							await durable().commit(async (tx) => {
								const saved = (await tx.doc(Saved)).goal;
								if (saved?.id !== goal.id || saved.phase !== "active" || saved.pending) return;
								saved.phase = "paused";
								saved.evidence = "Conversation busy; resume when it is idle.";
							}, ctx);
						}
						continue;
					}
					await new Promise<void>((resolve) => {
						wake = resolve;
						if (signal.aborted || seen !== revision) resolve();
					});
				}
			} finally {
				wake = () => {};
				signal.removeEventListener("abort", changed);
			}
		});

		const view = async (ctx: Ctx): Promise<GoalView | null> => {
			const goal = await read(ctx);
			if (!goal) return null;
			const { id: _id, epoch: _epoch, expectedEntry: _entry, ...status } = goal;
			if (status.phase === "active" && goal.epoch !== epoch)
				return { ...status, phase: "paused", evidence: "Worker restarted; explicit resume required." };
			return status;
		};
		const command = async (
			conversation: number,
			action: { kind: "pause" } | { kind: "resume" } | { kind: "start"; objective: string; limit: number },
			ctx: Ctx,
		) =>
			worker().liveness.call(async () => {
				if (worker().init.values.session.resume === false)
					throw forbidden("Goal commands are unavailable in index-only workers");
				const current = await mainConversation(durable(), ctx);
				await durable().commit(async (tx) => {
					if (conversation !== current || conversation !== (await tx.doc(MainDoc)).conversation)
						throw forbidden("Goal commands require the current main conversation");
					const doc = await tx.doc(Saved);
					if (action.kind !== "pause") {
						if ((await tx.doc(SessionLockDoc)).lock !== null || !(await check(ctx)))
							throw forbidden("Goal mode requires a private, unarchived, unlocked session");
					}
					if (action.kind === "start") {
						if (doc.goal?.pending || doc.goal?.phase === "active")
							throw forbidden("Pause the current goal and wait for its step to settle first");
						const objective = action.objective.trim();
						if (!objective) throw forbidden("An objective is required");
						doc.goal = {
							objective,
							conversation,
							limit: action.limit,
							steps: 0,
							phase: "active",
							evidence: "",
							submission: null,
							answer: null,
							id: crypto.randomUUID(),
							epoch,
							pending: false,
							expectedEntry: (await tx.latestEntryId(current)) ?? null,
						};
					} else if (doc.goal) {
						const goal = doc.goal;
						if (action.kind === "pause" && goal.phase === "active") {
							goal.phase = "paused";
							goal.evidence = "Paused by owner. An admitted step can still finish.";
						} else if (action.kind === "resume") {
							if (goal.conversation !== conversation)
								throw forbidden("Return to the goal's original main conversation to resume");
							if (goal.pending) throw forbidden("The admitted step has not settled yet");
							if (goal.phase !== "paused" && !(goal.phase === "active" && goal.epoch !== epoch))
								throw forbidden("Only a paused goal can resume");
							if (goal.steps >= goal.limit) throw forbidden("Step budget exhausted; start a new goal");
							goal.phase = "active";
							goal.epoch = epoch;
							goal.expectedEntry = (await tx.latestEntryId(current)) ?? null;
						}
					}
				}, ctx);
				changed();
				return view(ctx);
			});
		return {
			status: async ({ conversation }, ctx) => {
				if (conversation !== (await mainConversation(durable(), ctx)))
					throw forbidden("Goal commands require the current main conversation");
				return view(ctx);
			},
			start: ({ conversation, objective, limit }, ctx) =>
				command(conversation, { kind: "start", objective, limit }, ctx),
			pause: ({ conversation }, ctx) => command(conversation, { kind: "pause" }, ctx),
			resume: ({ conversation }, ctx) => command(conversation, { kind: "resume" }, ctx),
		};
	});
	host.serve(Goal, (_params, principal, self) => {
		if (!isOwner(principal)) throw forbidden("Goal mode is owner-only");
		const runner = self.get(Runner, {});
		return {
			variant: "owner",
			members: {
				status: (args, ctx) => runner.status(args, ctx),
				start: (args, ctx) => runner.start(args, ctx),
				pause: (args, ctx) => runner.pause(args, ctx),
				resume: (args, ctx) => runner.resume(args, ctx),
			},
		};
	});
});
