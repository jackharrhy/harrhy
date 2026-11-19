import { type Ctx, defineFacet, forbidden, isWorker } from "@p2/app/v1";
import { Hosts, sessionAdmissionOf } from "@p2/app/v1/server";
import { Catalog, SessionLocks } from "../sessions/contract.ts";
import { Shares } from "../sharing/contract.ts";
import { GoalEligibility } from "./contract.ts";

export default defineFacet((host) => {
	host.serve(GoalEligibility, (_params, principal, self) => {
		if (!isWorker(principal)) throw forbidden("Goal eligibility is worker-only");
		const catalog = self.get(Catalog, {});
		const locks = self.get(SessionLocks, {});
		const shares = self.get(Shares, {});
		const hosts = self.get(Hosts, {});
		const admission = sessionAdmissionOf(self);
		const { session, generation } = principal;
		const running = () => {
			const worker = hosts.workers.value[session];
			return worker?.running && worker.generation === generation && worker.pid && worker.pid > 0
				? { generation, pid: worker.pid }
				: undefined;
		};
		const eligible = async (ctx: Ctx) =>
			(await catalog.get({ id: session }, ctx)).archivedAt === null &&
			!Object.hasOwn(locks.locks.value, session) &&
			!(await shares.isShared({ session }, ctx)) &&
			running() !== undefined;
		return {
			variant: "worker",
			members: {
				check: (_args, ctx) => eligible(ctx),
				reserve: async ({ token }, ctx) => {
					const worker = running();
					return worker !== undefined && admission().reserve(session, worker, token, () => eligible(ctx), ctx);
				},
				releaseReservation: async ({ token }, ctx) => {
					await admission().release(session, generation, token, ctx);
					return null;
				},
			},
		};
	});
});
