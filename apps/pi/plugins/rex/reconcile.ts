// Serial reconciliation uses private exact IDs and launch receipts, never visible titles as ownership evidence.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { RexBlock, RexCli } from "./cli.ts";
import type { Mapping, RexConfig, RexState } from "./config.ts";
import { readReceipt, receiptPath } from "./receipt.ts";

export type CatalogSession = { id: string; archivedAt: number | null; title?: string };
export type RexAdapter = Pick<RexCli, "identity" | "view" | "create" | "close" | "rename" | "renameWindow">;

/** Reconciles one bounded pass, adopting uncertain creates only through a matching private launch receipt. */
export async function reconcile(
	client: RexAdapter,
	config: RexConfig,
	state: RexState,
	sessions: readonly CatalogSession[],
	launch: { app: string; dataDir: string; url: string },
	save: () => Promise<void>,
	active: () => void,
	budget = { remaining: 1 },
): Promise<boolean> {
	const identity = await client.identity();
	if (identity.hostId !== config.hostId) throw new Error("Rex identity differs from rex.json");
	const view = await client.view(config.sessionId);
	if (!view) throw new Error("Configured Rex session is missing; refusing to create a replacement");
	const blocks = view.blocks;
	const key = JSON.stringify([config.endpoint, config.hostId, config.sessionId]);
	state.targets[key] ??= {};
	const mappings = state.targets[key];
	let created = false;
	const pendingAtStart = new Set(
		Object.entries(mappings)
			.filter(([, mapping]) => mapping.phase === "pending")
			.map(([id]) => id),
	);
	const current = new Set(sessions.map((session) => session.id));
	for (const [id, mapping] of Object.entries(mappings)) if (!current.has(id)) await archive(mapping);
	for (const session of sessions) {
		active();
		let mapping = mappings[session.id];
		if (mapping?.phase === "relocating") {
			if (!mapping.destination || !mapping.blockId)
				throw new Error("Rex relocation requires an explicit destination and an acknowledged block");
			if (!(await client.view(mapping.destination))) throw new Error("Rex relocation destination is missing");
			await archive(mapping);
			continue;
		}
		if (session.archivedAt !== null) {
			if (mapping) await archive(mapping);
			continue;
		}
		if (!mapping) {
			if (budget.remaining === 0) continue;
			mapping = mappings[session.id] = { nonce: randomUUID(), phase: "pending" };
			await save();
		}
		const block = await ownedBlock(mapping);
		const title = Array.from(session.title || "p2", (character) =>
			character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? " " : character,
		)
			.join("")
			.slice(0, 128);
		if (block) {
			if (mapping.label !== undefined) {
				// Persist the verified exact-ID migration before either visible rename can partially succeed.
				delete mapping.label;
				await save();
			}
			active();
			if (block.label !== title) await client.rename(config.sessionId, block.blockId, title);
			if (
				mapping.windowId === block.windowId &&
				blocks.filter((candidate) => candidate.windowId === block.windowId).length === 1 &&
				block.windowLabel !== title
			) {
				active();
				await client.renameWindow(config.sessionId, block.windowId, title);
			}
			if (mapping.phase !== "open" || mapping.blockId !== block.blockId || mapping.label !== undefined) {
				mapping.blockId = block.blockId;
				mapping.windowId ??= block.windowId;
				mapping.phase = "open";
				delete mapping.label;
				await save();
			}
			continue;
		}
		if (mapping.phase === "open") {
			mapping.phase = "suppressed";
			await save();
		}
		if (mapping.phase === "suppressed" || budget.remaining === 0 || pendingAtStart.has(session.id)) continue;
		// Each deliberate archive/restore gets a new intent; stale receipts cannot claim the replacement.
		if (mapping.phase === "archived") mapping.nonce = randomUUID();
		mapping.phase = "pending";
		await save();
		created = true;
		budget.remaining--;
		active();
		// Only fresh/restored mappings reach dispatch; both assigned a nonce before their intent was saved.
		const opened = await client.create({
			sessionId: config.sessionId,
			label: title,
			cwd: launch.app,
			command: [
				"/usr/bin/env",
				"-u",
				"P2_TUI_OWNER_LINK",
				`P2_DATA_DIR=${launch.dataDir}`,
				process.execPath,
				"--import",
				join(launch.app, "src/source.ts"),
				join(launch.app, "plugins/rex/launch.ts"),
				receiptPath(launch.dataDir, mapping.nonce!),
				mapping.nonce!,
				config.hostId,
				config.endpoint,
				config.sessionId,
				launch.url,
				session.id,
			],
		});
		mapping.blockId = opened.blockId;
		mapping.windowId = opened.windowId;
		mapping.phase = "open";
		delete mapping.label;
		await save();
	}
	return created;

	async function ownedBlock(mapping: Mapping): Promise<RexBlock | undefined> {
		if (mapping.blockId) {
			const block = blocks.find((candidate) => candidate.blockId === mapping.blockId);
			// The initial migration keeps exact IDs and verifies the old marker before removing it once.
			return block && (mapping.label === undefined || block.label.endsWith(mapping.label)) ? block : undefined;
		}
		if (mapping.phase !== "pending" || !mapping.nonce) return undefined;
		const receipt = await readReceipt(receiptPath(launch.dataDir, mapping.nonce));
		if (!receipt) return undefined;
		if (
			receipt.nonce !== mapping.nonce ||
			receipt.hostId !== config.hostId ||
			receipt.endpoint !== config.endpoint ||
			receipt.sessionId !== config.sessionId
		)
			throw new Error("Rex launch receipt does not match the pending target");
		if (Object.values(mappings).some((other) => other !== mapping && other.blockId === receipt.blockId))
			throw new Error("Rex launch receipt claims an already managed block");
		return blocks.find((candidate) => candidate.blockId === receipt.blockId);
	}

	async function archive(mapping: Mapping): Promise<void> {
		const block = await ownedBlock(mapping);
		active();
		if (block) await client.close(config.sessionId, block.blockId);
		if (mapping.phase !== "archived") {
			mapping.phase = "archived";
			delete mapping.blockId;
			delete mapping.windowId;
			delete mapping.label;
			delete mapping.relocationNeeded;
			delete mapping.destination;
			await save();
		}
	}
}
