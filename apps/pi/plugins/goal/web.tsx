// Goal mode in the browser: the Goal sheet (command menu: "Goal", owner) to start, pause and resume the session's
// goal, and a chip beside the session's actions while a goal is active or paused. The contract has no change feed,
// so both poll `status` for the main conversation (docs/goal-mode.md).
import { BACKGROUND_CONTEXT, contribute, defineFacet } from "@p2/app/v1";
import {
	type Command,
	Commands,
	closeLayers,
	errorText,
	knownMain,
	openLayer,
	openLayerIn,
	Sheet,
	Slots,
	SparkIcon,
	useObject,
	useOwner,
	useRoute,
	useSheet,
	useStatus,
} from "@p2/app/v1/web";
import { useCallback, useEffect, useState } from "react";
import { Goal, type GoalView } from "./contract.ts";
import "./style.css";

const SHEET = "goal";
const DEFAULT_LIMIT = 5;

const PHASE_LABEL: Readonly<Record<GoalView["phase"], string>> = {
	active: "Running",
	paused: "Paused",
	"reported-complete": "Reported complete",
	blocked: "Blocked",
	exhausted: "Step limit reached",
};

/** The goal of the open session's main conversation, polled every `every` ms; undefined until first read. */
function useGoal(session: string | undefined, every: number) {
	const route = useRoute();
	const owner = useOwner();
	const conversation = session === undefined ? 0 : (route.conversation ?? knownMain(session));
	const goal = useObject(Goal, session !== undefined && owner ? { session } : undefined);
	const live = useStatus(goal) === "live";
	const [view, setView] = useState<GoalView | null>();
	const [error, setError] = useState<string>();
	const [busy, setBusy] = useState(false);
	const read = useCallback(async () => {
		if (!goal || !live) return;
		try {
			setView(await goal.status({ conversation }, BACKGROUND_CONTEXT));
			setError(undefined);
		} catch (reason) {
			setError(errorText(reason));
		}
	}, [goal, live, conversation]);
	useEffect(() => {
		if (!goal || !live) return;
		void read();
		const timer = setInterval(() => void read(), every);
		return () => clearInterval(timer);
	}, [goal, live, read, every]);
	const run = async (call: (held: NonNullable<typeof goal>) => Promise<GoalView | null>) => {
		if (!goal) return;
		setBusy(true);
		setError(undefined);
		try {
			setView(await call(goal));
		} catch (reason) {
			setError(errorText(reason));
		} finally {
			setBusy(false);
		}
	};
	return {
		view,
		error,
		busy,
		start: (objective: string, limit: number) =>
			run((held) => held.start({ conversation, objective, limit }, BACKGROUND_CONTEXT)),
		pause: () => run((held) => held.pause({ conversation }, BACKGROUND_CONTEXT)),
		resume: () => run((held) => held.resume({ conversation }, BACKGROUND_CONTEXT)),
	};
}

