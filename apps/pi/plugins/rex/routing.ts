// Project routing keeps live, uncertain and manually suppressed viewers at their existing exact Rex target.
import { arr, compile, str } from "@earendil-works/pi-schema";
import type { RexConfig, RexState } from "./config.ts";
import type { CatalogSession } from "./reconcile.ts";

export type RexRoute = { config: RexConfig; sessions: CatalogSession[] };

/** Builds target passes, preserving sticky ownership and reporting newly discovered relocation requirements. */
export function routes(
	config: RexConfig,
	state: RexState,
	sessions: readonly CatalogSession[],
	projects: Readonly<Record<string, string>>,
): { targets: RexRoute[]; notices: string[]; changed: boolean } {
	const targets = new Map<string, RexRoute>();
	const notices: string[] = [];
	let changed = false;
	const target = (sessionId: string) => {
		let route = targets.get(sessionId);
		if (!route) {
			route = { config: { ...config, sessionId }, sessions: [] };
			targets.set(sessionId, route);
		}
		return route;
	};
	for (const id of [config.sessionId, ...Object.values(config.projects ?? {})]) target(id);
	const owned = new Map<string, string>();
	for (const [key, mappings] of Object.entries(state.targets)) {
		// Persisted JSON keys are a trust boundary too: never infer ownership from malformed target keys.
		const parts: unknown = JSON.parse(key);
		if (!targetKey.check(parts) || !/^session:[0-9a-f-]{36}$/.test(parts[2]!))
			throw new Error("Invalid Rex state target key");
		if (parts[0] !== config.endpoint || parts[1] !== config.hostId) continue;
		for (const [id, mapping] of Object.entries(mappings)) {
			if (mapping.phase === "archived") continue;
			target(parts[2]!);
			if (owned.has(id)) throw new Error(`Multiple Rex mappings own p2 session ${id}`);
			owned.set(id, parts[2]!);
		}
	}
	for (const session of sessions) {
		const project = projects[session.id] ?? "";
		// Project names are owner-configured keys, including names inherited by ordinary JSON objects.
		const wanted =
			config.projects && Object.hasOwn(config.projects, project) ? config.projects[project]! : config.sessionId;
		const existing = owned.get(session.id);
		const selected = existing ?? wanted;
		if (existing) {
			const mapping = state.targets[JSON.stringify([config.endpoint, config.hostId, existing])]![session.id]!;
			if (mapping.phase === "relocating" && mapping.destination !== wanted)
				throw new Error(`Rex relocation destination no longer matches project routing for ${session.id}`);
			if (mapping.phase !== "relocating" && session.archivedAt === null && existing !== wanted) {
				if (mapping.relocationNeeded !== wanted) {
					notices.push(`Rex viewer ${session.id} needs explicit relocation from ${existing} to ${wanted}`);
					mapping.relocationNeeded = wanted;
					changed = true;
				}
			} else if (mapping.relocationNeeded !== undefined) {
				delete mapping.relocationNeeded;
				changed = true;
			}
		}
		target(selected).sessions.push(session);
	}
	return { targets: [...targets.values()], notices, changed };
}

const targetKey = compile(arr(str(), { minItems: 3, maxItems: 3 }));
