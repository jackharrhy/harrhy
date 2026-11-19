// The preview list is an on-demand server read, never a session or worktree inventory.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { BACKGROUND_CONTEXT, whenLive } from "@p2/app/v1";
import { Previews } from "../../plugins/repositories/contract.ts";
import { expectChord, holdIn, startFixture } from "./helpers.ts";

test("only owners can read registered preview URLs; failed refresh retains the last successful list", async (t) => {
	const fixture = await startFixture();
	t.after(() => fixture.close());
	const config = join(fixture.dataDir, "work-context.json");
	writeFileSync(config, JSON.stringify({ previews: [{ id: "one", name: "Review", url: "https://one.example/" }] }));
	const owner = await holdIn(fixture.browser(), Previews, {}, "owner");
	const first = await owner.list({ refresh: false }, BACKGROUND_CONTEXT);
	assert.deepEqual(first.items, [
		{
			id: "declared:one",
			name: "Review",
			url: "https://one.example/",
			lease: { kind: "unknown" },
			access: "Access not specified",
		},
	]);
	writeFileSync(config, "{invalid");
	assert.deepEqual(await owner.list({ refresh: false }, BACKGROUND_CONTEXT), first);
	const failed = await owner.list({ refresh: true }, BACKGROUND_CONTEXT);
	assert.deepEqual(failed.items, first.items);
	assert.equal(failed.checked, first.checked);
	assert.match(failed.failures.join(), /Invalid work-context/);
	writeFileSync(config, "{}");
	assert.deepEqual((await owner.list({ refresh: true }, BACKGROUND_CONTEXT)).items, []);
	for (const access of ["view", "full"] as const) {
		const guest = fixture.as({
			kind: "guest",
			id: `guest-${access}`,
			name: "Guest",
			home: "fixture",
			sessions: { fixture: access },
			revision: 1,
		});
		const ref = guest.hold(Previews, {}, BACKGROUND_CONTEXT);
		await expectChord(whenLive(ref), "forbidden");
		ref.release();
	}
	owner.release();
});
