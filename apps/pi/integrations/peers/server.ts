// Peers (server): this instance's identity, its links to other instances over SSH, the owner's settings for them, what the
// agent can ask of them, and the routes they call. docs/pi-peers.md says how it fits together.
import { randomUUID } from "node:crypto";
import { arr, bool, nul, obj, str, union } from "@earendil-works/pi-schema";
import {
	BACKGROUND_CONTEXT,
	defineFacet,
	defineState,
	defineTypedState,
	deriveTyped,
	forbidden,
	invalid,
	isOwner,
	isWorker,
	local,
	method,
	type JsonValue,
	signalOf,
} from "@p2/app/v1";
import {
	AddressedPolicies,
	Routes,
	Server,
	ServerName,
} from "@p2/app/v1/server";
import { announce, announceDirectory, findOver } from "./discovery.ts";
import {
	IncomingSchema,
	PeerSchema,
	Peers,
	PeersWorker,
	PolicySchema,
	SSH_TARGET,
	CandidateSchema,
} from "./contract.ts";
import { createManager, LiveSchema, PeerStateSchema } from "./manager.ts";
import { PROTOCOL } from "./protocol.ts";
import { peerRoutes } from "./routes.ts";
import { openSecrets } from "./secrets.ts";

const State = defineState("p2.peers-state", {
	version: 1,
	schema: PeerStateSchema,
	initial: () => ({ id: randomUUID(), peers: {}, incoming: {} }),
	persist: true,
	checkpointWhen: () => true,
});
const Live = defineTypedState("p2.peers-live", {
	version: 1,
	schema: LiveSchema,
	initial: () => ({ links: {} }),
});

const Receipt = obj({ state: str(), eventId: str() });
const Store = local("p2.peers-store", {
	version: 1,
	params: {},
	members: {
		self: obj({ id: str(), name: str() }),
		peers: arr(PeerSchema),
		incoming: arr(IncomingSchema),
		find: method(obj({ target: str() }), arr(CandidateSchema)),
		ask: method(obj({ target: str(), candidate: CandidateSchema })),
		approve: method(obj({ id: str() })),
		deny: method(obj({ id: str() })),
		remove: method(obj({ id: str() })),
		setPolicy: method(obj({ id: str(), policy: PolicySchema })),
		list: method(obj({}), arr(obj({ id: str(), name: str(), up: bool() }))),
		targets: method(
			obj({ peer: str() }),
			arr(obj({ id: str(), title: str() })),
		),
		send: method(
			obj({
				peer: str(),
				text: str(),
				session: union([str(), nul()]),
				eventId: union([str(), nul()]),
			}),
			Receipt,
		),
		receipt: method(obj({ peer: str(), eventId: str() }), Receipt),
	},
});

const CAPABILITIES = ["messages"] as const;

