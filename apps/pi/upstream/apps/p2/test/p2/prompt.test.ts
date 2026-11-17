// Prompt resources: the app guide, global and project AGENTS.md and skills reach the model, and edits apply live.

import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import type { ConversationView } from "@earendil-works/pi-durable";
import { BACKGROUND_CONTEXT } from "@p2/app/v1";
import { Chat } from "../../plugins/chat/contract.ts";
import { PromptResources } from "../../plugins/prompt/contract.ts";
import { SessionLock, Sessions } from "../../plugins/sessions/contract.ts";
import { Subagents } from "../../plugins/subagents/contract.ts";
import type { RefIn } from "../../src/runtime/chord.ts";
import { type Fixture, holdIn, startFixture, until } from "./helpers.ts";

/** The system sections in effect: the latest value of each, replayed from `pi.system` entries. */
function sections(view: ConversationView | null | undefined): Record<string, string> {
	const result: Record<string, string> = {};
	for (const entry of view?.entries ?? []) {
		for (const message of entry.model ?? []) {
			if (message.role !== "system" || !("sections" in message)) continue;
			for (const [key, value] of Object.entries(
				(message as { sections?: Record<string, string | null> }).sections ?? {},
			)) {
				if (value === null) delete result[key];
				else result[key] = value;
			}
		}
	}
	return result;
}

