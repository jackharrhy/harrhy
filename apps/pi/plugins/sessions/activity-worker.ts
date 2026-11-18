// Session-owned activity, separate from the stable owner-controlled title and transient work telemetry.
import { defineDoc, defineExtension } from "@earendil-works/pi-durable";
import { obj, str } from "@earendil-works/pi-schema";
import { expectVariant, type FacetHost, local, method } from "@p2/app/v1";
import { defineP2Tool, Extensions, harnessOf, type P2Tool, workerOf } from "@p2/app/v1/worker";
import { MAX_ACTIVITY, SessionActivity } from "./activity-contract.ts";

/** Session scope keeps this content out of conversation docs. Tool history retains normal shared visibility. */
const ActivityDoc = defineDoc<{ revision: number; text: string }>({
	kind: "p2.session-activity",
	version: 1,
	scope: "session",
	initial: () => ({ revision: 0, text: "" }),
	checkpointWhen: () => true,
});
const ActivityContent = local("p2.session-activity-content", {
	version: 1,
	params: {},
	members: { set: method(obj({ text: str({ maxLength: MAX_ACTIVITY }) })) },
});

/** Installs explicit set/clear activity semantics; agents have no session-title writer. */
export function serveActivity(host: FacetHost): void {
	host.serve(ActivityContent, (_params, self) => {
		const harness = harnessOf(self);
		const worker = workerOf(self);
		const feed = self.get(SessionActivity, {});
		const activity = self.follow(async (observer, ctx) => {
			const durable = harness().durable;
			const observed = await durable.observeDoc(ActivityDoc, observer, ctx);
			if (observed !== undefined) return observed;
			await durable.commit(async (tx) => {
				await tx.doc(ActivityDoc);
			}, ctx);
			return durable.observeDoc(ActivityDoc, observer, ctx);
		});
		// Startup and content changes reconcile the durable projection, including after an interrupted report.
		self.on(activity, async ({ value }, ctx) => {
			await expectVariant(feed, "reporter").report(value, ctx);
		});
		const extension = defineExtension<P2Tool>({
			name: "p2-session-activity",
			tools: [
				defineP2Tool({
					name: "set_activity",
					description: [
						"Set the current session's short, non-sensitive activity, separate from its stable owner-controlled name.",
						"Use a short phrase naming the overall task; update when that task changes, not for every step. The activity remains until replaced or explicitly cleared, including while idle and after restart.",
						'Pass text: "" to clear it. This does not rename the session. Only the owner sees the activity popover; normal tool history can be visible in shared conversations, so this is not secret storage.',
						`At most ${MAX_ACTIVITY} characters. No progress chatter or duplicate completion messages.`,
					].join("\n"),
					parameters: obj({ text: str({ maxLength: MAX_ACTIVITY }) }),
					replay: "safe",
					scope: "main",
					execute: async ({ text }, _api, context) => {
						await worker().root(async (ctx) => {
							await (await ctx.get(ActivityContent, {})).set({ text }, ctx);
						}, context);
						return { output: [{ type: "text", text: text.trim() ? "Activity set." : "Activity cleared." }] };
					},
				}),
			],
		});
		self.contribute(Extensions, { [extension.name]: extension });
		return {
			set: async ({ text }, ctx) => {
				const durable = harness().durable;
				const clean = text.replace(/\s+/g, " ").trim();
				await durable.commit(async (tx) => {
					const doc = await tx.doc(ActivityDoc);
					if (doc.text === clean) return;
					doc.text = clean;
					doc.revision++;
				}, ctx);
				const report = await durable.snapshot(ActivityDoc, ctx);
				if (report) await expectVariant(feed, "reporter").report(report, ctx);
				return null;
			},
		};
	});
}
