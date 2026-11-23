// The `cursor.run` stimulus source: its config and event shapes (contract.ts) and how an event reads to the agent.
import { defineStimulusSource } from "@p2/app/v1/server";
import { EventSchema, SOURCE_ID, SOURCE_VERSION, WatchSchema } from "./contract.ts";
import { renderEvent } from "./render.ts";

export const CursorRun = defineStimulusSource({
	id: SOURCE_ID,
	version: SOURCE_VERSION,
	label: "Cursor",
	configSchema: WatchSchema,
	eventSchema: EventSchema,
	render(event, config) {
		if (event.runId !== config.runId) throw new Error("Cursor run mismatch");
		return renderEvent(event);
	},
});
