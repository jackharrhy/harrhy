// The imported project tables remain authoritative on reopen, including when deliberately empty.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@p2/app/v1";
import { Projects } from "../../plugins/projects/contract.ts";
import { startServer } from "../../src/hosts/server.ts";
import type { RefIn } from "../../src/runtime/chord.ts";
import { clientHost, holdIn, localOwner, until } from "./helpers.ts";

test("reopens current project places and memberships without restoring removed groups from projects.json", async (t) => {
	const root = mkdtempSync(join(tmpdir(), "p2-projects-reopen-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const dataDir = join(root, "data");
	mkdirSync(dataDir);
	const file = join(dataDir, "projects.json");
	const legacy = JSON.stringify({ removed: [{ path: "/old" }], retained: [{ path: "/original" }] });
	writeFileSync(file, legacy);

	const open = async (inspect: (projects: RefIn<typeof Projects, "owner">) => Promise<void>) => {
		const server = await startServer({ dataDir, port: 0, fake: true, web: false });
		try {
			const client = clientHost(await localOwner(server));
			try {
				await inspect(await holdIn(client, Projects, {}, "owner"));
			} finally {
				await client.close(BACKGROUND_CONTEXT);
			}
		} finally {
			await server.close();
		}
	};
	const currentPlace = { env: "gpu", path: "/current" };
	await open(async (projects) => {
		await until(projects.projects, (list) => list?.length === 2);
		await projects.remove({ name: "removed" }, BACKGROUND_CONTEXT);
		await projects.locate({ name: "retained", place: currentPlace }, BACKGROUND_CONTEXT);
		await projects.assign({ session: "fixture-session", project: "retained" }, BACKGROUND_CONTEXT);
	});

	await open(async (projects) => {
		assert.deepEqual(await until(projects.projects, (list) => list !== undefined), [
			{ name: "retained", places: [currentPlace, { env: null, path: "/original" }] },
		]);
		assert.deepEqual(await until(projects.sessions, (map) => map !== undefined), { "fixture-session": "retained" });
		await projects.remove({ name: "retained" }, BACKGROUND_CONTEXT);
	});

	await open(async (projects) => {
		assert.deepEqual(await until(projects.projects, (list) => list !== undefined), []);
		assert.deepEqual(await until(projects.sessions, (map) => map !== undefined), {});
	});
	assert.equal(readFileSync(file, "utf8"), legacy);
});
