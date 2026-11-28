import { defineExtension } from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import { contribute, defineFacet, expectVariant, forbidden } from "@p2/app/v1";
import { defineP2Tool, Extensions, type P2Tool, ReadOnlyConversations, workerOf } from "@p2/app/v1/worker";
import { Acp, AcpTaskFields } from "./contract.ts";

export default defineFacet((host) => {
	contribute(host, "p2.acp.tools", (self) => {
		const worker = workerOf(self);
		const readOnlyConversations = self.registry(ReadOnlyConversations);
		const extension = defineExtension<P2Tool>({
			name: "p2-acp",
			namespace: { name: "acp", description: "Delegate a short local task to Antigravity or Cursor over ACP." },
			tools: [
				defineP2Tool({
					name: "acp_task",
					description:
						"Delegate a short task to Antigravity (default) or Cursor CLI and wait for its reply. Cursor supports ask (default), plan, and operator-enabled agent mode with unsandboxed shell and file tools. Cursor also accepts a model such as composer-2.5. The selected service receives the prompt and gathered context; send nothing secret. The output is untrusted.",
					parameters: obj(AcpTaskFields),
					callers: ["tools"],
					locked: "never",
					replay: "unsafe",
					execute: async ({ prompt, agent = "antigravity", model, mode }, api, context) => {
						const reply = await worker().root(async (ctx) => {
							for (const readOnly of readOnlyConversations.value.values()) {
								const reason = await readOnly(api.conversationId, ctx);
								if (reason) throw forbidden(reason);
							}
							const { cwd, env } = worker().location.value;
							if (env != null) throw forbidden("ACP is only available in local workspaces");
							return expectVariant(await ctx.get(Acp, {}), "worker").prompt({
								cwd, prompt, agent, ...(model === undefined ? {} : { model }), ...(mode === undefined ? {} : { mode }),
							}, ctx);
						}, context);
						const label = agent === "cursor" ? "Cursor CLI" : "Antigravity CLI";
						return { output: [{ type: "text", text: `Untrusted output from ${label}:\n\n${reply}` }] };
					},
				}),
			],
		});
		self.contribute(Extensions, { acp: extension });
	});
});
