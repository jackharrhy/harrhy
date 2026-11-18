// The agent's non-sensitive activity: session-owned content, with a durable owner-only server projection.
import { int, obj, str } from "@earendil-works/pi-schema";
import { method, record, remote, serverHost } from "@p2/app/v1";

export const MAX_ACTIVITY = 160;
export const ActivitySchema = obj({ revision: int({ minimum: 0 }), text: str({ maxLength: MAX_ACTIVITY }) });

/** Owners read activity without starting workers; workers report only their own content. Empty text clears it. */
export const SessionActivity = remote("p2.session-activity", {
	version: 1,
	params: {},
	hostAddress: serverHost,
	variants: {
		owner: { state: { activities: record(str({ maxLength: MAX_ACTIVITY })) } },
		reporter: { methods: { report: method(ActivitySchema) } },
	},
});
