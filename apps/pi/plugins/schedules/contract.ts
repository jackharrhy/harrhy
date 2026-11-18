// Named recurring prompts: owner-explicit targets and worker-self-scoped management.
import { arr, bool, int, obj, opt, str, union } from "@earendil-works/pi-schema";
import { literal, local, method, remote, serverHost } from "@p2/app/v1";
import { EventReadbackSchema, SubscriptionSchema, TargetSchema } from "../stimuli/contract.ts";

export const DefinitionSchema = obj({
	id: str({ minLength: 1, maxLength: 128 }),
	title: str({ minLength: 1, maxLength: 200 }),
	cron: str({ minLength: 1, maxLength: 256 }),
	timezone: str({ minLength: 1, maxLength: 128 }),
	text: str({ minLength: 1, maxLength: 30000 }),
});
export const OccurrenceSchema = obj({
	eventId: str(),
	at: int(),
	kind: union([literal("scheduled"), literal("manual")]),
});
export const ScheduleSchema = obj({
	definition: DefinitionSchema,
	target: TargetSchema,
	revision: int({ minimum: 1 }),
	subscription: SubscriptionSchema,
	phase: union([obj({ kind: literal("active"), nextAt: int() }), obj({ kind: literal("paused") })]),
	pending: opt(OccurrenceSchema),
	last: opt(obj({ occurrence: OccurrenceSchema, subscription: SubscriptionSchema })),
	lastError: opt(str()),
});
const Scope = { session: opt(str()) };
const EnableFields = { id: str(), expectedRevision: int(), enabled: bool() };
const RunFields = { id: str(), expectedRevision: int(), requestId: str({ minLength: 1, maxLength: 128 }) };
const SetEnabled = obj(EnableFields);
const Run = obj(RunFields);
const Receipt = obj({ id: str() });

export const ScheduleStore = local("p2.schedule-store", {
	version: 1,
	params: {},
	members: {
		create: method(obj({ definition: DefinitionSchema, target: TargetSchema }), ScheduleSchema),
		update: method(
			obj({ definition: DefinitionSchema, target: TargetSchema, expectedRevision: int(), scope: opt(str()) }),
			ScheduleSchema,
		),
		setEnabled: method(obj({ ...EnableFields, scope: opt(str()) }), ScheduleSchema),
		list: method(obj(Scope), arr(ScheduleSchema)),
		run: method(obj({ ...RunFields, scope: opt(str()) }), EventReadbackSchema),
		receipt: method(obj({ id: str(), scope: opt(str()) }), EventReadbackSchema),
	},
});

export const Schedules = remote("p2.schedules", {
	version: 1,
	params: {},
	hostAddress: serverHost,
	variants: {
		owner: {
			methods: {
				createTarget: method(obj({ definition: DefinitionSchema, target: TargetSchema }), ScheduleSchema),
				updateTarget: method(
					obj({ definition: DefinitionSchema, target: TargetSchema, expectedRevision: int() }),
					ScheduleSchema,
				),
				setEnabled: method(SetEnabled, ScheduleSchema),
				list: method(obj({}), arr(ScheduleSchema)),
				run: method(Run, EventReadbackSchema),
				receipt: method(Receipt, EventReadbackSchema),
			},
		},
		worker: {
			methods: {
				create: method(obj({ definition: DefinitionSchema, conversation: int() }), ScheduleSchema),
				update: method(
					obj({ definition: DefinitionSchema, conversation: int(), expectedRevision: int() }),
					ScheduleSchema,
				),
				setEnabled: method(SetEnabled, ScheduleSchema),
				list: method(obj({}), arr(ScheduleSchema)),
				run: method(Run, EventReadbackSchema),
				receipt: method(Receipt, EventReadbackSchema),
			},
		},
	},
});
