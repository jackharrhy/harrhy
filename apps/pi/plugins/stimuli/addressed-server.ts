import { createHash } from "node:crypto";
import { type Static } from "@earendil-works/pi-schema";
import { awaitWithContext, type FacetHost, forbidden, isWorker, serveKeyed, PluginError, type Ref, type Self, type Ctx } from "@p2/app/v1";
import { Hosts, sessionAdmissionOf } from "@p2/app/v1/server";
import { FamiliarStore } from "../familiar/contract.ts";
import { Catalog } from "../sessions/contract.ts";
import {
	AddressedFence, type AddressedIntent, AddressedPolicies, type AddressedPolicy,
	type AddressedReadback, AddressedWorker, WakeStore,
} from "./contract.ts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const key = (peer: string, eventId: string) => `addressed:${JSON.stringify([peer, eventId])}`;
type PolicyEntry = AddressedPolicy | (() => AddressedPolicy | undefined) | undefined;
const currentPolicy = (entry: PolicyEntry) =>
	typeof entry === "function" ? entry() : entry;
const allowed = (policy: AddressedPolicy | undefined, selector: string | undefined) =>
	selector === undefined ? policy?.send?.familiar === true : (policy?.send?.sessions === "all-private" || policy?.send?.sessions.includes(selector) === true);
export function mayDeliver(row: AddressedIntent, entry: PolicyEntry) {
	// A provider may not yet have registered after restart. Only a loaded provider can withdraw an intent.
	if (!entry) throw new Error("Addressed policy provider unavailable");
	const policy = currentPolicy(entry);
	return row.revision === policy?.revision && allowed(policy, row.selector);
}

export async function findTarget(catalog: Ref<typeof Catalog>, id: string, ctx: Ctx) {
	try {
		return await catalog.get({ id }, ctx);
	} catch (error) {
		if (error instanceof PluginError && error.code === "session_not_found") return undefined;
		throw error;
	}
}

function readback(row: AddressedIntent): Static<typeof AddressedReadback> {
	switch (row.phase.kind) {
		case "scheduled": return { state: "recorded" };
		case "closed": return { state: "blocked" };
		case "settled":
		case "admitted": return { state: "admitted", receipt: row.phase.receipt };
		default: return { state: "unknown" };
	}
}

type AddressedState = { addressed: Record<string, AddressedIntent> };
export function addressedMethods(
	self: Self,
	saved: { value: AddressedState; change(fn: (draft: AddressedState) => void, ctx: Ctx): Promise<unknown> },
) {
	const policies = self.registry(AddressedPolicies);
	const catalog = self.get(Catalog, {});
	const requireReceipt = (peer: string) => {
		if (!currentPolicy(policies.value.get(peer))?.receipts) throw forbidden("Addressed receipt not authorized");
	};
	return {
		discoverAddressed: async ({ peer }: { peer: string }, ctx: Ctx) => {
			const policy = currentPolicy(policies.value.get(peer));
			const rows = [];
			const ids = policy?.discover === "all-private"
				? await catalog.openIds({}, ctx)
				: new Set(policy?.discover ?? []);
			for (const id of ids) {
				const row = await findTarget(catalog, id, ctx);
				if (row?.archivedAt === null && (await findTarget(catalog, id, ctx))?.archivedAt === null)
					rows.push({ id, title: row.title });
			}
			return policy?.revision === currentPolicy(policies.value.get(peer))?.revision ? rows : [];
		},
		sendAddressed: async ({ peer, eventId, session: selector, text, from }: { peer: string; eventId: string; session?: string; text: string; from?: string }, ctx: Ctx) => {
			if (Buffer.byteLength(text) > 32768) throw new Error("Addressed stimulus exceeds 32768 bytes");
			const id = key(peer, eventId);
			const requireSend = () => {
				const policy = currentPolicy(policies.value.get(peer));
				if (!policy || !allowed(policy, selector)) throw forbidden("Addressed send not authorized");
				return policy;
			};
			const policy = requireSend();
			const payloadHash = hash(text);
			const recover = (row: AddressedIntent) => {
				requireReceipt(peer);
				if (row.selector !== selector || row.payloadHash !== payloadHash ||
					(from ? row.label !== `${from} via Pi Inbox` : row.label.endsWith(" via Pi Inbox"))) throw new PluginError("addressed_conflict", "Addressed stimulus conflict");
				return readback(row);
			};
			const existing = saved.value.addressed[id];
			if (existing) return recover(existing);
			const session = selector ?? (await ctx.get(FamiliarStore, {})).session.value;
			if (!session || (await findTarget(catalog, session, ctx))?.archivedAt !== null)
				throw forbidden("Addressed target unavailable");
			const conversation = await (await awaitWithContext(ctx.get(AddressedWorker, { session }), ctx)).main({}, ctx);
			let inserted = false;
			await saved.change((draft) => {
				if (draft.addressed[id]) return;
				if (currentPolicy(policies.value.get(peer))?.revision !== policy.revision) throw forbidden("Addressed policy changed");
				const intentHash = hash(JSON.stringify([id, selector ?? null, session, conversation, payloadHash, policy.revision]));
				draft.addressed[id] = {
					peer, eventId, ...(selector === undefined ? {} : { selector }), payloadHash,
					label: from ? `${from} via Pi Inbox` : policy.label, revision: policy.revision,
					delivery: { id, session, conversation, text, intentHash, notBefore: Date.now() },
					phase: { kind: "scheduled" },
				};
				inserted = true;
			}, ctx);
			if (inserted) return { state: "recorded" as const };
			requireSend();
			return recover(saved.value.addressed[id]!);
		},
		receiptAddressed: async ({ peer, eventId }: { peer: string; eventId: string }) => {
			requireReceipt(peer);
			const row = saved.value.addressed[key(peer, eventId)];
			return row ? readback(row) : { state: "missing" as const };
		},
		addressedRow: async ({ id }: { id: string }) => saved.value.addressed[id] ?? null,
	};
}
export function serveAddressed(host: FacetHost) {
	serveKeyed(host, AddressedPolicies);
	host.serve(AddressedFence, (_params, principal, self) => {
		if (!isWorker(principal)) throw forbidden("Addressed fence is worker-only");
		const { session, generation } = principal;
		const hosts = self.get(Hosts, {});
		const rows = self.get(WakeStore, {});
		const catalog = self.get(Catalog, {});
		const policies = self.registry(AddressedPolicies);
		const gate = sessionAdmissionOf(self);
		return { variant: "worker", members: {
			reserve: async ({ token, id, intentHash }, ctx) => {
				const worker = hosts.workers.value[session];
				if (!worker?.running || worker.generation !== generation || !worker.pid) throw forbidden("Stale worker");
				const reserved = await gate().reserve(session, { generation, pid: worker.pid }, token, async () => {
					const row = await rows.addressedRow({ id }, ctx);
					if (!row || row.delivery.session !== session || row.delivery.intentHash !== intentHash ||
						row.phase.kind !== "pending" || (await catalog.get({ id: session }, ctx)).archivedAt !== null ||
						!mayDeliver(row, policies.value.get(row.peer)))
						throw forbidden("Addressed admission withdrawn");
					return true;
				}, ctx);
				if (!reserved) throw new Error("Session eligibility is changing; retry shortly");
				return null;
			},
			releaseReservation: async ({ token }, ctx) => {
				await gate().release(session, generation, token, ctx);
				return null;
			},
		} };
	});
}
