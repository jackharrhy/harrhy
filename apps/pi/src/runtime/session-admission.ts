import { randomUUID } from "node:crypto";
import { defineRegistry, defineState, local } from "@earendil-works/chord";
import type { Context } from "@earendil-works/chord/context";
import { int, obj, opt, type Static, str } from "@earendil-works/pi-schema";
import { type FacetHost, forbidden, nativeOf, type Self, serveNative } from "./chord.ts";
import { record } from "./schema.ts";

const Reservation = obj({
	group: opt(str()),
	epoch: str(),
	generation: int(),
	pid: int({ minimum: 1 }),
	token: str(),
});
type Reservation = Static<typeof Reservation>;
const Reservations = defineState("reservations", {
	version: 1,
	schema: obj({ sessions: record(Reservation) }),
	initial: () => ({ sessions: {} }),
	persist: true,
	checkpointWhen: () => true,
});
const Admission = local("p2.session-admission", {
	version: 1,
	params: {},
	members: {},
});
type AdmissionGate = {
	reserveGroup(
		sessions: readonly string[],
		worker: Pick<Reservation, "generation" | "pid">,
		token: string,
		eligible: () => Promise<boolean>,
		ctx: Context,
	): Promise<boolean>;
	releaseGroup(sessions: readonly string[], token: string, ctx: Context): Promise<void>;
	mutate<T>(session: string, commit: () => Promise<T>, ctx: Context): Promise<T>;
	reserve(
		session: string,
		worker: Pick<Reservation, "generation" | "pid">,
		token: string,
		eligible: () => Promise<boolean>,
		ctx: Context,
	): Promise<boolean>;
	release(session: string, generation: number, token: string, ctx: Context): Promise<void>;
};
const AdmissionNative = defineRegistry<AdmissionGate, AdmissionGate | undefined>("p2.session-admission-native", {
	version: 1,
});

export function sessionAdmissionOf(self: Self) {
	self.get(Admission, {});
	return nativeOf(self, AdmissionNative, "The session admission fence");
}

export function serveSessionAdmission(host: FacetHost): void {
	serveNative(host, AdmissionNative);
	const epoch = randomUUID();
	const busy = new Set<string>();
	host.serve(Admission, (_params, self) => {
		const reservations = self.state(Reservations);
		const exclusive = async <T>(session: string, run: () => Promise<T>): Promise<T> => {
			if (busy.has(session)) throw forbidden("Session eligibility is changing; retry shortly");
			busy.add(session);
			try {
				return await run();
			} finally {
				busy.delete(session);
			}
		};
		const clear = (session: string, ctx: Context) =>
			reservations.change((draft) => {
				delete draft.sessions[`session|${session}`];
			}, ctx);
		const across = <T>(sessions: readonly string[], run: () => Promise<T>): Promise<T> => {
			const [session, ...rest] = sessions;
			return session === undefined ? run() : exclusive(session, () => across(rest, run));
		};
		self.contribute(AdmissionNative, {
			reserveGroup: (sessions, worker, token, eligible, ctx) =>
				across(sessions, async () => {
					for (const session of sessions) {
						const prior = reservations.value.sessions[`session|${session}`];
						if (prior && !exited(prior.pid)) return false;
					}
					if (!(await eligible())) return false;
					await reservations.change((draft) => {
						for (const session of sessions)
							draft.sessions[`session|${session}`] = {
								epoch,
								...worker,
								token,
								group: token,
							};
					}, ctx);
					return true;
				}),
			releaseGroup: (sessions, token, ctx) =>
				across(sessions, async () => {
					await reservations.change((draft) => {
						for (const session of sessions) {
							const key = `session|${session}`;
							if (draft.sessions[key]?.group === token) delete draft.sessions[key];
						}
					}, ctx);
				}),
			mutate: (session, commit, ctx) =>
				exclusive(session, async () => {
					const prior = reservations.value.sessions[`session|${session}`];
					if (prior) {
						if (!exited(prior.pid))
							throw forbidden(
								prior.group
									? "A citation is being admitted; retry shortly"
									: "A goal step is being admitted; retry shortly",
							);
						await clear(session, ctx);
					}
					return commit();
				}),
			reserve: (session, worker, token, eligible, ctx) =>
				busy.has(session)
					? Promise.resolve(false)
					: exclusive(session, async () => {
							const prior = reservations.value.sessions[`session|${session}`];
							if (prior?.group && !exited(prior.pid)) return false;
							if (prior?.epoch === epoch && prior.generation === worker.generation) return false;
							// An authenticated successor reached the server only after taking the same per-session process lock.
							if (prior) await clear(session, ctx);
							if (!(await eligible())) return false;
							await reservations.change((draft) => {
								draft.sessions[`session|${session}`] = {
									epoch,
									...worker,
									token,
								};
							}, ctx);
							return true;
						}),
			release: async (session, generation, token, ctx) => {
				const prior = reservations.value.sessions[`session|${session}`];
				if (prior?.group || prior?.epoch !== epoch || prior.generation !== generation || prior.token !== token) return;
				await exclusive(session, () => clear(session, ctx));
			},
		});
		return {};
	});
}

function exited(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return false;
	} catch (error) {
		// PID reuse can delay cleanup but never proves an exit. A failed heartbeat proves nothing.
		return (error as NodeJS.ErrnoException).code === "ESRCH";
	}
}
