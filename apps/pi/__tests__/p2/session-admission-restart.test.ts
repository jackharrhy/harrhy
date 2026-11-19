import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { bool, obj } from "@earendil-works/pi-schema";
import { defineFacet, local, method, BACKGROUND_CONTEXT as TEST } from "@p2/app/v1";
import { sessionAdmissionOf } from "@p2/app/v1/server";
import { startServer } from "../../src/hosts/server.ts";

const Probe = local("test.admission-restart", {
	version: 1,
	params: {},
	members: { reserve: method(obj({}), bool()), mutate: method(obj({})) },
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
				reserve: (_args, ctx) =>
					admission().reserve("session", { generation: 1, pid: process.pid }, "token", async () => true, ctx),
				mutate: (_args, ctx) => admission().mutate("session", async () => null, ctx),
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
	const original = await start(dataDir);
	try {
		assert.equal(await original.host.root(async (ctx) => (await ctx.get(Probe, {})).reserve({}, ctx), TEST), true);
	} finally {
		await original.close();
	}
	symlinkSync(dataDir, alias, "dir");
	const restarted = await start(alias);
	try {
		assert.equal(restarted.dataDir, dataDir);
		await assert.rejects(
			restarted.host.root(async (ctx) => (await ctx.get(Probe, {})).mutate({}, ctx), TEST),
			/goal step is being admitted/,
		);
	} finally {
		await restarted.close();
	}
});
