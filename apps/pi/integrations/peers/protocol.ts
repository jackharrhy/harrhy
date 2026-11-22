// What two Pi instances say to each other, as JSON over HTTP on loopback ports that SSH forwards between them.
// `hello` and the first `requests` call are the only unauthenticated ones; the rest carry the credential each side
// gave the other when the owners approved the link.
import { arr, compile, int, obj, opt, str } from "@earendil-works/pi-schema";

export const PROTOCOL = 1;
export const PREFIX = "/peer/v1";

const Id = str({ minLength: 8, maxLength: 64, pattern: "^[A-Za-z0-9-]+$" });
/** A 256-bit secret as 64 hex digits. */
const Secret = str({ pattern: "^[a-f0-9]{64}$" });
const Port = int({ minimum: 1, maximum: 65535 });

/** `GET /hello`: who is on the other end, and what it can do beyond messages. */
export const Hello = obj({
	protocol: int(),
	instanceId: Id,
	name: str({ maxLength: 100 }),
	capabilities: arr(str({ maxLength: 40 }), { maxItems: 20 }),
});

/**
 * `POST /requests`: a link request. `token` is what the receiver sends back with when it calls the requester;
 * `port` is the requester's own Pi port, for the `Host` header of those calls.
 */
export const LinkRequest = obj({
	instanceId: Id,
	name: str({ minLength: 1, maxLength: 100 }),
	port: Port,
	token: Secret,
});
export const linkRequest = compile(LinkRequest);

/** `POST /link` (authenticated): where the caller's own Pi can be reached from the receiver, through the reverse forward. */
export const LinkUp = obj({ reversePort: Port, port: Port });
export const linkUp = compile(LinkUp);

/** `POST /events` (authenticated): a message for a session on the receiver. */
export const PeerEvent = obj({
	eventId: opt(
		str({ minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$" }),
	),
	session: opt(
		str({
			pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
		}),
	),
	text: str({ minLength: 1, maxLength: 32768 }),
});
export const peerEvent = compile(PeerEvent);

export const EVENT_ID = compile(
	str({ minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$" }),
);
export const REQUEST_ID = compile(str({ pattern: "^[a-f0-9]{64}$" }));

/** The most one body may be, in bytes. */
export const MAX_BODY = 64 * 1024;
