// Worker-owned admission and receipt recovery for immutable external deliveries.
import { arr, bool, int, nul, num, obj, opt, recursive, str, union } from "@earendil-works/pi-schema";
import { evolve, literal, local, method, param, record, remote, serverHost, sessionHost } from "@p2/app/v1";

// Keep the legacy wire shape structural here: copied plugin contracts cannot import a third plugin.
const EventIdSchema = str({ minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$" });
export const LegacyReceiptSchema = obj({
	state: literal("admitted"),
	eventId: EventIdSchema,
	contentHash: str(),
	submissionId: int(),
});

const LegacyArgs = obj({ sender: str(), name: str(), eventId: EventIdSchema, text: str(), contentHash: str() });
const LegacyKey = obj({ sender: str(), eventId: EventIdSchema });
const Conflict = obj({ state: literal("conflict") });
export const DeliverySchema = obj({
	id: str(),
	session: str(),
	conversation: int(),
	notBefore: int(),
	text: str(),
	intentHash: str(),
});
export const DeliveryReceiptSchema = obj({
	state: literal("admitted"),
	deliveryId: str(),
	intentHash: str(),
	conversation: int(),
	submissionId: int(),
});
const DeliveryResult = union([DeliveryReceiptSchema, Conflict]);
const DeliveryStatus = union([
	obj({ state: literal("missing") }),
	obj({ state: literal("conflict") }),
	obj({ state: literal("queued"), receipt: DeliveryReceiptSchema }),
	obj({ state: literal("placed"), receipt: DeliveryReceiptSchema }),
	obj({ state: literal("done"), receipt: DeliveryReceiptSchema }),
	obj({ state: literal("unanswered"), receipt: DeliveryReceiptSchema }),
]);
const DeliveryKey = obj({ id: str(), intentHash: str() });

export const WakePhaseSchema = union([
	obj({ kind: literal("scheduled") }),
	obj({ kind: literal("pending") }),
	obj({ kind: literal("uncertain"), policy: union([literal("retry"), literal("readback-only")]) }),
	obj({ kind: literal("admitted"), receipt: DeliveryReceiptSchema }),
	obj({
		kind: literal("settled"),
		receipt: DeliveryReceiptSchema,
		outcome: union([literal("done"), literal("unanswered")]),
	}),
	obj({ kind: literal("closed"), reason: union([literal("cancelled"), literal("blocked")]) }),
]);
export const WakeSchema = obj({ delivery: DeliverySchema, phase: WakePhaseSchema, lastError: opt(str()) });
const Register = obj({
	session: str(),
	conversation: int(),
	requestId: str(),
	at: str(),
	text: str({ minLength: 1, maxLength: 32768 }),
});

/** Host-lifetime persisted wake ownership; callers authenticate at the remote facade. */
const WakeStoreV1 = local("p2.wake-store", {
	version: 1,
	params: {},
	members: {
		register: method(Register, WakeSchema),
		list: method(obj({ session: str() }), arr(WakeSchema)),
		cancel: method(obj({ session: str(), id: str() }), WakeSchema),
	},
});

/** The owner may inspect explicit targets; current workers can only manage their own session. */
export const Wakes = remote("p2.wakes", {
	version: 1,
	params: {},
	hostAddress: serverHost,
	variants: {
		owner: {
			methods: {
				registerTarget: method(Register, WakeSchema),
				listTarget: method(obj({ session: str() }), arr(WakeSchema)),
				cancelTarget: method(obj({ session: str(), id: str() }), WakeSchema),
			},
		},
		worker: {
			methods: {
				register: method(
					obj({ conversation: int(), requestId: str(), at: str(), text: str({ minLength: 1, maxLength: 32768 }) }),
					WakeSchema,
				),
				list: method(obj({}), arr(WakeSchema)),
				cancel: method(obj({ id: str() }), WakeSchema),
			},
		},
	},
});

/** One local owner for both new receipts and the unchanged legacy ingress ledger. */
const AdmissionV1 = local("p2.stimulus-admission", {
	version: 1,
	params: {},
	members: {
		legacyAdmit: method(LegacyArgs, union([LegacyReceiptSchema, Conflict])),
		legacyReceipt: method(LegacyKey, union([LegacyReceiptSchema, nul()])),
		admit: method(DeliverySchema, DeliveryResult),
		status: method(DeliveryKey, DeliveryStatus),
	},
});

/** Only the server may deliver a saved wake or recover its native submission. */
const StimulusWorkerV1 = remote("p2.stimulus-worker", {
	version: 1,
	params: { session: param.str() },
	hostAddress: sessionHost,
	variants: {
		server: {
			methods: {
				admit: method(DeliverySchema, DeliveryResult),
				status: method(DeliveryKey, DeliveryStatus),
			},
		},
	},
});

/** JSON values cross the source adapter boundary without a JSON-text wrapper. */
export type StimulusJson = null | boolean | number | string | StimulusJson[] | { [key: string]: StimulusJson };
export const StimulusJsonSchema = recursive<StimulusJson>("p2-stimulus-json", (self) => ({
	anyOf: [nul(), bool(), num(), str(), arr(self), record(self)],
}));
export const SourceRefSchema = obj({ id: str({ minLength: 1 }), version: int({ minimum: 1 }) });
export const TargetSchema = obj({ session: str(), conversation: int() });
export const SubscriptionSchema = obj({
	id: str({ minLength: 1 }),
	source: SourceRefSchema,
	target: TargetSchema,
	revision: int({ minimum: 1 }),
	enabled: bool(),
	config: StimulusJsonSchema,
	configHash: str(),
});
/** Immutable evidence carried by a native external input, not an owner principal. */
export const SourceProvenanceSchema = obj({
	deliveryId: str(),
	sourceVersion: int(),
	subscriptionId: str(),
	revision: int(),
	eventId: str(),
});
export const SourceDeliverySchema = obj({
	delivery: DeliverySchema,
	source: obj({ id: str(), version: int(), label: str() }),
	subscriptionId: str(),
	revision: int(),
	eventId: str(),
	eventHash: str(),
	configHash: str(),
});
export const SourceEventSchema = obj({ envelope: SourceDeliverySchema, phase: WakePhaseSchema, lastError: opt(str()) });
export const EventReadbackSchema = union([
	obj({ state: literal("missing") }),
	obj({ state: literal("recorded"), event: SourceEventSchema }),
	obj({ state: literal("unknown"), event: SourceEventSchema }),
	obj({ state: literal("admitted"), event: SourceEventSchema }),
]);
const CreateSubscription = obj({
	id: str({ minLength: 1 }),
	source: SourceRefSchema,
	target: TargetSchema,
	config: StimulusJsonSchema,
});
const ReviseSubscription = obj({
	id: str(),
	expectedRevision: int(),
	target: TargetSchema,
	config: StimulusJsonSchema,
});
const EnableSubscription = obj({ id: str(), expectedRevision: int(), enabled: bool() });
const Binding = {
	source: SourceRefSchema,
	subscriptionId: str(),
	revision: int(),
	eventId: str({ minLength: 1, maxLength: 256 }),
};

/** Additive methods preserve released one-shot callers and their contract identity. */
export const WakeStore = evolve(WakeStoreV1, (e) =>
	e
		.addMethod("createSubscription", CreateSubscription, SubscriptionSchema)
		.addMethod("reviseSubscription", ReviseSubscription, SubscriptionSchema)
		.addMethod("enableSubscription", EnableSubscription, SubscriptionSchema)
		.addMethod("subscriptions", obj({ session: opt(str()) }), arr(SubscriptionSchema))
		.addMethod("publish", obj({ ...Binding, event: StimulusJsonSchema }), EventReadbackSchema)
		.addMethod("receipt", obj(Binding), EventReadbackSchema),
);

/** Only authorized registrations are remote; source publication is a trusted server capability. */
export const Subscriptions = remote("p2.stimulus-subscriptions", {
	version: 1,
	params: {},
	hostAddress: serverHost,
	variants: {
		owner: {
			methods: {
				createTarget: method(CreateSubscription, SubscriptionSchema),
				reviseTarget: method(ReviseSubscription, SubscriptionSchema),
				setEnabled: method(EnableSubscription, SubscriptionSchema),
				list: method(obj({}), arr(SubscriptionSchema)),
			},
		},
		worker: {
			methods: {
				create: method(
					obj({
						id: str({ minLength: 1 }),
						source: SourceRefSchema,
						conversation: int(),
						config: StimulusJsonSchema,
					}),
					SubscriptionSchema,
				),
				revise: method(
					obj({ id: str(), expectedRevision: int(), conversation: int(), config: StimulusJsonSchema }),
					SubscriptionSchema,
				),
				setEnabled: method(EnableSubscription, SubscriptionSchema),
				list: method(obj({}), arr(SubscriptionSchema)),
			},
		},
	},
});

/** Native source admission shares the existing receipt transaction and status authority. */
export const Admission = evolve(AdmissionV1, (e) =>
	e
		.addMethod("admitSource", SourceDeliverySchema, DeliveryResult)
		.addMethod("validateTarget", obj({ conversation: int() }), nul()),
);
export const StimulusWorker = evolve(StimulusWorkerV1, (e) =>
	e
		.addMethod("server", "admitSource", SourceDeliverySchema, DeliveryResult)
		.addMethod("server", "validateTarget", obj({ conversation: int() }), nul()),
);
