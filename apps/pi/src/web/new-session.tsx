// Pi Mobile's app-level new-session choices, retained when another conversation opens: one store per page, so a
// command run outside React (the command menu's New session) starts a fresh one too.
import { useSyncExternalStore } from "react";
import { openNewSession } from "../runtime/web.tsx";
import type { ModelChoice } from "./model-choice.ts";
import type { Layer } from "./navigation.ts";

/** Where a new session starts: an environment (null for this device) and a directory on it. */
export type NewSessionLocation = { env: string | null; cwd: string };

type Choices = {
	readonly location: NewSessionLocation | undefined;
	readonly choice: ModelChoice | undefined;
};

type State = Choices & {
	setLocation: (location: NewSessionLocation) => void;
	setChoice: (choice: ModelChoice | undefined) => void;
};

let choices: Choices = { location: undefined, choice: undefined };
const listeners = new Set<() => void>();

function change(next: Partial<Choices>): void {
	choices = { ...choices, ...next };
	for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

const ACTIONS = {
	setLocation: (location: NewSessionLocation) => change({ location }),
	setChoice: (choice: ModelChoice | undefined) => change({ choice }),
};

/** The new-session screen's choices (location, model) and their setters. */
export function useNewSessionState(): State {
	const current = useSyncExternalStore(subscribe, () => choices);
	return { ...current, ...ACTIONS };
}

/**
 * Opens the new-session screen ready to type, as the sidebar's New session: the default model again, at `location`
 * when given, the composer focused; with `layer`,
 * that layer opens over it instead (the directory picker) and keeps the focus.
 */
export function startNewSession(start: { location?: NewSessionLocation; layer?: Layer } = {}): void {
	change({ choice: undefined, ...(start.location ? { location: start.location } : {}) });
	openNewSession(start.layer ? [start.layer] : []);
	if (!start.layer) setTimeout(() => document.querySelector<HTMLElement>(".composer .draft-editor")?.focus(), 50);
}
