import { createHash } from "node:crypto";
import { type Static } from "@earendil-works/pi-schema";
import { awaitWithContext, type FacetHost, forbidden, isWorker, serveKeyed, type Self, type Ctx } from "@p2/app/v1";
import { Hosts, sessionAdmissionOf } from "@p2/app/v1/server";
import { FamiliarStore } from "../familiar/contract.ts";
import { Catalog } from "../sessions/contract.ts";
import { Shares } from "../sharing/contract.ts";
import {
	AddressedFence, type AddressedIntent, AddressedPolicies, type AddressedPolicy,
	type AddressedReadback, AddressedWorker, WakeStore,
} from "./contract.ts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const key = (peer: string, eventId: string) => `addressed:${JSON.stringify([peer, eventId])}`;
const allowed = (policy: AddressedPolicy | undefined, selector: string | undefined) =>
	selector === undefined ? policy?.send?.familiar === true : policy?.send?.sessions.includes(selector) === true;
export const mayDeliver = (row: AddressedIntent, policy: AddressedPolicy | undefined) =>
	row.revision === policy?.revision && allowed(policy, row.selector);

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
	const shares = self.get(Shares, {});
	const requireReceipt = (peer: string) => {
		if (!policies.value.get(peer)?.receipts) throw forbidden("Addressed receipt not authorized");
	};
	return {
		discoverAddressed: async ({ peer }: { peer: string }, ctx: Ctx) => {
			const policy = policies.value.get(peer);
			const rows = [];
			for (const id of new Set(policy?.discover ?? [])) {
				const row = await catalog.get({ id }, ctx).catch(() => undefined);
				if (row?.archivedAt === null && !(await shares.isShared({ session: id }, ctx)))
					rows.push({ id, title: row.title });
			}
			return policy === policies.value.get(peer) ? rows : [];
		},
		sendAddressed: async ({ peer, eventId, session: selector, text }: { peer: string; eventId: string; session?: string; text: string }, ctx: Ctx) => {
			if (Buffer.byteLength(text) > 32768) throw new Error("Addressed stimulus exceeds 32768 bytes");
			const id = key(peer, eventId);
			const payloadHash = hash(text);
			const recover = (row: AddressedIntent) => {
				requireReceipt(peer);
				if (row.selector !== selector || row.payloadHash !== payloadHash) throw new Error("Addressed stimulus conflict");
				return readback(row);
			};
			const existing = saved.value.addressed[id];
			if (existing) return recover(existing);
			const policy = policies.value.get(peer);
			if (!policy || !allowed(policy, selector)) throw forbidden("Addressed send not authorized");
			const session = selector ?? (await ctx.get(FamiliarStore, {})).session.value;
			if (!session || (await catalog.get({ id: session }, ctx).catch(() => undefined))?.archivedAt !== null ||
				await shares.isShared({ session }, ctx)) throw forbidden("Addressed target unavailable");
			const conversation = await (await awaitWithContext(ctx.get(AddressedWorker, { session }), ctx)).main({}, ctx);
			let inserted = false;
			await saved.change((draft) => {
				if (draft.addressed[id]) return;
				if (policies.value.get(peer) !== policy) throw forbidden("Addressed policy changed");
				const intentHash = hash(JSON.stringify([id, selector ?? null, session, conversation, payloadHash, policy.revision]));
				draft.addressed[id] = {
					peer, eventId, ...(selector === undefined ? {} : { selector }), payloadHash,
					label: policy.label, revision: policy.revision,
					delivery: { id, session, conversation, text, intentHash, notBefore: Date.now() },
					phase: { kind: "scheduled" },
				};
				inserted = true;
			}, ctx);
			return inserted ? { state: "recorded" as const } : recover(saved.value.addressed[id]!);
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
		const shares = self.get(Shares, {});
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
						await shares.isShared({ session }, ctx) || !mayDeliver(row, policies.value.get(row.peer)))
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