describe("prompt resources (fake provider)", () => {
	let fixture: Fixture;
	let chat: RefIn<typeof Chat, "participant">;
	let session: string;

	before(async () => {
		fixture = await startFixture();
		await mkdir(fixture.dataDir, { recursive: true });
		await writeFile(join(fixture.dataDir, "AGENTS.md"), "Global rule: be brief.");
		await writeFile(join(fixture.workspace, "AGENTS.md"), "Project rule: use tabs.");
		await mkdir(join(fixture.dataDir, "skills", "deploy"), { recursive: true });
		await writeFile(
			join(fixture.dataDir, "skills", "deploy", "SKILL.md"),
			"---\nname: deploy\ndescription: Deploys the app.\n---\nRun the deploy script.",
		);
		await mkdir(join(fixture.workspace, ".git"));
		await mkdir(join(fixture.workspace, ".agents", "skills", "project-guide"), { recursive: true });
		await writeFile(
			join(fixture.workspace, ".agents", "skills", "project-guide", "SKILL.md"),
			"---\nname: project-guide\ndescription: Project-specific guidance.\n---\nFollow the project guide.",
		);
		const cwd = join(fixture.workspace, "packages", "nested");
		await mkdir(cwd, { recursive: true });
		const owner = fixture.browser();
		session = (await (await holdIn(owner, Sessions, {}, "owner")).create({ cwd }, BACKGROUND_CONTEXT)).id;
		chat = await holdIn(owner, Chat, { session, conversation: 1 }, "participant");
	});

	after(async () => {
		await fixture?.close();
	});

	it("puts the app guide, instructions and skills into the system prompt", async () => {
		await chat.send({ text: "hello", requestId: "1" }, BACKGROUND_CONTEXT);
		const view = await until(chat.view, (value) => Boolean(sections(value)["agents-md"]));
		const prompt = sections(view);
		assert.match(prompt.app ?? "", /running inside Pi \(p2/);
		assert.match(prompt.app ?? "", new RegExp(fixture.dataDir.replaceAll("/", "\\/")));
		assert.match(prompt["agents-md"] ?? "", /Global rule: be brief\.[\s\S]*Project rule: use tabs\./);
		assert.match(prompt.skills ?? "", /<name>deploy<\/name><description>Deploys the app\.<\/description>/);
		assert.match(prompt.preamble ?? "", /coding assistant/);
		assert.match(prompt.coordination ?? "", /clear assignment, one owner and an expected deliverable/);
		assert.match(prompt.coordination ?? "", /persistent subagent's completed turn auto-reports/);
		assert.match(prompt.coordination ?? "", /peer sessions must explicitly send one requested substantive result/);
		assert.match(prompt.coordination ?? "", /Steering input does not cancel an active tool call/);
	});

	it(
		"publishes ancestor .agents skill metadata edits, additions and deletions through the native resource",
		{ timeout: 30_000 },
		async () => {
			const resources = await holdIn(
				fixture.browser(),
				PromptResources,
				{ session, conversation: 1 },
				"participant",
			);
			try {
				const initial = await until(resources.skills, (skills) =>
					Boolean(skills?.some((skill) => skill.name === "project-guide")),
				);
				assert.deepEqual(
					initial?.find((skill) => skill.name === "project-guide"),
					{
						name: "project-guide",
						description: "Project-specific guidance.",
					},
				);
				const directory = join(fixture.workspace, ".agents", "skills", "live-guide");
				await mkdir(directory);
				const path = join(directory, "SKILL.md");
				await writeFile(path, "---\nname: live-guide\ndescription: Newly added guidance.\n---\nInitial body.");
				await until(resources.skills, (skills) =>
					Boolean(
						skills?.some((skill) => skill.name === "live-guide" && skill.description === "Newly added guidance."),
					),
				);
				await writeFile(path, "---\nname: live-guide\ndescription: Edited guidance.\n---\nEdited body.");
				await until(resources.skills, (skills) =>
					Boolean(
						skills?.some((skill) => skill.name === "live-guide" && skill.description === "Edited guidance."),
					),
				);
				const expanded = await resources.expand({ text: "/skill:live-guide" }, BACKGROUND_CONTEXT);
				assert.deepEqual(expanded.skill, { name: "live-guide" });
				assert.match(expanded.text, /Edited body\./);
				await rm(directory, { recursive: true });
				await until(
					resources.skills,
					(skills) =>
						Boolean(skills?.some((skill) => skill.name === "project-guide")) &&
						!skills?.some((skill) => skill.name === "live-guide"),
				);
				assert.deepEqual(await resources.expand({ text: "/skill:live-guide" }, BACKGROUND_CONTEXT), {
					text: "/skill:live-guide",
				});
			} finally {
				resources.release();
			}
		},
	);

	it("applies edits without restarting the worker", async () => {
		await writeFile(join(fixture.workspace, "AGENTS.md"), "Project rule: use spaces.");
		// The watch reloads; the next generation renders the new text.
		await new Promise((resolve) => setTimeout(resolve, 500));
		await chat.send({ text: "again", requestId: "2" }, BACKGROUND_CONTEXT);
		await until(chat.view, (value) => /use spaces/.test(sections(value)["agents-md"] ?? ""));
	});

	it("captures shared coordination guidance after reload and in tool-restricted subagents", async () => {
		await fixture.server.reload(["conversations"]);
		await chat.send({ text: "subagent", requestId: "coordination-child" }, BACKGROUND_CONTEXT);
		const children = await holdIn(fixture.browser(), Subagents, {}, "reader");
		const list = await until(children.children, (value) => Boolean(value?.[session]?.length));
		const child = await holdIn(
			fixture.browser(),
			Chat,
			{ session, conversation: list![session]![0]!.conversationId },
			"participant",
		);
		const view = await until(child.view, (value) => Boolean(sections(value).coordination));
		const guidance = sections(view).coordination!;
		assert.match(guidance, /Keep ordinary progress silent/);
		assert.match(guidance, /explicitly withdraw or replace the old question in prose/);
		assert.match(guidance, /current task and latest result/);
		assert.match(guidance, /Do not separately resend an automatically reported result/);
		assert.equal(sections(view)["conversation-messaging"], undefined, "peer tools remain top-level only");
		const parent = await until(chat.view, (value) => Boolean(sections(value).coordination));
		assert.equal(sections(parent).coordination, guidance);
		child.release();
		children.release();
	});

	it("leaves the owner's global instructions and skills out of a locked session that did not pick them", async () => {
		const locks = await holdIn(fixture.browser(), SessionLock, {}, "owner");
		await locks.set(
			{ session, lock: { mcp: [], projectMcp: false, instructions: false, capabilities: [] } },
			BACKGROUND_CONTEXT,
		);
		await new Promise((resolve) => setTimeout(resolve, 500));
		await chat.send({ text: "locked", requestId: "3" }, BACKGROUND_CONTEXT);
		const view = await until(chat.view, (value) => !/Global rule/.test(sections(value)["agents-md"] ?? "x"));
		const prompt = sections(view);
		assert.match(prompt["agents-md"] ?? "", /Project rule/);
		assert.doesNotMatch(prompt.skills ?? "", /deploy/);
		assert.match(
			prompt.skills ?? "",
			/<name>project-guide<\/name><description>Project-specific guidance\.<\/description>/,
		);
		await locks.set({ session, lock: null }, BACKGROUND_CONTEXT);
	});
});
