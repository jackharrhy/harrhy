// Owner commands and the worker's server-side eligibility check.
import { bool, int, nul, obj, type Static, str, union } from "@earendil-works/pi-schema";
import { literal, method, param, remote, serverHost, sessionHost } from "@p2/app/v1";

export const GoalStatus = obj({
	objective: str(),
	conversation: int(),
	steps: int(),
	limit: int(),
	phase: union([
		literal("active"),
		literal("paused"),
		literal("reported-complete"),
		literal("blocked"),
		literal("exhausted"),
	]),
	evidence: str(),
	pending: bool(),
	submission: union([int(), nul()]),
	answer: union([int(), nul()]),
});
export type GoalView = Static<typeof GoalStatus>;
const Result = union([GoalStatus, nul()]);
const At = { conversation: int() };
export const GoalMethods = {
	status: method(obj(At), Result),
	start: method(
		obj({ ...At, objective: str({ minLength: 1, maxLength: 4000 }), limit: int({ minimum: 1, maximum: 12 }) }),
		Result,
	),
	pause: method(obj(At), Result),
	resume: method(obj(At), Result),
};
export const Goal = remote("p2.goal", {
	version: 1,
	params: { session: param.str() },
	hostAddress: sessionHost,
	variants: { owner: { methods: GoalMethods } },
});
export const GoalEligibility = remote("p2.goal-eligibility", {
	version: 1,
	params: {},
	hostAddress: serverHost,
	variants: {
		worker: {
			methods: {
				check: method(obj({}), bool()),
				reserve: method(obj({ token: str({ minLength: 1, maxLength: 64 }) }), bool()),
				releaseReservation: method(obj({ token: str({ minLength: 1, maxLength: 64 }) })),
			},
		},
	},
});
