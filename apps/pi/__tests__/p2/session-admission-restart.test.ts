import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { bool, int, obj, str } from "@earendil-works/pi-schema";
import { defineFacet, defineState, local, method, record, BACKGROUND_CONTEXT as TEST } from "@p2/app/v1";
import { sessionAdmissionOf } from "@p2/app/v1/server";
import { startServer } from "../../src/hosts/server.ts";
import { openHostStore } from "../../src/runtime/host-dirs.ts";
import { createHost, Server } from "../../src/runtime/chord.ts";

const Probe = local("test.admission-restart", {
	version: 1,
	params: {},
	members: {
		mutate: method(str()),
		reserveGroup: method(obj({}), bool()),
		releaseGroup: method(obj({})),
	},
});

it("retains a live worker's reservation across server restart through a data-directory alias", async (t) => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "p2-admission-")));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const dataDir = join(root, "data");
	const alias = join(root, "alias");
	const facet = defineFacet((host) => {
		host.serve(Probe, (_params, self) => {
			const admission = sessionAdmissionOf(self);
			return {
				mutate: (session, ctx) => admission().mutate(session, async () => null, ctx),
				reserveGroup: (_args, ctx) =>
					admission().reserveGroup(
						["source", "destination"],
						{ generation: 1, pid: process.pid },
						"group",
						async () => true,
						ctx,
					),
				releaseGroup: async (_args, ctx) => {
					await admission().releaseGroup(["source", "destination"], "group", ctx);
					return null;
				},
			};
		});
	});
	const start = (path: string) =>
		startServer({
			dataDir: path,
			port: 0,
			web: false,
			fake: true,
			plugins: [],
			facets: [{ name: "test.probe", facet }],
		});
	const legacy = local("p2.session-admission", {
		version: 1, params: {}, members: { seed: method(obj({})) },
	});
	const legacyState = defineState("reservations", {
		version: 1,
		schema: obj({ sessions: record(obj({ epoch: str(), generation: int(), pid: int({ minimum: 1 }), token: str() })) }),
		initial: () => ({ sessions: {} }), persist: true, checkpointWhen: () => true,
	});
	const store = await openHostStore(join(dataDir, "server"), { outbox: false }, TEST);
	const old = createHost({ store, address: Server(), onError: () => {} });
	const report = await old.load([{ name: "legacy", facet: defineFacet((host) => {
		host.serve(legacy, (_params, self) => {
			const saved = self.state(legacyState);
			return { seed: async (_args, ctx) => {
				await saved.change((draft) => {
					draft.sessions["session|session"] = { epoch: "legacy", generation: 1, pid: process.pid, token: "token" };
				}, ctx);
				return null;
			} };
		});
	}) }], TEST);
	assert.deepEqual(report.failed, []);
	try {
		await old.root(async (ctx) => (await ctx.get(legacy, {})).seed({}, ctx), TEST);
	} finally {
		await old.close(TEST);
		await store.close(TEST);
	}
	const original = await start(dataDir);
	try {
		await original.host.root(async (ctx) => {
			const probe = await ctx.get(Probe, {});
			await assert.rejects(probe.mutate("session", ctx), /goal step is being admitted/);
			assert.equal(await probe.reserveGroup({}, ctx), true);
			await assert.rejects(probe.mutate("source", ctx), /citation is being admitted/);
		}, TEST);
	} finally {
		await original.close();
	}
	symlinkSync(dataDir, alias, "dir");
	const restarted = await start(alias);
	try {
		assert.equal(restarted.dataDir, dataDir);
		await restarted.host.root(async (ctx) => {
			const probe = await ctx.get(Probe, {});
			for (const id of ["source", "destination"])
				await assert.rejects(probe.mutate(id, ctx), /citation is being admitted/);
			await probe.releaseGroup({}, ctx);
			for (const id of ["source", "destination"]) await probe.mutate(id, ctx);
			await assert.rejects(probe.mutate("session", ctx), /goal step is being admitted/);
		}, TEST);
	} finally {
		await restarted.close();
	}
});
