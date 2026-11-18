// The built-in recurring-prompt adapter uses the same trusted source seam as external integrations.
import { int, obj, str, union } from "@earendil-works/pi-schema";
import { literal } from "@p2/app/v1";
import { defineStimulusSource } from "../stimuli/contract.server.ts";

export const ScheduleSource = defineStimulusSource({
	id: "p2.recurring-prompt",
	version: 1,
	label: "Recurring prompt",
	configSchema: obj({ id: str(), title: str(), text: str({ minLength: 1, maxLength: 30000 }) }),
	eventSchema: obj({ at: int(), kind: union([literal("scheduled"), literal("manual")]) }),
	render: (event, config) =>
		`${config.title}\n${event.kind === "manual" ? "Manual run" : "Scheduled occurrence"}: ${new Date(event.at).toISOString()}\n\n${config.text}`,
});
