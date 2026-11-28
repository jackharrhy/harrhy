import { type AcpSessionAdapter, object } from "./runner.ts";

function selectOption(config: unknown, category: "mode" | "model") {
	if (!Array.isArray(config)) return;
	const matches = config.map(object).filter((option) => option?.category === category || option?.id === category);
	const option = matches[0];
	if (matches.length !== 1 || option?.type !== "select" || typeof option.id !== "string" || !option.id) return;
	const values = Array.isArray(option.options) ? option.options.flatMap((entry) => {
		const group = object(entry)?.options;
		return Array.isArray(group) ? group : [entry];
	}).map((entry) => object(entry)?.value).filter((value): value is string => typeof value === "string") : [];
	return { id: option.id, currentValue: option.currentValue, values };
}

// No agent/edit mode, automatic authentication or permission approval.
export function cursorAcpSession(mode: "ask" | "plan", model?: string): AcpSessionAdapter {
	if (mode !== "ask" && mode !== "plan") throw new Error("Cursor ACP compatibility supports only ask and plan mode.");
	return {
		// Documented Cursor blocking requests; never invent answers or accept a plan.
		cancelRequests: ["cursor/ask_question", "cursor/create_plan"],
		async prepareSession(sessionId, session, request) {
			const option = selectOption(session.configOptions, "mode");
			if (!option?.values.includes(mode)) throw new Error("Cursor ACP did not advertise the requested read-only mode.");
			let config = session.configOptions;
			if (option.currentValue !== mode) {
				config = (await request("session/set_config_option", { sessionId, configId: option.id, value: mode })).configOptions;
				const confirmed = selectOption(config, "mode");
				if (confirmed?.id !== option.id || confirmed.currentValue !== mode)
					throw new Error("Cursor ACP did not confirm the requested read-only mode.");
			}
			if (model === undefined) return;
			const models = selectOption(config, "model");
			const variants = models?.values.filter((value) => value.startsWith(`${model}[`)) ?? [];
			const chosen = models?.values.includes(model) ? model : variants.length === 1 ? variants[0] : undefined;
			if (!models || chosen === undefined) throw new Error("Cursor ACP did not advertise an unambiguous match for the requested model.");
			if (models.currentValue === chosen) return;
			const updated = await request("session/set_config_option", { sessionId, configId: models.id, value: chosen });
			if (selectOption(updated.configOptions, "model")?.currentValue !== chosen || selectOption(updated.configOptions, "mode")?.currentValue !== mode)
				throw new Error("Cursor ACP did not confirm the requested model and read-only mode.");
		},
		checkUpdate(update) {
			if ((update.sessionUpdate === "config_option_update" && selectOption(update.configOptions, "mode")?.currentValue !== mode) ||
				(update.sessionUpdate === "current_mode_update" && update.currentModeId !== mode)) {
				throw new Error("Cursor ACP left the requested read-only mode; cancelled the run.");
			}
		},
	};
}
