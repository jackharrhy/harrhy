// The share store (`plugins/sharing/store.ts`, `Shares`' tables in the server's Chord store): one guest holds grants to
// several sessions, removal and link resets end one grant each, people and emails follow the grants.

import assert from "node:assert/strict";
import { test } from "node:test";
import { constant, openStore, sqliteBackend } from "@earendil-works/chord";
import { openNodeSqliteDatabase } from "@earendil-works/chord/sqlite/node";
import { BACKGROUND_CONTEXT as context, query } from "@p2/app/v1";
import { Shares } from "../../plugins/sharing/contract.ts";
import { normalizeEmail } from "../../plugins/sharing/server.ts";
import {
	emailGrantsOf,
	GrantRows,
	GuestRows,
	LinkRows,
	openEmails,
	peopleOf,
	ShareStore,
	sortedLinks,
} from "../../plugins/sharing/store.ts";
import { createHost, defineFacet } from "../../src/runtime/chord.ts";
import { HOST } from "../../src/runtime/principals.ts";

/** A `ShareStore` on an in-memory server store, with reads of its links, people and email grants. */
async function shareStore() {
	const store = await openStore(sqliteBackend(await openNodeSqliteDatabase(":memory:")), context);
	const host = createHost({ principal: HOST, store, onError: (error) => assert.fail(String(error)) });
	let found:
		| {
				db: ShareStore;
				read: () => Promise<{
					links: ReturnType<typeof sortedLinks>;
					people: ReturnType<typeof peopleOf>;
					emails: ReturnType<typeof emailGrantsOf>;
				}>;
		  }
		| undefined;
	const refused = () => Promise.reject(new Error("not in this test"));
	await host.load(
		[
			{
				name: "p2.shares-test",
				facet: defineFacet((h) =>
					h.serve(Shares, (_params, self) => {
						const links = self.table(LinkRows);
						const guests = self.table(GuestRows);
						const grants = self.table(GrantRows);
						const all = async <T>(items: AsyncIterable<T>) => {
							const list: T[] = [];
							for await (const item of items) list.push(item);
							return list;
						};
						found = {
							db: new ShareStore({ links, guests, grants, tx: (fn, inner) => self.tx(fn, inner) }),
							read: async () => {
								const guestRows = new Map(
									(await all(guests.rows(query(GuestRows), context))).map((row) => [row.id, row]),
								);
								const grantRows = await all(grants.rows(query(GrantRows), context));
								return {
									links: sortedLinks(await all(links.rows(query(LinkRows), context))),
									people: peopleOf(grantRows, guestRows),
									emails: emailGrantsOf(grantRows, guestRows),
								};
							},
						};
						return {
							links: constant([]),
							emails: constant([]),
							people: constant([]),
							authenticate: refused,
							authenticateEmail: refused,
							grant: refused,
							active: refused,
							isShared: refused,
							link: refused,
							share: refused,
							remove: refused,
							disableSession: refused,
							join: refused,
						};
					}),
				),
			},
		],
		context,
	);
	const ref = await host.get(Shares, {}, context);
	if (found === undefined) throw new Error("Shares did not activate");
	return {
		...found,
		close: async () => {
			ref.release();
			await host.close(context);
			await store.close(context);
		},
	};
}