function GoalSheet({ session }: { session: string }) {
	const { view, error, busy, start, pause, resume } = useGoal(session, 2000);
	const [objective, setObjective] = useState("");
	const [limit, setLimit] = useState(DEFAULT_LIMIT);
	const running = view?.phase === "active" || view?.pending === true;
	const canResume = view?.phase === "paused" && !view.pending && view.steps < view.limit;
	const ready = objective.trim().length > 0 && !running && !busy;
	return (
		<Sheet title="Goal" onClose={closeLayers} testId="goal-sheet">
			{view === undefined && !error && <p className="muted small">Loading…</p>}
			{view === null && <p className="empty-note">No goal in this conversation.</p>}
			{view && (
				<div className="goal-status stack" data-phase={view.phase}>
					<p className="goal-objective">{view.objective}</p>
					<div className="goal-meta">
						<span className="chip on">{PHASE_LABEL[view.phase]}</span>
						<span className="muted small">
							Step {view.steps} of {view.limit}
							{view.pending ? " · a step is running" : ""}
						</span>
					</div>
					<progress className="goal-progress" max={view.limit} value={view.steps} aria-label="Steps used" />
					{view.evidence && <p className="muted small goal-evidence">{view.evidence}</p>}
					{view.phase === "reported-complete" && (
						<p className="muted small">The model reports it is done; check its answer in the transcript.</p>
					)}
					<div className="inline-form">
						{view.phase === "active" && (
							<button type="button" className="button" disabled={busy} onClick={() => void pause()}>
								Pause
							</button>
						)}
						{canResume && (
							<button type="button" className="button" disabled={busy} onClick={() => void resume()}>
								Resume
							</button>
						)}
					</div>
				</div>
			)}
			<form
				className="stack"
				onSubmit={(event) => {
					event.preventDefault();
					if (!ready) return;
					void start(objective.trim(), limit).then(() => setObjective(""));
				}}
			>
				<label className="field">
					<span className="label">{view ? "New goal" : "Objective"}</span>
					<textarea
						className="input"
						rows={3}
						maxLength={4000}
						value={objective}
						placeholder="What should the agent work on, step by step?"
						onChange={(event) => setObjective(event.target.value)}
					/>
				</label>
				<label className="field">
					<span className="label">Steps (1–12)</span>
					<input
						className="input"
						type="number"
						min={1}
						max={12}
						value={limit}
						onChange={(event) => setLimit(Math.min(12, Math.max(1, Math.trunc(Number(event.target.value)) || 1)))}
					/>
				</label>
				<div className="inline-form">
					<button type="submit" className="button" disabled={!ready}>
						{view ? "Replace goal" : "Start"}
					</button>
				</div>
				<p className="muted small">
					Each step is one ordinary turn in this conversation. The limit does not cap time, tokens or tool calls
					within a step. {running ? "Pause the current goal before starting another. " : ""}The session must stay
					private and unlocked.
				</p>
			</form>
			{error && (
				<p className="notice error" role="alert">
					{error}
				</p>
			)}
		</Sheet>
	);
}

/** The open session's Goal sheet while it is the top layer (owner only). */
function GoalSheetSlot() {
	const { session } = useRoute();
	const owner = useOwner();
	if (useSheet(SHEET) === undefined || session === undefined || !owner) return null;
	return <GoalSheet key={session} session={session} />;
}

/** In the top bar while a goal runs or is paused; opens the sheet. */
function GoalChip() {
	const { session } = useRoute();
	const { view } = useGoal(session, 5000);
	if (!view || (view.phase !== "active" && view.phase !== "paused")) return null;
	const state = view.phase === "paused" ? "paused" : "running";
	return (
		<button
			type="button"
			className={`chip toggle goal-chip ${view.phase === "active" ? "on" : ""}`}
			title={`Goal ${state}: ${view.objective}`}
			aria-label={`Goal ${state}, step ${view.steps} of ${view.limit}. Open`}
			onClick={() => openLayer({ kind: "sheet", name: SHEET })}
		>
			<SparkIcon size={14} />
			<span>
				{view.steps}/{view.limit}
			</span>
		</button>
	);
}

const GOAL_COMMANDS: Readonly<Record<string, Command>> = {
	"goal.open": {
		title: "Goal",
		group: "Goal",
		order: 45,
		icon: SparkIcon,
		keywords: ["objective", "autonomous", "steps", "pause", "resume"],
		target: ["session"],
		owner: true,
		action: {
			kind: "run",
			run: (ctx) => {
				const id = ctx.target?.type === "session" ? ctx.target.id : undefined;
				if (id !== undefined) openLayerIn(id, knownMain(id), { kind: "sheet", name: SHEET });
			},
		},
	},
};

export default defineFacet((host) => {
	contribute(host, "p2.web-goal", (self) => {
		self.contribute(Slots, { "overlay:goal": GoalSheetSlot, "topbar-end:goal": GoalChip });
		self.contribute(Commands, GOAL_COMMANDS);
	});
});
