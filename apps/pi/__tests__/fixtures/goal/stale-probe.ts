// Optional test facet: advance the transcript between goal activation and admission.
import { defineFacet, local } from "@p2/app/v1";
import { harnessOf, InputGates, mainConversation } from "@p2/app/v1/worker";

const Probe = local("p2.goal-stale-probe", { version: 1, params: {}, members: {} });

export default defineFacet((host) => {
	host.serve(Probe, (_params, self) => {
		const harness = harnessOf(self);
		let first = true;
		self.contribute(InputGates, {
			"goal-stale-probe": async (ctx) => {
				if (!first) return;
				first = false;
				const durable = harness().durable;
				const conversation = await durable.conversation(await mainConversation(durable, ctx), ctx);
				if (!conversation) throw new Error("Missing fixture conversation");
				await conversation.submit({ type: "write", entry: { kind: "p2.goal-stale-probe", data: {} } }, ctx);
			},
		});
		return {};
	});
});
