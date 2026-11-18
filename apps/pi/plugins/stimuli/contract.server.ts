// Trusted source declarations and revision-bound publication capabilities for server adapters.
import { compile, type Schema, type Static } from "@earendil-works/pi-schema";
import { type Ctx, keyedRegistry, type Ref } from "@p2/app/v1";
import { StimulusJsonSchema, type SubscriptionSchema, type WakeStore } from "./contract.ts";

export type StimulusSource<C, E> = {
	readonly id: string;
	readonly version: number;
	readonly label: string;
	readonly configSchema: Schema<C>;
	readonly eventSchema: Schema<E>;
	readonly render: (event: E, config: C) => string;
};
export type SourceDeclaration = {
	readonly id: string;
	readonly version: number;
	readonly label: string;
	validateConfig(value: unknown): void;
	render(event: unknown, config: unknown): string;
};

/** Installed server plugins contribute declarations; no remote caller can register a source. */
export const StimulusSources = keyedRegistry<SourceDeclaration>("p2.stimulus-sources");

/** Validates source-specific input at the adapter boundary and preserves typed authoring. */
export function defineStimulusSource<C, E>(definition: StimulusSource<C, E>): StimulusSource<C, E> & SourceDeclaration {
	const config = compile(definition.configSchema);
	const event = compile(definition.eventSchema);
	return {
		...definition,
		validateConfig(value) {
			if (!config.check(value)) throw new Error("Invalid stimulus configuration");
		},
		render(value: unknown, configuration: unknown) {
			if (!event.check(value)) throw new Error("Invalid stimulus event");
			if (!config.check(configuration)) throw new Error("Invalid stimulus configuration");
			return definition.render(value, configuration);
		},
	};
}

/** Registry identity includes the declaration version without delimiter ambiguity. */
export function sourceKey(source: { id: string; version: number }): string {
	return JSON.stringify([source.id, source.version]);
}

/** A trusted adapter receives no target selector and cannot move to a newer subscription revision. */
export function bindStimulusPublisher<C, E>(
	store: Ref<typeof WakeStore>,
	source: StimulusSource<C, E>,
	subscription: Static<typeof SubscriptionSchema>,
) {
	if (source.id !== subscription.source.id || source.version !== subscription.source.version)
		throw new Error("Source binding mismatch");
	const binding = { source: subscription.source, subscriptionId: subscription.id, revision: subscription.revision };
	const json = compile(StimulusJsonSchema);
	return {
		publish: ({ eventId, event }: { eventId: string; event: E }, ctx: Ctx) => {
			// Adapter values cross into the JSON contract here; schemas may otherwise describe non-JSON values.
			if (!json.check(event)) throw new Error("Stimulus event must be JSON");
			return store.publish({ ...binding, eventId, event }, ctx);
		},
		receipt: ({ eventId }: { eventId: string }, ctx: Ctx) => store.receipt({ ...binding, eventId }, ctx),
	};
}
