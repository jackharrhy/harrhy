// Preserve the external ingress wire contract while the local admission service owns its ledger.
import { defineFacet, forbidden } from "@p2/app/v1";
import { Admission } from "@p2/app/v1/worker";
import { ExternalIngress } from "./contract.ts";

export default defineFacet((host) => {
	host.serve(ExternalIngress, (_params, principal, self) => {
		if (principal.kind !== "server") throw forbidden("server ingress only");
		const admission = self.get(Admission, {});
		return {
			variant: "server",
			members: {
				admit: (args, ctx) => admission.legacyAdmit(args, ctx),
				receipt: (args, ctx) => admission.legacyReceipt(args, ctx),
			},
		};
	});
});
