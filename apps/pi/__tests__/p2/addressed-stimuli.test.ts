import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { BACKGROUND_CONTEXT, type Ctx } from "@p2/app/v1";
import { Hosts, WakeStore } from "@p2/app/v1/server";
import { FamiliarStore } from "../../plugins/familiar/contract.ts";
import { Catalog } from "../../plugins/sessions/contract.ts";
import { SessionTree } from "../../plugins/tree/contract.ts";
import { startServer } from "../../src/hosts/server.ts";
import { clientHost, holdIn, localOwner, poll } from "./helpers.ts";

it("addresses one native admission per peer event across competing selectors and server restart", { timeout: 45_000 }, async () => {
	const dataDir = await mkdtemp(join(tmpdir(), "p2-addressed-"));
	let server: Awaited<ReturnType<typeof startServer>> | undefined;
	try {
		const plugin = join(dataDir, "plugins", "fixture-policy");
		await mkdir(plugin, { recursive: true });
		await writeFile(join(plugin, "package.json"), JSON.stringify({ name: "fixture-policy", type: "module" }));
		await writeFile(join(plugin, "server.ts"), `
			import { defineFacet } from '@p2/app/v1';
			import { AddressedPolicies } from '@p2/app/v1/server';
			export default defineFacet((_host, self) => self.contribute(AddressedPolicies, {
				fixture: { label: 'Fixture peer', revision: '1', discover: ['00000000-0000-4000-8000-000000000001'], send: { familiar: true, sessions: ['00000000-0000-4000-8000-000000000001'] }, receipts: true },
				observer: { label: 'Read only', revision: '1', receipts: true }
			}));
		`);
		const start = () => startServer({ dataDir, fake: true, port: 0, web: false });
		server = await start();
		const root = <T>(fn: (ctx: Ctx) => Promise<T>) => server!.host.root(fn, BACKGROUND_CONTEXT);
		const familiar = await root(async (ctx) => (await ctx.get(FamiliarStore, {})).open(ctx));
		await root(async (ctx) => (await ctx.get(Catalog, {})).create({
			id: "00000000-0000-4000-8000-000000000001", title: "Other", cwd: dataDir, model: { provider: "faux", modelId: "faux-1" }, thinkingLevel: "off",
		}, ctx));
		const discover = () => root(async (ctx) => (await ctx.get(WakeStore, {})).discoverAddressed({ peer: "fixture" }, ctx));
		assert.deepEqual(await discover(), [{ id: "00000000-0000-4000-8000-000000000001", title: "Other" }]);
		await root(async (ctx) => assert.equal((await ctx.get(Hosts, {})).workers.value["00000000-0000-4000-8000-000000000001"], undefined));
		const send = (session?: string, eventId = "race") => root(async (ctx) => (await ctx.get(WakeStore, {})).sendAddressed({
			peer: "fixture", eventId, text: "Synthetic payload", ...(session === undefined ? {} : { session }),
		}, ctx));
		const receipt = (peer = "fixture") => root(async (ctx) => (await ctx.get(WakeStore, {})).receiptAddressed({ peer, eventId: "race" }, ctx));
		await assert.rejects(send("denied"), /not authorized/);
		const attempts = await Promise.allSettled([send(), send("00000000-0000-4000-8000-000000000001")]);
		assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
		const loser = attempts.find((attempt) => attempt.status === "rejected");
		assert.match(String(loser?.reason), /conflict/);
		await poll(async () => (await receipt()).state === "admitted", 15_000);
		const before = await receipt();
		assert.equal(before.state, "admitted");
		assert.equal(before.receipt.conversation, 1);
		assert.deepEqual(await receipt("observer"), { state: "missing" });
		const other = "00000000-0000-4000-8000-000000000001";
		const winner = attempts[0]?.status === "fulfilled" ? undefined : other;
		const owner = clientHost(await localOwner(server));
		try {
			const tree = await holdIn(owner, SessionTree, { session: winner ?? familiar.id }, "owner");
			try {
				const branch = await tree.branch({ conversation: 1, label: "New main" }, BACKGROUND_CONTEXT);
				assert.notEqual(branch.conversation, 1);
				assert.deepEqual(await send(winner), before);
			} finally {
				tree.release();
			}
		} finally {
			await owner.close(BACKGROUND_CONTEXT);
		}
		await server.close();
		await writeFile(join(plugin, "server.ts"), `
			import { defineFacet } from '@p2/app/v1';
			import { AddressedPolicies } from '@p2/app/v1/server';
			export default defineFacet((_host, self) => self.contribute(AddressedPolicies, {
				fixture: { label: 'Fixture peer', revision: '2', receipts: true }
			}));
		`);
		server = await start();
		await assert.rejects(send(winner), /not authorized/);
		assert.deepEqual(await receipt(), before);
		await assert.rejects(send(undefined, "new-event"), /not authorized/);
		assert.deepEqual(await discover(), []);
	} finally {
		await server?.close();
		await rm(dataDir, { recursive: true, force: true });
	}
});
