import { int, num, obj, opt, str, type Static, union } from "@earendil-works/pi-schema";
import { literal } from "@p2/app/v1";

export const Source = { id: "p2.host-health", version: 1 };
export const Metric = union([literal("disk-root"), literal("cpu"), literal("memory")]);
export type Metric = Static<typeof Metric>;
const value = num({ minimum: 0 });
const Condition = union([
	obj({ op: literal("above"), value }),
	obj({ op: literal("below"), value }),
	obj({ op: literal("between"), min: value, max: value }),
]);
export type Condition = Static<typeof Condition>;
export const Rule = obj({
	trigger: Condition,
	rearm: Condition,
	samples: opt(int({ minimum: 1, maximum: 60 })),
	rearmSamples: opt(int({ minimum: 1, maximum: 60 })),
});
export const Watch = obj({ check: Metric, rule: opt(Rule) });
export type Watch = Static<typeof Watch>;
export const WatchId = str({ minLength: 1, maxLength: 128 });
