import { type AcpSessionAdapter, object } from "./runner.ts";

function modeOption(config: unknown) {
	if (!Array.isArray(config)) return;
	const modes = config.map(object).filter((option) => option?.category === "mode" || option?.id === "mode");
	const option = modes[0];
	if (modes.length === 1 && option?.type === "select" && typeof option.id === "string" && option.id) {
		return { id: option.id, currentValue: option.currentValue, options: option.options };
	}
}

// Compatibility probe only: no agent/edit mode, no automatic authentication or approval.
export function cursorAcpSession(mode: "ask" | "plan"): AcpSessionAdapter {
	if (mode !== "ask" && mode !== "plan") throw new Error("Cursor ACP compatibility supports only ask and plan mode.");
	return {
		// Documented Cursor blocking requests; never invent answers or accept a plan.
		cancelRequests: ["cursor/ask_question", "cursor/create_plan"],
		async prepareSession(sessionId, session, request) {
			const option = modeOption(session.configOptions);
			if (!option || !Array.isArray(option.options) || !option.options.some((value: unknown) => object(value)?.value === mode)) {
				throw new Error("Cursor ACP did not advertise the requested read-only mode.");
			}
			if (option.currentValue === mode) return;
			const updated = await request("session/set_config_option", { sessionId, configId: option.id, value: mode });
			const confirmed = modeOption(updated.configOptions);
			if (!confirmed || confirmed.id !== option.id || confirmed.currentValue !== mode) {
				throw new Error("Cursor ACP did not confirm the requested read-only mode.");
			}
		},
		checkUpdate(update) {
			if ((update.sessionUpdate === "config_option_update" && modeOption(update.configOptions)?.currentValue !== mode) ||
				(update.sessionUpdate === "current_mode_update" && update.currentModeId !== mode)) {
				throw new Error("Cursor ACP left the requested read-only mode; cancelled the run.");
			}
		},
	};
}