test("a guest holds several sessions; removal and link resets end one grant each", async (t) => {
	const { db, read, close } = await shareStore();
	t.after(close);
	await db.link("s1", "view", false, context);
	await db.link("s2", "full", false, context);
	const [first, second] = (await read()).links;
	assert(first && second);

	const joined = await db.join(first, "Bob", undefined, context);
	assert(joined.cookie);
	const bob = await db.guestOfCookie(joined.cookie, context);
	assert(bob);
	assert.deepEqual(
		await db.join(second, "ignored", bob, context),
		{ guest: bob.id, changed: true },
		"the same browser gains s2",
	);
	assert.deepEqual((await db.grants(bob.id, context)).map(({ session, mode }) => [session, mode]).sort(), [
		["s1", "view"],
		["s2", "full"],
	]);
	assert.equal((await db.guest(bob.id, context))?.revision, 2);
	assert.deepEqual(await db.join(second, "ignored", await db.guest(bob.id, context), context), {
		guest: bob.id,
		changed: false,
	});

	const ann = await db.share("s1", "ann@example.com", "Ann@Example.com", "view", context);
	await db.share("s2", "ann@example.com", "Ann@Example.com", "full", context);
	assert.equal((await db.guestOfEmail("ann@example.com", context))?.id, ann.guest);
	assert.deepEqual(
		openEmails((await read()).emails, () => true),
		["ann@example.com"],
	);
	assert.deepEqual(
		openEmails((await read()).emails, (session) => session !== "s1" && session !== "s2"),
		[],
		"archived sessions report nobody",
	);
	assert.equal((await read()).people.length, 2);

	assert.equal(await db.remove("s1", ann.guest, context), true);
	assert.deepEqual(
		(await read()).people.map((person) => person.session),
		["s2"],
	);
	await db.share("s1", "ann@example.com", "Ann@Example.com", "view", context);
	assert.equal((await read()).people.length, 2, "sharing again gives a removed person access again");

	assert.deepEqual(await db.link("s1", "view", true, context), [bob.id]);
	assert.deepEqual(
		(await db.grants(bob.id, context)).map(({ session }) => session),
		["s2"],
		"a link reset ends only the grants made through it",
	);
	assert.equal(await db.linkByToken(first.token, context), undefined, "the old token ended");
});

test("disabling a session revokes all modes and people, preserves other grants, and rejects stale joins", async (t) => {
	const { db, read, close } = await shareStore();
	t.after(close);
	await db.link("private", "view", false, context);
	await db.link("private", "full", false, context);
	await db.link("other", "view", false, context);
	const links = (await read()).links;
	const view = links.find((link) => link.session === "private" && link.mode === "view");
	const full = links.find((link) => link.session === "private" && link.mode === "full");
	assert(view && full);
	const browser = await db.join(view, "Browser", undefined, context);
	const person = await db.share("private", "person@example.com", "Person", "full", context);
	await db.share("other", "person@example.com", "Person", "view", context);
	const revision = (await db.guest(person.guest, context))?.revision;
	assert.deepEqual((await db.disableSession("private", context)).sort(), [browser.guest, person.guest].sort());
	assert.deepEqual(
		(await read()).links,
		links.filter((link) => link.session === "other"),
	);
	assert.deepEqual(
		(await read()).people.map(({ session }) => session),
		["other"],
	);
	assert.deepEqual(await db.grants(browser.guest, context), []);
	assert.deepEqual(
		(await db.grants(person.guest, context)).map(({ session }) => session),
		["other"],
	);
	assert.equal((await db.guest(person.guest, context))?.revision, (revision ?? 0) + 1);
	for (const link of [view, full]) {
		assert.equal(await db.linkByToken(link.token, context), undefined);
		await assert.rejects(db.join(link, "Stale", undefined, context), /share has ended/);
		await assert.rejects(db.join(link, "Stale", await db.guest(browser.guest, context), context), /share has ended/);
	}
	assert.deepEqual(await db.disableSession("private", context), []);
});

test("guest names are made unique", async (t) => {
	const { db, read, close } = await shareStore();
	t.after(close);
	await db.link("s1", "view", false, context);
	const [link] = (await read()).links;
	assert(link);
	const names: string[] = [];
	for (let index = 0; index < 3; index++) {
		const joined = await db.join(link, " Alice ", undefined, context);
		names.push((await db.guest(joined.guest, context))?.name ?? "");
	}
	assert.deepEqual(names, ["Alice", "Alice (2)", "Alice (3)"]);
	await assert.rejects(db.join(link, "  ", undefined, context), /Choose a guest name/);
});

test("emails normalize as Radius normalizes them", () => {
	assert.equal(normalizeEmail(" Ann.Example@GoogleMail.com "), "annexample@gmail.com");
	assert.equal(normalizeEmail("Bob@Bücher.example"), "bob@xn--bcher-kva.example");
	assert.equal(normalizeEmail("not an address"), null);
});
