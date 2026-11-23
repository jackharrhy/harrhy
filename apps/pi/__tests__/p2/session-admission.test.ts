import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import { obj } from "@earendil-works/pi-schema";
import { createHost, defineFacet, local, method, SERVER, BACKGROUND_CONTEXT as TEST } from "@p2/app/v1";
import { Hosts, sessionAdmissionOf } from "@p2/app/v1/server";
import { Chat } from "../../plugins/chat/contract.ts";
import { GoalEligibility } from "../../plugins/goal/contract.ts";
import { Catalog, SessionLock, Sessions } from "../../plugins/sessions/contract.ts";
import { holdIn, memoryLinkPair, startFixture, until } from "./helpers.ts";

const Probe = local("test.admission-probe", { version: 1, params: {}, members: { hold: method(obj({})) } });

it(
	"orders goal admission against locking and archive, including an unacknowledged reservation",
	{ timeout: 30_000 },
	async (t) => {
		const entered = Promise.withResolvers<void>();
		const finish = Promise.withResolvers<void>();
		let session = "";
		const fixture = await startFixture({
			facets: [
				{
					name: "test.admission-probe",
					facet: defineFacet((host) => {
						host.serve(Probe, (_params, self) => {
							const admission = sessionAdmissionOf(self);
							return {
								hold: (_args, ctx) =>
									admission().mutate(
										session,
										async () => {
											entered.resolve();
											await finish.promise;
											return null;
										},
										ctx,
									),
							};
						});
					}),
				},
			],
		});
		t.after(async () => {
			finish.resolve();
			await fixture.close();
		});
		const owner = fixture.browser();
		const sessions = await holdIn(owner, Sessions, {}, "owner");
		({ id: session } = await sessions.create({ cwd: fixture.workspace }, TEST));
		const { id: other } = await sessions.create({ cwd: fixture.workspace }, TEST);
		await holdIn(owner, Chat, { session, conversation: 1 }, "participant");
		const generation = await fixture.server.host.root(async (ctx) => {
			const hosts = await ctx.get(Hosts, {});
			return (await until(hosts.workers, (value) => value[session]?.running === true))[session].generation;
		}, TEST);
		const principal = { kind: "worker" as const, session, generation };
		const [down, up] = memoryLinkPair();
		const lost = Promise.withResolvers<void>();
		let dropReply = false;
		fixture.server.host.accept(
			{
				send: (message) => {
					if (dropReply) lost.resolve();
					else down.send(message);
				},
				close: () => down.close(),
				onMessage: (listener) => down.onMessage(listener),
				onClose: (listener) => down.onClose(listener),
			},
			{ principal },
			TEST,
		);
		const worker = createHost({ onError: () => {} });
		t.after(() => worker.close(TEST));
		worker.connect(up, { principal: SERVER }, TEST);
		await worker.load([], TEST);
		const goal = await holdIn(worker, GoalEligibility, {}, "worker");
		const locks = await holdIn(owner, SessionLock, {}, "owner");
		const lock = { mcp: [], projectMcp: false, instructions: false, capabilities: [] };
		const reserve = () => goal.reserve({ token: randomUUID() }, TEST);
		const setLock = () => locks.set({ session, lock }, TEST);
		const archive = () => sessions.archive({ id: session }, TEST);

		const writing = fixture.server.host.root(async (ctx) => (await ctx.get(Probe, {})).hold({}, ctx), TEST);
		await entered.promise;
		assert.equal(await reserve(), false);
		finish.resolve();
		await writing;

		await setLock();
		assert.equal(await reserve(), false);
		await locks.set({ session, lock: null }, TEST);

		const token = randomUUID();
		dropReply = true;
		const unacknowledged = goal.reserve({ token }, TEST);
		const rejected = assert.rejects(unacknowledged);
		await lost.promise;
		down.close();
		await rejected;
		const reconnected = await holdIn(fixture.as(principal), GoalEligibility, {}, "worker");
		await reconnected.releaseReservation({ token: randomUUID() }, TEST);
		for (const write of [setLock, archive]) await assert.rejects(write(), /goal step is being admitted/);
		await reconnected.releaseReservation({ token }, TEST);
		await archive();
		await fixture.server.host.root(async (ctx) => {
			assert.notEqual((await (await ctx.get(Catalog, {})).get({ id: session }, ctx)).archivedAt, null);
		}, TEST);
	},
);
