import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import { BACKGROUND_CONTEXT as TEST } from "@p2/app/v1";
import { Sessions, SessionsV8 } from "../../plugins/sessions/contract.ts";
import { boundIn, startFixture, until } from "./helpers.ts";

it("claims an immutable owner slug, reserves it across archive and restart, and preserves v8", { timeout: 30_000 }, async (t) => {
	const fixture = await startFixture();
	t.after(() => fixture.close());
	const browser = fixture.browser();
	let owner = await boundIn(browser, Sessions, {}, "owner");
	const old = await boundIn(fixture.browser(), SessionsV8, {}, "owner");
	const cwd = fixture.workspace;
	const { id: a } = await owner.create({ cwd }, TEST);
	const { id: b } = await old.create({ cwd }, TEST);
	assert(owner.sessions.value.every((row) => !Object.hasOwn(row, "slug")));
	for (const slug of ["", "Mixed", "two--words", "-start", "end-", "a/b", "café", "line\n", "a".repeat(65), randomUUID()]) {
		await assert.rejects(async () => owner.assignSlug({ id: a, slug }, TEST));
	}
	await assert.rejects(owner.assignSlug({ id: randomUUID(), slug: "unknown" }, TEST), /Session not found/);

	const otherOwner = await boundIn(fixture.browser(), Sessions, {}, "owner");
	const slug = "a".repeat(62) + "-1";
	const claims = await Promise.allSettled([
		owner.assignSlug({ id: a, slug }, TEST),
		otherOwner.assignSlug({ id: b, slug }, TEST),
	]);
	const winner = claims[0].status === "fulfilled" ? a : b;
	const loser = winner === a ? b : a;
	assert.equal(claims.filter((claim) => claim.status === "fulfilled").length, 1);
	const refused = claims.find((claim) => claim.status === "rejected");
	assert.match(String(refused?.reason), /already reserved/);
	assert.equal(await owner.assignSlug({ id: winner, slug }, TEST), null);
	await assert.rejects(owner.assignSlug({ id: winner, slug: "different" }, TEST), /already has a URL slug/);

	await old.rename({ id: winner, title: "Renamed" }, TEST);
	await until(old.sessions, (rows) => rows.some((row) => row.id === winner && row.title === "Renamed"));
	assert(old.sessions.value.every((row) => !Object.hasOwn(row, "slug")));
	const guest = await boundIn(fixture.as({
		kind: "guest", id: "guest", name: "Guest", home: winner, sessions: { [winner]: "full" }, revision: 1,
	}), Sessions, {}, "guest");
	assert.equal(guest.sessions.value[0]?.id, winner);
	assert(!Object.hasOwn(guest.sessions.value[0], "slug"));
	await assert.rejects(async () => (guest as unknown as typeof owner).assignSlug({ id: winner, slug }, TEST));

	await owner.archive({ id: winner }, TEST);
	await fixture.restart();
	owner = await boundIn(fixture.browser(), Sessions, {}, "owner");
	const archived = owner.sessions.value.find((row) => row.id === winner);
	assert.equal(archived?.slug, slug);
	assert.equal(archived?.title, "Renamed");
	assert.equal(typeof archived?.archivedAt, "number");
	await assert.rejects(owner.assignSlug({ id: loser, slug }, TEST), /already reserved/);
	await owner.restore({ id: winner }, TEST);
	const restored = await until(owner.sessions, (rows) => rows.some((row) => row.id === winner && row.archivedAt === null));
	assert.equal(restored.find((row) => row.id === winner)?.slug, slug);
});

it("creates with a slug atomically and never leaves a session for a failed claim", { timeout: 30_000 }, async (t) => {
	const fixture = await startFixture();
	t.after(() => fixture.close());
	const owner = await boundIn(fixture.browser(), Sessions, {}, "owner");
	const other = await boundIn(fixture.browser(), Sessions, {}, "owner");
	const old = await boundIn(fixture.browser(), SessionsV8, {}, "owner");
	const cwd = fixture.workspace;
	const slug = "create-slug";
	const a = randomUUID();
	const b = randomUUID();
	const claims = await Promise.allSettled([
		owner.create({ cwd, id: a, slug }, TEST),
		other.create({ cwd, id: b, slug }, TEST),
	]);
	const created = claims.filter((claim) => claim.status === "fulfilled");
	assert.equal(created.length, 1);
	const { id, slug: claimed } = created[0].value;
	assert.equal(claimed, slug);
	assert.match(String(claims.find((claim) => claim.status === "rejected")?.reason), /already reserved/);
	assert.deepEqual(owner.sessions.value.map((row) => row.id), [id]);
	assert.equal((await owner.create({ cwd, id, slug }, TEST)).id, id);
	await assert.rejects(owner.create({ cwd, id, slug: "different" }, TEST), /already exists/);
	assert(!Object.hasOwn(await old.create({ cwd, id }, TEST), "slug"));

	await owner.archive({ id }, TEST);
	await assert.rejects(owner.create({ cwd, slug }, TEST), /already reserved/);
	assert.deepEqual(owner.sessions.value.map((row) => row.id), [id]);
	const loser = id === a ? b : a;
	assert.equal((await owner.create({ cwd, id: loser }, TEST)).id, loser);
});
