// Peers' rules: who is linked, how a link request is made and answered, and what crosses a link. The server wires this to
// the owner's settings, the agent's tools and the HTTP routes.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
	int,
	nul,
	obj,
	type Static,
	str,
	union,
} from "@earendil-works/pi-schema";
import { type Context, literal, record } from "@p2/app/v1";
import type { AddressedPolicy } from "@p2/app/v1/server";
import { call, type Endpoint } from "./client.ts";
import { PolicySchema } from "./contract.ts";
import { PROTOCOL, REQUEST_ID } from "./protocol.ts";
import type { PeerSecrets } from "./secrets.ts";
import { openTunnel, type Tunnel } from "./tunnel.ts";

export const PeerRecord = obj({
	id: str(),
	name: str(),
	ssh: union([str(), nul()]),
	state: union([literal("requested"), literal("connected"), literal("denied")]),
	/** The hash of what the peer sends when it calls this instance. */
	incomingHash: union([str(), nul()]),
	/** The peer's own Pi port (the `Host` of calls made to it, or reached through the reverse forward). */
	remotePort: int(),
	policy: PolicySchema,
	policyRevision: int(),
	/** The request this instance made and is waiting on. */
	requestId: union([str(), nul()]),
	/** The request this instance approved whose token the requester has not yet confirmed it holds. */
	waiting: union([str(), nul()]),
});
export type PeerRecordValue = Static<typeof PeerRecord>;

export const IncomingRecord = obj({
	id: str(),
	peerId: str(),
	name: str(),
	port: int(),
	at: int(),
});

export const PeerStateSchema = obj({
	id: str(),
	peers: record(PeerRecord),
	incoming: record(IncomingRecord),
});

export const LiveSchema = obj({
	links: record(
		obj({
			link: union([literal("up"), literal("connecting"), literal("down")]),
			error: union([str(), nul()]),
		}),
	),
});

type Doc<T> = {
	readonly value: T;
	change(fn: (draft: T) => void, ctx: Context): Promise<void>;
};
type PeerState = Static<typeof PeerStateSchema>;
type Live = Static<typeof LiveSchema>;

export type ManagerDeps = {
	state: Doc<PeerState>;
	live: Doc<Live>;
	/** Opened when the server is live. */
	secrets: () => PeerSecrets;
	ssh: () => string;
	/** This instance's own Pi port, known when the server is live. */
	port: () => number;
	name: () => string;
	/** A context for work no request caused (a tunnel coming up, a poll). */
	background: () => Context;
};

const hash = (token: string) =>
	createHash("sha256").update(token).digest("hex");
const token = () => randomBytes(32).toString("hex");
const MAX_PENDING = 8;
const POLL_MS = 3_000;
const sleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms).unref());

/** A name safe to show as the sender of a message. */
export const senderName = (name: string) => {
	const clean = name
		.replace(/[^A-Za-z0-9 ._-]/g, "")
		.replace(/^[^A-Za-z0-9]+/, "")
		.trim()
		.slice(0, 40);
	return clean || "Peer";
};

