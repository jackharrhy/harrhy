// Native target information for trusted external adapters; no session paths or share grants are returned.
import type { Ctx } from "@p2/app/v1";
import { FamiliarStore } from "../../../plugins/familiar/contract.ts";
import { Catalog, type Session } from "../../../plugins/sessions/contract.ts";
import { Shares } from "../../../plugins/sharing/contract.ts";

function targetOf({ id, main, branches, archivedAt, title }: Session) {
	return { id, main, branches: branches.map(({ conversation }) => ({ conversation })), archivedAt, title };
}

/** Read current catalog and privacy state without exposing the underlying share grants or paths. */
export async function externalTargets(ctx: Ctx) {
	const catalog = await ctx.get(Catalog, {});
	const shares = await ctx.get(Shares, {});
	return {
		list: () => catalog.sessions.value.map(targetOf),
		get: (id: string) => {
			const session = catalog.sessions.value.find((row) => row.id === id);
			return session && targetOf(session);
		},
		shared: (id: string) => shares.links.value.some((row) => row.session === id),
	};
}

/** Legacy ingress can only address the existing unarchived Familiar. */
export async function familiarIngressAvailable(session: string, ctx: Ctx): Promise<boolean> {
	const familiar = await ctx.get(FamiliarStore, {});
	const catalog = await ctx.get(Catalog, {});
	return familiar.session.value === session && (await catalog.get({ id: session }, ctx)).archivedAt === null;
}
