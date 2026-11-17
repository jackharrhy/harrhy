// The server's persisted activity projection. It outlives workers; only owners can read it.
import { int, obj, str } from "@earendil-works/pi-schema";
import {
	defineState,
	deriveTyped,
	type FacetHost,
	forbidden,
	isOwner,
	isWorker,
	local,
	method,
	record,
} from "@p2/app/v1";
import { Hosts } from "@p2/app/v1/server";
import { ActivitySchema, SessionActivity } from "./activity-contract.ts";

const Activities = defineState("p2.session-activity-projection", {
	version: 1,
	schema: obj({ reports: record(ActivitySchema) }),
	initial: () => ({ reports: {} }),
	persist: true,
	checkpointWhen: () => true,
});
const ActivityStore = local("p2.session-activity-store", {
	version: 1,
	params: {},
	members: {
		activities: record(str()),
		report: method(obj({ session: str(), generation: int(), revision: int({ minimum: 0 }), text: str() })),
	},
});

/** Serves the owner view and generation-fenced worker reports without changing the shared session catalog. */
export function serveActivity(host: FacetHost): void {
	host.serve(ActivityStore, (_params, self) => {
		const state = self.state(Activities);
		const hosts = self.get(Hosts, {});
		return {
			activities: deriveTyped(self, [state], ([value]) =>
				Object.fromEntries(
					Object.entries(value.reports).flatMap(([id, report]) => (report.text ? [[id, report.text]] : [])),
				),
			),
			report: async ({ session, generation, ...report }, ctx) => {
				await state.change((draft) => {
					// Check at the write, not before awaiting it: a replacement worker fences late reports.
					const worker = hosts.workers.value[session];
					if (!worker?.running || worker.generation !== generation) throw forbidden("stale worker");
					const previous = draft.reports[session];
					if (previous && previous.revision >= report.revision) return;
					draft.reports[session] = report;
				}, ctx);
				return null;
			},
		};
	});
	host.serve(SessionActivity, (_params, principal, self) => {
		if (!isOwner(principal) && !isWorker(principal)) throw forbidden("activity is owner-only");
		const store = self.get(ActivityStore, {});
		if (isOwner(principal)) return { variant: "owner", members: { activities: store.activities } };
		return {
			variant: "reporter",
			members: {
				report: (report, ctx) =>
					store.report({ ...report, session: principal.session, generation: principal.generation }, ctx),
			},
		};
	});
}
