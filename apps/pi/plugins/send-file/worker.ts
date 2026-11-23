import { contribute, defineFacet } from "@p2/app/v1";
import { Files, saveDownload } from "@p2/app/v1/node";
import { Extensions, workerOf } from "@p2/app/v1/worker";
import { offeredBy } from "./contract.ts";
import { createSendFileExtension, type SaveSnapshot } from "./tool.ts";

export default defineFacet((host) => {
	contribute(host, "p2.send-file-tools", (self) => {
		const worker = workerOf(self);
		// Snapshots go into the session's files (space `downloads`, written by the agent), in a root of the worker's own.
		const save: SaveSnapshot = ({ name, size, conversation }, next, context) =>
			worker().root(
				async (ctx) =>
					saveDownload(
						await ctx.get(Files, {}),
						{ name, size, source: "agent", ref: offeredBy(conversation) },
						next,
						ctx,
					),
				context,
			);
		const extension = createSendFileExtension(save);
		self.contribute(Extensions, { [extension.name]: extension });
	});
});
