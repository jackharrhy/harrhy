// The owner opts in through the main conversation's TUI command, never through model input.
import { BACKGROUND_CONTEXT, contribute, defineFacet, expectVariant } from "@p2/app/v1";
import { lineText, type TuiCommand, TuiCommands } from "@p2/app/v1/tui";
import { Goal } from "./contract.ts";

const command: TuiCommand = {
	title: "Start, inspect, pause or resume a goal",
	category: "Chat",
	when: "chat && owner && !overlay",
	slash: { name: "goal", argumentHint: "[start <steps> <objective> | status | pause | resume]" },
	run: async (ctx, args) => {
		const { session, conversation } = ctx.identity;
		if (!session || conversation === undefined) return;
		const input = args?.trim() || "status";
		const start = /^start (\d+) ([\s\S]+)$/.exec(input);
		if (!start && input !== "status" && input !== "pause" && input !== "resume") {
			ctx.notify("Usage: /goal start <1–12 steps> <objective> | status | pause | resume", "warning");
			return;
		}
		await ctx.host.root(async (call) => {
			const goal = expectVariant(await call.get(Goal, { session }), "owner");
			const target = { conversation };
			const result = start
				? await goal.start({ ...target, limit: Number(start[1]), objective: start[2]! }, call)
				: input === "pause"
					? await goal.pause(target, call)
					: input === "resume"
						? await goal.resume(target, call)
						: await goal.status(target, call);
			ctx.notify(
				result
					? lineText(
							`Goal ${result.phase} · ${result.steps}/${result.limit} · ${result.objective}${result.evidence ? ` · ${result.evidence}` : ""}`,
						)
					: "No goal in this session",
			);
		}, BACKGROUND_CONTEXT);
	},
};

export default defineFacet((host) =>
	contribute(host, "p2.tui-goal", (self) => {
		self.contribute(TuiCommands, { "p2.goal": command });
	}),
);