export function createManager(deps: ManagerDeps) {
	const { state, live } = deps;
	const secrets = {
		outgoing: (peer: string) => deps.secrets().outgoing(peer),
		setOutgoing: (peer: string, token: string) =>
			deps.secrets().setOutgoing(peer, token),
		pending: (key: string) => deps.secrets().pending(key),
		setPending: (key: string, token: string) =>
			deps.secrets().setPending(key, token),
		dropPending: (key: string) => deps.secrets().dropPending(key),
		forget: (peer: string, keys: readonly string[]) =>
			deps.secrets().forget(peer, keys),
	};
	const tunnels = new Map<string, Tunnel>();
	const reversePorts = new Map<string, number>();
	/** Where a peer that reached this instance can be reached back: its reverse forward. */
	const reach = new Map<string, Endpoint>();
	const polling = new Set<string>();
	const denied = new Set<string>();
	const recent: number[] = [];

	const peer = (id: string) => state.value.peers[id];
	const me = () => ({ id: state.value.id, name: deps.name() });
	const endpointOf = (record: PeerRecordValue): Endpoint | undefined =>
		record.ssh === null
			? reach.get(record.id)
			: tunnels.get(record.id)?.endpoint();
	const setLive = (
		id: string,
		link: "up" | "connecting" | "down",
		error: string | null,
	) =>
		live.change((draft) => {
			draft.links[id] = { link, error };
		}, deps.background());

	function ensureTunnel(record: PeerRecordValue) {
		if (
			record.ssh === null ||
			record.state === "denied" ||
			tunnels.has(record.id)
		)
			return;
		const id = record.id;
		tunnels.set(
			id,
			openTunnel({
				ssh: deps.ssh(),
				target: record.ssh,
				remotePort: record.remotePort,
				port: deps.port(),
				seed: [state.value.id, id].sort().join(":"),
				up: (endpoint, reversePort) => linkUp(id, endpoint, reversePort),
				changed: () => {
					const tunnel = tunnels.get(id);
					if (tunnel) void setLive(id, tunnel.state(), tunnel.error() ?? null);
				},
			}),
		);
	}

	/** The forwards are up: check who answers, then ask (a new link) or announce the reverse port (an approved one). */
	async function linkUp(
		id: string,
		endpoint: Endpoint,
		reversePort: number,
	): Promise<string | undefined> {
		const record = peer(id);
		if (!record) return "The peer was removed";
		const hello = await call(endpoint, "GET", "/hello");
		const body = hello.body as
			| { protocol?: number; instanceId?: string; name?: string }
			| undefined;
		if (hello.status !== 200 || body?.instanceId === undefined)
			return "That machine's Pi does not speak the peer protocol";
		if (body.instanceId !== id) return "A different Pi answers there now";
		if (body.protocol !== PROTOCOL)
			return `The peer speaks protocol ${String(body.protocol)}, this Pi ${PROTOCOL}`;
		reversePorts.set(id, reversePort);
		if (record.state === "requested") return request(record, endpoint);
		if (record.state === "connected") return announce(id, endpoint);
		return undefined;
	}

	async function request(
		record: PeerRecordValue,
		endpoint: Endpoint,
	): Promise<string | undefined> {
		if (record.requestId === null) {
			const mine = await secrets.pending(`to:${record.id}`);
			if (mine === undefined)
				return "The link request lost its credential: remove the peer and ask again";
			const response = await call(endpoint, "POST", "/requests", {
				body: {
					instanceId: state.value.id,
					name: deps.name(),
					port: deps.port(),
					token: mine,
				},
			});
			if (response.status === 409)
				return `${record.name} already has a link with this Pi: remove it there first`;
			if (response.status === 429)
				return `${record.name} has too many requests waiting`;
			const requestId = (response.body as { requestId?: string } | undefined)
				?.requestId;
			if (response.status !== 201 || !REQUEST_ID.check(requestId))
				return `${record.name} answered ${response.status}`;
			await state.change((draft) => {
				const entry = draft.peers[record.id];
				if (entry) entry.requestId = requestId;
			}, deps.background());
		}
		void poll(record.id);
		return undefined;
	}

	/** Asks, while the link request waits, whether the other owner has answered. */
	async function poll(id: string): Promise<void> {
		if (polling.has(id)) return;
		polling.add(id);
		try {
			for (;;) {
				const record = peer(id);
				const endpoint = tunnels.get(id)?.endpoint();
				if (
					!record ||
					record.state !== "requested" ||
					record.requestId === null
				)
					return;
				if (endpoint) {
					const response = await call(
						endpoint,
						"GET",
						`/requests/${record.requestId}`,
					).catch(() => undefined);
					const body = response?.body as
						| { state?: string; token?: string }
						| undefined;
					if (
						response?.status === 200 &&
						body?.state === "approved" &&
						typeof body.token === "string"
					) {
						await secrets.setOutgoing(id, body.token);
						await secrets.dropPending(`to:${id}`);
						await state.change((draft) => {
							const entry = draft.peers[id];
							if (entry) {
								entry.state = "connected";
								entry.requestId = null;
							}
						}, deps.background());
						await announce(id, endpoint);
						return;
					}
					if (
						(response?.status === 200 && body?.state === "denied") ||
						response?.status === 404
					) {
						await state.change((draft) => {
							const entry = draft.peers[id];
							if (entry) entry.state = "denied";
						}, deps.background());
						await secrets.forget(id, [`to:${id}`]);
						tunnels.get(id)?.stop();
						tunnels.delete(id);
						return;
					}
				}
				await sleep(POLL_MS);
			}
		} finally {
			polling.delete(id);
		}
	}

	/** Tells the peer where this instance's Pi can be reached through the reverse forward. */
	async function announce(
		id: string,
		endpoint: Endpoint,
	): Promise<string | undefined> {
		const reversePort = reversePorts.get(id);
		const credential = await secrets.outgoing(id);
		if (reversePort === undefined || credential === undefined)
			return "The link has no credential yet";
		const response = await call(endpoint, "POST", "/link", {
			auth: { instanceId: state.value.id, token: credential },
			body: { reversePort, port: deps.port() },
		});
		if (response.status === 401 || response.status === 403)
			return "The peer no longer accepts this link";
		return response.status === 200
			? undefined
			: `The peer answered ${response.status}`;
	}

	/** What the peer may reach here, in the addressed-delivery policy's terms. */
	const policyOf = (
		record: PeerRecordValue | undefined,
	): AddressedPolicy | undefined => {
		if (!record || record.state !== "connected" || record.policy === "none")
			return undefined;
		return {
			label: senderName(record.name),
			revision: String(record.policyRevision),
			discover: record.policy === "all-private" ? "all-private" : [],
			send: {
				sessions: record.policy === "all-private" ? "all-private" : [],
				familiar: true,
			},
			receipts: true,
		};
	};

	/** The peer a request's credentials belong to, or nothing. */
	function authenticate(headers: {
		authorization?: string;
		"x-pi-peer"?: string | string[];
	}): PeerRecordValue | undefined {
		const id =
			typeof headers["x-pi-peer"] === "string"
				? headers["x-pi-peer"]
				: undefined;
		const match = headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/i);
		const record = id === undefined ? undefined : peer(id);
		if (
			!record ||
			record.state !== "connected" ||
			record.incomingHash === null ||
			!match
		)
			return undefined;
		const given = createHash("sha256")
			.update(match[1] as string)
			.digest();
		return timingSafeEqual(given, Buffer.from(record.incomingHash, "hex"))
			? record
			: undefined;
	}

	const resolve = (reference: string): PeerRecordValue => {
		const all = Object.values(state.value.peers).filter(
			(entry) => entry.state === "connected",
		);
		const found =
			all.find((entry) => entry.id === reference) ??
			all.find((entry) => entry.name.toLowerCase() === reference.toLowerCase());
		if (!found) throw new Error(`No linked peer "${reference}"`);
		return found;
	};

	/** One authenticated call to a peer, or why it cannot be made. */
	async function toPeer(
		reference: string,
		method: "GET" | "POST",
		path: string,
		body?: unknown,
	) {
		const record = resolve(reference);
		const endpoint = endpointOf(record);
		const credential = await secrets.outgoing(record.id);
		if (!endpoint || credential === undefined)
			throw new Error(`${record.name} is not connected right now`);
		const response = await call(endpoint, method, path, {
			auth: { instanceId: state.value.id, token: credential },
			body,
		}).catch((error: unknown) => {
			if (record.ssh === null) {
				reach.delete(record.id);
				void setLive(record.id, "down", "The peer's connection is down");
			}
			throw new Error(
				`${record.name} is not reachable: ${error instanceof Error ? error.message : String(error)}`,
			);
		});
		if (response.status === 401 || response.status === 403)
			throw new Error(
				`${record.name} did not accept the request (${(response.body as { error?: string } | undefined)?.error ?? response.status})`,
			);
		return response;
	}

	/** Starts the connections of peers this instance reaches by SSH (at start, and when one is added). */
	function reconcile() {
		for (const record of Object.values(state.value.peers)) ensureTunnel(record);
		for (const [id, tunnel] of tunnels)
			if (!peer(id) || peer(id)?.state === "denied") {
				tunnel.stop();
				tunnels.delete(id);
			}
	}

	/** Forgets a peer, here only (it went away, or this instance just told it to). */
	async function dropLink(id: string, ctx: Context) {
		const record = peer(id);
		tunnels.get(id)?.stop();
		tunnels.delete(id);
		reach.delete(id);
		reversePorts.delete(id);
		await state.change((draft) => void delete draft.peers[id], ctx);
		await live.change((draft) => void delete draft.links[id], ctx);
		await secrets.forget(id, [
			`to:${id}`,
			...(record?.waiting ? [`approved:${record.waiting}`] : []),
		]);
	}

	/**
	 * Checks every link: the side that holds the SSH connection says again where its Pi is (the peer may have restarted
	 * and forgotten), the other side checks that its way back still answers.
	 */
	async function refresh() {
		for (const record of Object.values(state.value.peers)) {
			if (record.state !== "connected") continue;
			const endpoint = endpointOf(record);
			if (!endpoint) continue;
			if (record.ssh !== null) {
				const problem = await announce(record.id, endpoint).catch(
					(error: unknown) =>
						error instanceof Error ? error.message : String(error),
				);
				if (problem) void setLive(record.id, "up", problem);
				else if (live.value.links[record.id]?.error)
					void setLive(record.id, "up", null);
			} else {
				const answer = await call(endpoint, "GET", "/hello").catch(
					() => undefined,
				);
				if (answer?.status !== 200) {
					reach.delete(record.id);
					void setLive(record.id, "down", "The peer's connection is down");
				}
			}
		}
	}

	return {
		me,
		peer,
		refresh,
		reconcile,
		dropLink,
		endpointOf,
		policyOf,
		authenticate,
		linkOf: (id: string) => live.value.links[id],

		stop() {
			for (const tunnel of tunnels.values()) tunnel.stop();
			tunnels.clear();
		},

		/** A request from another instance: waits for the owner; the answer is fetched by its ID. */
		async receive(
			body: { instanceId: string; name: string; port: number; token: string },
			ctx: Context,
		): Promise<{ requestId: string } | "linked" | "busy"> {
			if (peer(body.instanceId)?.state === "connected") return "linked";
			const now = Date.now();
			while (recent.length > 0 && now - (recent[0] as number) > 60_000)
				recent.shift();
			if (recent.length >= 6) return "busy";
			recent.push(now);
			const older = Object.values(state.value.incoming).filter(
				(entry) => entry.peerId === body.instanceId,
			);
			if (
				Object.keys(state.value.incoming).length - older.length >=
				MAX_PENDING
			)
				return "busy";
			const requestId = token();
			await secrets.setPending(`from:${requestId}`, body.token);
			await state.change((draft) => {
				for (const entry of older) delete draft.incoming[entry.id];
				draft.incoming[requestId] = {
					id: requestId,
					peerId: body.instanceId,
					name: body.name,
					port: body.port,
					at: now,
				};
			}, ctx);
			for (const entry of older) await secrets.dropPending(`from:${entry.id}`);
			return { requestId };
		},

		/** What a requester asks: still waiting, approved (with the token it calls with), or denied. */
		async answer(
			requestId: string,
		): Promise<
			| { state: "pending" | "denied" }
			| { state: "approved"; token: string }
			| undefined
		> {
			if (state.value.incoming[requestId]) return { state: "pending" };
			const granted = await secrets.pending(`approved:${requestId}`);
			if (granted !== undefined) return { state: "approved", token: granted };
			return denied.has(requestId) ? { state: "denied" } : undefined;
		},

		async approve(id: string, ctx: Context) {
			const incoming = state.value.incoming[id];
			if (!incoming) throw new Error("That request is gone");
			const theirs = await secrets.pending(`from:${id}`);
			if (theirs === undefined)
				throw new Error(
					"That request lost its credential: ask the other owner to request again",
				);
			const mine = token();
			await secrets.setOutgoing(incoming.peerId, theirs);
			await secrets.setPending(`approved:${id}`, mine);
			await secrets.dropPending(`from:${id}`);
			await state.change((draft) => {
				delete draft.incoming[id];
				draft.peers[incoming.peerId] = {
					id: incoming.peerId,
					name: incoming.name,
					ssh: null,
					state: "connected",
					incomingHash: hash(mine),
					remotePort: incoming.port,
					policy: "familiar",
					policyRevision: 1,
					requestId: null,
					waiting: id,
				};
			}, ctx);
		},

		async deny(id: string, ctx: Context) {
			if (!state.value.incoming[id]) return;
			denied.add(id);
			await state.change((draft) => void delete draft.incoming[id], ctx);
			await secrets.dropPending(`from:${id}`);
		},

		/** The peer's own announcement of the reverse port, which also proves it holds the token this instance gave it. */
		async linked(
			record: PeerRecordValue,
			body: { reversePort: number; port: number },
			ctx: Context,
		) {
			reach.set(record.id, { port: body.reversePort, hostPort: body.port });
			void setLive(record.id, "up", null);
			if (record.waiting !== null) {
				await secrets.dropPending(`approved:${record.waiting}`);
				await state.change((draft) => {
					const entry = draft.peers[record.id];
					if (entry) entry.waiting = null;
				}, ctx);
			}
		},

		/** Asks `target` (`user@host`) to link: the connection starts at once, the other owner decides. */
		async ask(
			target: string,
			candidate: { instanceId: string; name: string; port: number },
			ctx: Context,
		) {
			if (candidate.instanceId === state.value.id)
				throw new Error("That is this Pi");
			const existing = peer(candidate.instanceId);
			if (existing && existing.state !== "denied")
				throw new Error(
					`${existing.name} is already ${existing.state === "connected" ? "linked" : "asked"}`,
				);
			const mine = token();
			await secrets.setPending(`to:${candidate.instanceId}`, mine);
			await state.change((draft) => {
				draft.peers[candidate.instanceId] = {
					id: candidate.instanceId,
					name: candidate.name,
					ssh: target,
					state: "requested",
					incomingHash: hash(mine),
					remotePort: candidate.port,
					policy: "familiar",
					policyRevision: 1,
					requestId: null,
					waiting: null,
				};
			}, ctx);
			reconcile();
		},

		async remove(id: string, ctx: Context) {
			const record = peer(id);
			if (!record) return;
			if (record.state === "connected")
				await toPeer(id, "POST", "/unlink").catch(() => {});
			await dropLink(id, ctx);
		},

		async setPolicy(
			id: string,
			policy: PeerRecordValue["policy"],
			ctx: Context,
		) {
			await state.change((draft) => {
				const entry = draft.peers[id];
				if (!entry) return;
				entry.policy = policy;
				entry.policyRevision++;
			}, ctx);
		},

		list: () =>
			Object.values(state.value.peers)
				.filter((entry) => entry.state === "connected")
				.map((entry) => ({
					id: entry.id,
					name: entry.name,
					up: endpointOf(entry) !== undefined,
				})),
		toPeer,
	};
}
export type Manager = ReturnType<typeof createManager>;
