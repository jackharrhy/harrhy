// Peers: other Pi instances this one is linked to over SSH. The owner's view (Settings › Peers) and the agent's tools
// are remote contracts; what two instances say to each other is protocol.ts.
import {
	arr,
	bool,
	int,
	nul,
	obj,
	opt,
	str,
	union,
} from "@earendil-works/pi-schema";
import { literal, method, remote, serverHost } from "@p2/app/v1";

/** `user@host`: an SSH login and a host name or address, nothing that could be an option or a command. */
export const SSH_TARGET =
	/^[A-Za-z0-9_][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9.-]*$/;

/** What a peer may reach here: nothing, the Familiar only, or every private session. */
export const PolicySchema = union([
	literal("none"),
	literal("familiar"),
	literal("all-private"),
]);

/** A Pi instance found on a machine over SSH. */
export const CandidateSchema = obj({
	instanceId: str(),
	name: str(),
	port: int({ minimum: 1, maximum: 65535 }),
});

export const PeerSchema = obj({
	id: str(),
	name: str(),
	/** The login this instance uses to reach the peer; null when the peer reached this one. */
	ssh: union([str(), nul()]),
	/** `requested`: waiting for the other owner's approval. */
	state: union([literal("requested"), literal("connected")]),
	/** Whether messages can cross the link now. */
	link: union([literal("up"), literal("connecting"), literal("down")]),
	policy: PolicySchema,
	error: opt(str()),
});

export const IncomingSchema = obj({
	id: str(),
	name: str(),
	/** When it arrived (ms since the epoch). */
	at: int(),
});

/** The owner's settings for peers. */
export const Peers = remote("p2.peers", {
	version: 1,
	params: {},
	hostAddress: serverHost,
	variants: {
		owner: {
			state: {
				/** This instance as peers see it. */
				self: obj({ id: str(), name: str() }),
				peers: arr(PeerSchema),
				/** Requests from other instances waiting for the owner. */
				incoming: arr(IncomingSchema),
			},
			methods: {
				/** Looks for Pi instances on `target` (`user@host`) over SSH. */
				find: method(
					obj({ target: str({ maxLength: 300 }) }),
					arr(CandidateSchema),
				),
				/** Asks the instance `candidate` on `target` to link with this one; its owner must approve. */
				request: method(
					obj({ target: str({ maxLength: 300 }), candidate: CandidateSchema }),
				),
				approve: method(obj({ id: str() })),
				deny: method(obj({ id: str() })),
				/** Ends the link, here and on the peer when it can be reached. */
				remove: method(obj({ id: str() })),
				setPolicy: method(obj({ id: str(), policy: PolicySchema })),
			},
		},
	},
});

const Receipt = obj({ state: str(), eventId: str() });

/** The agent's way to talk to peers, through the server, which holds the credentials and the links. */
export const PeersWorker = remote("p2.peers-worker", {
	version: 1,
	params: {},
	hostAddress: serverHost,
	variants: {
		worker: {
			methods: {
				list: method(obj({}), arr(obj({ id: str(), name: str(), up: bool() }))),
				targets: method(
					obj({ peer: str() }),
					arr(obj({ id: str(), title: str() })),
				),
				send: method(
					obj({
						peer: str(),
						text: str({ minLength: 1, maxLength: 32768 }),
						session: opt(str()),
						eventId: opt(str()),
					}),
					Receipt,
				),
				receipt: method(obj({ peer: str(), eventId: str() }), Receipt),
			},
		},
	},
});
