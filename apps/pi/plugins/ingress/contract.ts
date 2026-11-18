// Send-only external peer admission; only the p2 server may call the worker.
import { int, nul, obj, str, union } from "@earendil-works/pi-schema";
import { literal, method, param, remote, sessionHost } from "@p2/app/v1";

export const EventIdSchema = str({ minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$" });
export const EventSchema = obj({ eventId: EventIdSchema, text: str({ minLength: 1, maxLength: 32768 }) });
export const ReceiptSchema = obj({
	state: literal("admitted"),
	eventId: EventIdSchema,
	contentHash: str(),
	submissionId: int(),
});

/** Internal worker boundary, not an owner or service-principal API. */
export const ExternalIngress = remote("p2.external-ingress", {
	version: 1,
	params: { session: param.str() },
	hostAddress: sessionHost,
	variants: {
		server: {
			methods: {
				admit: method(
					obj({ sender: str(), name: str(), eventId: EventIdSchema, text: str(), contentHash: str() }),
					union([ReceiptSchema, obj({ state: literal("conflict") })]),
				),
				receipt: method(obj({ sender: str(), eventId: EventIdSchema }), union([ReceiptSchema, nul()])),
			},
		},
	},
});
