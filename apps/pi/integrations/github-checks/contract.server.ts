// The `github.checks` stimulus source: its config and event shapes (contract.ts) and how an event reads to the agent.
import { defineStimulusSource } from "@p2/app/v1/server";
import { ConfigSchema, EventSchema, renderResult, SOURCE_ID, SOURCE_VERSION } from "./contract.ts";

export const GithubChecks = defineStimulusSource({
	id: SOURCE_ID,
	version: SOURCE_VERSION,
	label: "GitHub checks",
	configSchema: ConfigSchema,
	eventSchema: EventSchema,
	render(event, config) {
		if (event.repo !== config.repo) throw new Error("GitHub repository mismatch");
		return renderResult(event);
	},
});
