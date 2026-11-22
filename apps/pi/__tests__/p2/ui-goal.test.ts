// The Goal sheet and top-bar chip: start from the command menu, pause while a step runs, resume, and finish, on desktop and phone.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@p2/app/v1";
import { Chat } from "../../plugins/chat/contract.ts";
import { Sessions } from "../../plugins/sessions/contract.ts";
import { Browser, browserTests } from "./browser.ts";
import { holdIn, startFixture } from "./helpers.ts";

const setValue = (selector: string, value: string) =>
	`(() => { const e = document.querySelector(${JSON.stringify(selector)}); const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`;
const sheetText = `document.querySelector('[data-testid="goal-sheet"], .sheet')?.textContent ?? ''`;
const hasText = (text: string) => `(${sheetText}).includes(${JSON.stringify(text)})`;
const button = (label: string) =>
	`[...document.querySelectorAll('.sheet button')].find(b => b.textContent === ${JSON.stringify(label)} && !b.disabled)`;

test("Goal sheet starts, pauses and resumes a goal on desktop and phone", { skip: !browserTests }, async (t) => {
	const fixture = await startFixture({ web: true });
	t.after(() => fixture.close());
	const gate = Promise.withResolvers<void>();
	const admitted = Promise.withResolvers<void>();
	const provider = createServer(async (req, res) => {
		const chunks: Buffer[] = [];
		for await (const chunk of req) chunks.push(chunk);
		const body = JSON.parse(Buffer.concat(chunks).toString());
		const marker = /GOAL ([0-9a-f-]+):(\d+) CONTINUE:/.exec(JSON.stringify(body.messages.at(-1)));
		if (!marker) return void res.writeHead(400).end();
		const round = Number(marker[2]);
		if (round === 1) {
			admitted.resolve();
			await gate.promise;
		}
		const report = `GOAL ${marker[1]}:${round} ${round === 1 ? "CONTINUE: desktop checked" : "COMPLETE: phone checked"}`;
		res.writeHead(200, { "Content-Type": "text/event-stream" });
		for (const [delta, finish_reason] of [
			[{ content: report }, null],
			[{}, "stop"],
		])
			res.write(
				`data: ${JSON.stringify({ id: "goal", object: "chat.completion.chunk", created: 1, model: "m1", choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
			);
		res.end("data: [DONE]\n\n");
	});
	await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
	t.after(() => {
		gate.resolve();
		provider.closeAllConnections();
		provider.close();
	});
	const address = provider.address();
	assert.ok(address && typeof address !== "string");
	writeFileSync(
		join(fixture.dataDir, "models.json"),
		JSON.stringify({
			providers: {
				local: {
					baseUrl: `http://127.0.0.1:${address.port}/v1`,
					apiKey: "fixture",
					api: "openai-completions",
					models: [{ id: "m1", contextWindow: 8000, maxTokens: 100 }],
				},
			},
		}),
	);
	const owner = fixture.browser();
	const sessions = await holdIn(owner, Sessions, {}, "owner");
	const { id: session } = await sessions.create({ cwd: fixture.workspace }, BACKGROUND_CONTEXT);
	const chat = await holdIn(owner, Chat, { session, conversation: 1 }, "participant");
	await chat.configure({ model: { provider: "local", modelId: "m1" } }, BACKGROUND_CONTEXT);

	const browser = await Browser.start();
	t.after(() => browser.close());
	await browser.signIn(fixture.owner);
	await browser.metrics(1440, 1000);
	await browser.open(`http://127.0.0.1:${fixture.server.port}/s/${session}`);
	await browser.wait(`document.querySelector('.composer .draft-editor')`);
	await browser.evaluate(
		`(() => { const apple = /Mac|iPhone|iPad/.test(navigator.platform); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: apple, ctrlKey: !apple, bubbles: true, cancelable: true })); })()`,
	);
	const choice = `[...document.querySelectorAll('.command-menu [role=option]')].find(row => row.querySelector('.command-title')?.textContent === 'Goal')`;
	await browser.wait(choice);
	await browser.evaluate(`(${choice}).click()`);
	await browser.wait(hasText("No goal in this conversation"));
	assert.equal(await browser.evaluate(`!!document.querySelector('.goal-chip')`), false);

	await browser.evaluate(setValue('[data-testid="goal-sheet"] textarea', "Compare layouts"));
	await browser.evaluate(setValue('[data-testid="goal-sheet"] input[type=number]', "3"));
	await browser.wait(button("Start"));
	await browser.evaluate(`(${button("Start")}).click()`);
	await admitted.promise;
	await browser.wait(`${hasText("Running")} && ${hasText("Step 1 of 3")} && ${hasText("a step is running")}`);
	await browser.wait(`!!document.querySelector('.goal-chip')`);
	assert.equal(await browser.evaluate(`!!(${button("Start")}) || !!(${button("Replace goal")})`), false);

	await browser.evaluate(`(${button("Pause")}).click()`);
	await browser.wait(hasText("Paused"));
	gate.resolve();
	await browser.wait(`${hasText("desktop checked")} && !${hasText("a step is running")}`);

	await browser.metrics(390, 844);
	await browser.wait(`!!(${button("Resume")})`);
	assert.equal(
		await browser.evaluate(`(() => { const s = document.querySelector('[data-testid="goal-sheet"]'); return s.scrollWidth <= s.clientWidth; })()`),
		true,
	);
	await browser.evaluate(`(${button("Resume")}).click()`);
	await browser.wait(`${hasText("Reported complete")} && ${hasText("phone checked")} && ${hasText("Step 2 of 3")}`);
	assert.equal(await browser.evaluate(`!!(${button("Replace goal")}) === false`), true, "Replace needs an objective");
});
