// Registered preview metadata is read on demand and never probes or starts a service.
import { defineFacet, forbidden, isOwner } from "@p2/app/v1";
import { Server } from "@p2/app/v1/server";
import { ReadCache } from "./cache.ts";
import { type PreviewRead, Previews } from "./contract.ts";
import { readPreviews } from "./previews.ts";

export default defineFacet((host) => {
	const metadata = new ReadCache<PreviewRead>();
	host.serve(Previews, (_params, principal, self) => {
		if (!isOwner(principal)) throw forbidden("previews are owner-only");
		const server = self.get(Server, {});
		return {
			variant: "owner",
			members: {
				list: async ({ refresh }, ctx) => {
					try {
						return await metadata.read(
							"metadata",
							refresh ? "refresh" : "reuse",
							() => readPreviews(server.info.value.dataDir),
							ctx,
						);
					} catch (error) {
						const previous = metadata.peek("metadata");
						return {
							checked: previous?.checked ?? Date.now(),
							items: previous?.items ?? [],
							failures: [error instanceof Error ? error.message : "Preview metadata unavailable"],
						};
					}
				},
			},
		};
	});
});
