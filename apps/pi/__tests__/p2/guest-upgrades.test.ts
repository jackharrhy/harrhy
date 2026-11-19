import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { it } from "node:test";
import { GuestUpgrades } from "../../src/hosts/guest-upgrades.ts";

it("invalidates an in-flight guest upgrade without blocking fresh authentication", async () => {
	const upgrades = new GuestUpgrades();
	const finish = Promise.withResolvers<void>();
	const pending = async () => {
		const current = upgrades.begin();
		await finish.promise;
		return upgrades.track("guest", new PassThrough(), current);
	};
	const active = new PassThrough();
	const unrelated = new PassThrough();
	assert.equal(upgrades.track("guest", active, upgrades.begin()), true);
	assert.equal(upgrades.track("other", unrelated, upgrades.begin()), true);
	const first = pending();
	upgrades.revoke("guest");
	assert.equal(active.destroyed, true);
	assert.equal(unrelated.destroyed, false);
	const second = pending();
	finish.resolve();
	assert.equal(await first, false);
	assert.equal(await second, true);
});
