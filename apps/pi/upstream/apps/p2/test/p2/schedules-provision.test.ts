// Subscription-first provisioning recovers exact intent but revalidates current target eligibility.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { it } from "node:test";
import { BACKGROUND_CONTEXT } from "@p2/app/v1";
import { Schedules } from "../../plugins/schedules/contract.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { Sharing } from "../../plugins/sharing/contract.ts";
import { WakeStore } from "../../plugins/stimuli/contract.ts";
import { holdIn, startFixture } from "./helpers.ts";

const TEST = BACKGROUND_CONTEXT;
it("reuses an orphan provisioning subscription once and refuses one whose target became shared", async () => {
	const fixture = await startFixture();
	try {
		const sessions = await holdIn(fixture.browser(), Sessions, {}, "owner");
		const session = (await sessions.create({ cwd: fixture.workspace }, TEST)).id;
		const schedules = await holdIn(fixture.browser(), Schedules, {}, "owner");
		const definition = {
			id: "orphan",
			title: "Provision recovery",
			cron: "0 8 * * *",
			timezone: "America/St_Johns",
			text: "Synthetic provisioning boundary",
		};
		const target = { session, conversation: 1 };
		const subscriptionId = (id: string) =>
			`schedule:${JSON.stringify([
				id,
				1,
				createHash("sha256")
					.update(
						JSON.stringify([definition.title, definition.cron, definition.timezone, definition.text, session, 1]),
					)
					.digest("hex"),
			])}`;
		const orphan = await fixture.server.host.root(
			async (ctx) =>
				(await ctx.get(WakeStore, {})).createSubscription(
					{
						id: subscriptionId(definition.id),
						source: { id: "p2.recurring-prompt", version: 1 },
						target,
						config: { text: definition.text, title: definition.title, id: definition.id },
					},
					ctx,
				),
			TEST,
		);
		const row = await schedules.createTarget({ definition, target }, TEST);
		assert.equal(row.subscription.id, orphan.id);
		assert.equal(row.subscription.revision, 1);
		const blocked = { ...definition, id: "shared-orphan" };
		await fixture.server.host.root(
			async (ctx) =>
				(await ctx.get(WakeStore, {})).createSubscription(
					{
						id: subscriptionId(blocked.id),
						source: { id: "p2.recurring-prompt", version: 1 },
						target,
						config: { id: blocked.id, title: blocked.title, text: blocked.text },
					},
					ctx,
				),
			TEST,
		);
		const sharing = await holdIn(fixture.browser(), Sharing, { session }, "owner");
		await sharing.link({ mode: "view" }, TEST);
		await assert.rejects(schedules.createTarget({ definition: blocked, target }, TEST));
		assert.equal((await schedules.list({}, TEST)).length, 1);
		sharing.release();
		schedules.release();
		sessions.release();
	} finally {
		await fixture.close();
	}
});
