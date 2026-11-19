// Owner-configured preview metadata is read-only, provenance-preserving and never guessed from registry labels.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readPreviews } from "../../plugins/repositories/previews.ts";

test("reads Infra leases and exact-URL declarations, retaining unknown and expired metadata without modifying sources", async (t) => {
	const directory = mkdtempSync(join(tmpdir(), "p2-work-context-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	const registry = join(directory, "infra.json");
	const lease = {
		owner: "matches-a-session-title",
		purpose: "Private review",
		port: 21001,
		paths: [],
		prefixes: [],
		expires_at: 1,
	};
	writeFileSync(
		registry,
		JSON.stringify({ version: 1, leases: { ui: lease, unlinked: { ...lease, expires_at: 9999999999 } } }),
	);
	const config = {
		infra: { registry, domain: "preview.example" },
		previews: [
			{
				id: "ui",
				name: "UI",
				url: "https://ui.preview.example",
				session: "explicit-session",
				location: { env: null, cwd: "/work/ui" },
			},
			{
				id: "atlas",
				name: "Atlas",
				url: "https://atlas.preview.example/",
				session: "writer-session",
				nonExpiring: true,
				access: "Private Tailnet",
				note: "Published release, not the authoring worktree",
			},
		],
	};
	writeFileSync(join(directory, "work-context.json"), JSON.stringify(config));
	const before = readFileSync(registry, "utf8");
	const result = await readPreviews(directory, [
		{ id: "port", port: 22001, url: "https://port.preview.example/", session: "opening-session" },
	]);
	assert.equal(result.items.length, 4);
	const linked = result.items.find((preview) => preview.id === "declared:ui")!;
	assert.deepEqual(linked.lease, { kind: "expires", at: 1000 });
	const atlas = result.items.find((preview) => preview.id === "declared:atlas")!;
	assert.deepEqual(atlas.lease, { kind: "none" });
	const forward = result.items.find((preview) => preview.id === "forward:port")!;
	assert.deepEqual(forward.lease, { kind: "unknown" });
	assert.equal(readFileSync(registry, "utf8"), before);
	writeFileSync(registry, JSON.stringify({ version: 2, leases: {} }));
	await assert.rejects(readPreviews(directory, []), /Unsupported Infra preview registry schema/);
});

test("an absent optional config never inspects host registries and unsafe URLs fail closed", async (t) => {
	const directory = mkdtempSync(join(tmpdir(), "p2-work-context-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	assert.deepEqual((await readPreviews(directory, [])).items, []);
	await assert.rejects(
		readPreviews(directory, [{ id: "unsafe", port: 22001, url: "javascript:alert(1)" }]),
		/Unsafe preview URL/,
	);
	for (const url of ["javascript:alert(1)", "https://user:password@preview.example/"]) {
		writeFileSync(
			join(directory, "work-context.json"),
			JSON.stringify({ previews: [{ id: "bad", name: "Bad", url }] }),
		);
		await assert.rejects(readPreviews(directory, []), /Unsafe preview URL/);
	}
	writeFileSync(
		join(directory, "work-context.json"),
		JSON.stringify({
			previews: [
				{ id: "first", name: "First", url: "https://preview.example" },
				{ id: "second", name: "Second", url: "https://preview.example/" },
			],
		}),
	);
	await assert.rejects(readPreviews(directory, []), /Duplicate preview declaration URL/);
});

test("explicit static-router coverage includes nonexpiring unknown associations and rereads dynamic sources without invented ages", async (t) => {
	const directory = mkdtempSync(join(tmpdir(), "p2-preview-coverage-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	const registry = join(directory, "registry.json");
	const routes = join(directory, "routes.yml");
	writeFileSync(registry, JSON.stringify({ version: 1, leases: {} }));
	const document = {
		http: {
			routers: {
				alderpoint: {
					rule: "Host(`alderpoint.preview.example`)",
					entryPoints: ["pitailnet"],
					service: "alderpoint",
					tls: {},
				},
				atlas: { rule: "Host(`atlas.preview.example`)", entryPoints: ["pitailnet"], service: "atlas" },
				unscoped: { rule: "Host(`unscoped.preview.example`)", entryPoints: ["web"], service: "unscoped" },
			},
			services: {
				alderpoint: { loadBalancer: { passHostHeader: true, servers: [{ url: "http://127.0.0.1:5173" }] } },
				atlas: { loadBalancer: { servers: [{ url: "http://127.0.0.1:4337" }] } },
			},
		},
	};
	writeFileSync(routes, JSON.stringify(document));
	writeFileSync(
		join(directory, "work-context.json"),
		JSON.stringify({
			infra: {
				registry,
				domain: "preview.example",
				routes: { file: routes, routers: ["alderpoint", "atlas", "retired"] },
			},
			previews: [
				{
					id: "atlas",
					name: "Atlas",
					url: "https://atlas.preview.example/",
					session: "author",
					event: { kind: "updated", at: 1234 },
				},
			],
		}),
	);
	const before = readFileSync(routes, "utf8");
	const result = await readPreviews(directory, [{ id: "no-url", port: 22001 }]);
	assert.equal(result.items.length, 2);
	const alderpoint = result.items.find((item) => item.id === "infra-static:alderpoint")!;
	assert.equal(alderpoint.url, "https://alderpoint.preview.example/");
	assert.deepEqual(alderpoint.lease, { kind: "none" });
	assert.ok(!result.items.some((item) => item.id === "forward:no-url"));
	assert.equal(readFileSync(routes, "utf8"), before);
	writeFileSync(
		registry,
		JSON.stringify({
			version: 1,
			leases: {
				new: { owner: "Atlas", purpose: "review", port: 21001, paths: [], prefixes: [], expires_at: 9999999999 },
			},
		}),
	);
	assert.equal((await readPreviews(directory, [])).items.length, 3);
	document.http.routers.alderpoint.entryPoints = ["web"];
	writeFileSync(routes, JSON.stringify(document));
	await assert.rejects(readPreviews(directory, []), /Unsupported configured private router/);
});
