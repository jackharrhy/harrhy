import { compile, obj } from "@earendil-works/pi-schema";
import { defineState, record } from "@p2/app/v1";
import { AddressedIntent, SourceEventSchema, SubscriptionSchema, WakeSchema } from "./contract.ts";

const v1 = { wakes: record(WakeSchema) };
const v2 = { ...v1, events: record(SourceEventSchema), subscriptions: record(SubscriptionSchema) };
export const Saved = defineState("p2.stimuli", {
	version: 3,
	schema: obj({ ...v2, addressed: record(AddressedIntent) }),
	initial: () => ({ wakes: {}, events: {}, subscriptions: {}, addressed: {} }),
	migrate: (old, from) => {
		if (from === 2 && compile(obj(v2)).check(old)) return { ...old, addressed: {} };
		if (from === 1 && compile(obj(v1)).check(old)) return { ...old, events: {}, subscriptions: {}, addressed: {} };
		throw new Error(`Invalid persisted p2.stimuli version ${from}`);
	},
	persist: true,
	checkpointWhen: (_value, _ops, info) => info.deltasSinceBase >= 100,
});