export default defineFacet((host) => {
	host.serve(Store, (_params, self) => {
		const server = self.get(Server, {});
		const serverName = self.get(ServerName, {});
		const state = self.state(State);
		const live = self.state(Live);
		const secrets = self.open(
			async () => openSecrets(server.info.value.dataDir),
			(opened) => opened.close(),
		);
		const name = () => serverName.name.value ?? "Pi";
		const manager = createManager({
			state,
			live,
			secrets: () => secrets.value,
			ssh: () => process.env.P2_PEERS_SSH || "ssh",
			port: () => server.info.value.port,
			name,
			background: () => BACKGROUND_CONTEXT,
		});

		// One policy per linked peer, as plain data: a peer's entry follows its record, and none means it may do nothing.
		const policies = self.derive([state], ([value]) => {
			const entries: Record<string, JsonValue> = {};
			for (const id of Object.keys((value as { peers: object }).peers)) {
				const policy = manager.policyOf(manager.peer(id));
				if (policy) entries[`peer:${id}`] = policy as unknown as JsonValue;
			}
			return entries;
		});
		self.contribute(AddressedPolicies, policies as never);
		self.contribute(Routes, peerRoutes(manager, name, CAPABILITIES));
		self.onLive(async (ctx) => {
			const signal = signalOf(ctx);
			const stop = await announce(
				{
					protocol: PROTOCOL,
					instanceId: state.value.id,
					name: name(),
					port: server.info.value.port,
				},
				announceDirectory(),
			);
			manager.reconcile();
			const timer = setInterval(
				() => void manager.refresh().catch(() => {}),
				30_000,
			);
			timer.unref();
			await new Promise<void>((resolve) =>
				signal.aborted
					? resolve()
					: signal.addEventListener("abort", () => resolve(), { once: true }),
			);
			clearInterval(timer);
			manager.stop();
			await stop();
		});

		const view = deriveTyped(self, [state, live], ([value, links]) =>
			Object.values(value.peers).map((peer) => {
				const link = links.links[peer.id];
				const up = peer.state === "connected" && link?.link === "up";
				return {
					id: peer.id,
					name: peer.name,
					ssh: peer.ssh,
					state: peer.state === "denied" ? ("requested" as const) : peer.state,
					link: up
						? ("up" as const)
						: peer.state === "denied"
							? ("down" as const)
							: (link?.link ??
								(peer.ssh === null
									? ("down" as const)
									: ("connecting" as const))),
					policy: peer.policy,
					...(peer.state === "denied"
						? { error: "The other owner did not accept the request" }
						: link?.error
							? { error: link.error }
							: {}),
				};
			}),
		);
		const reply = (
			value: { state?: unknown; eventId?: unknown },
			fallback: string,
		) => ({
			state: typeof value.state === "string" ? value.state : "unknown",
			eventId: typeof value.eventId === "string" ? value.eventId : fallback,
		});
		const failure = (response: { status: number; body: unknown }) =>
			new Error(
				`${(response.body as { error?: string } | undefined)?.error ?? `The peer answered ${response.status}`}`,
			);

		return {
			self: deriveTyped(self, [state, serverName.name], ([value, label]) => ({
				id: value.id,
				name: label ?? "Pi",
			})),
			peers: view,
			incoming: deriveTyped(self, [state], ([value]) =>
				Object.values(value.incoming)
					.map(({ id, name: from, at }) => ({ id, name: from, at }))
					.sort((a, b) => b.at - a.at),
			),
			find: async ({ target }) => {
				if (!SSH_TARGET.test(target)) throw invalid("args", "Use user@host");
				const found = await findOver(process.env.P2_PEERS_SSH || "ssh", target);
				return found.filter(
					(candidate) => candidate.instanceId !== state.value.id,
				);
			},
			ask: async ({ target, candidate }, ctx) => {
				if (!SSH_TARGET.test(target)) throw invalid("args", "Use user@host");
				await manager.ask(target, candidate, ctx);
				return null;
			},
			approve: async ({ id }, ctx) => {
				await manager.approve(id, ctx);
				return null;
			},
			deny: async ({ id }, ctx) => {
				await manager.deny(id, ctx);
				return null;
			},
			remove: async ({ id }, ctx) => {
				await manager.remove(id, ctx);
				return null;
			},
			setPolicy: async ({ id, policy }, ctx) => {
				await manager.setPolicy(id, policy, ctx);
				return null;
			},
			list: async () => manager.list(),
			targets: async ({ peer }) => {
				const response = await manager.toPeer(peer, "GET", "/targets");
				if (response.status !== 200) throw failure(response);
				return (response.body as { targets: { id: string; title: string }[] })
					.targets;
			},
			send: async ({ peer, text, session, eventId }) => {
				const response = await manager.toPeer(peer, "POST", "/events", {
					text,
					...(session ? { session } : {}),
					...(eventId ? { eventId } : {}),
				});
				if (response.status !== 200 && response.status !== 202)
					throw failure(response);
				return reply(
					response.body as { state?: unknown; eventId?: unknown },
					eventId ?? "",
				);
			},
			receipt: async ({ peer, eventId }) => {
				const response = await manager.toPeer(
					peer,
					"GET",
					`/receipts/${encodeURIComponent(eventId)}`,
				);
				if (response.status === 404) return { state: "missing", eventId };
				if (response.status !== 200) throw failure(response);
				return reply(response.body as { state?: unknown }, eventId);
			},
		};
	});

	host.serve(Peers, (_params, principal, self) => {
		if (!isOwner(principal)) throw forbidden("Peers are the owner's");
		const store = self.get(Store, {});
		return {
			variant: "owner",
			members: {
				self: store.self,
				peers: store.peers,
				incoming: store.incoming,
				find: (args, ctx) => store.find(args, ctx),
				request: (args, ctx) => store.ask(args, ctx),
				approve: (args, ctx) => store.approve(args, ctx),
				deny: (args, ctx) => store.deny(args, ctx),
				remove: (args, ctx) => store.remove(args, ctx),
				setPolicy: (args, ctx) => store.setPolicy(args, ctx),
			},
		};
	});

	host.serve(PeersWorker, (_params, principal, self) => {
		if (!isWorker(principal))
			throw forbidden("Peers are reached by session workers");
		const store = self.get(Store, {});
		return {
			variant: "worker",
			members: {
				list: (args, ctx) => store.list(args, ctx),
				targets: (args, ctx) => store.targets(args, ctx),
				send: ({ peer, text, session, eventId }, ctx) =>
					store.send(
						{ peer, text, session: session ?? null, eventId: eventId ?? null },
						ctx,
					),
				receipt: (args, ctx) => store.receipt(args, ctx),
			},
		};
	});
});
