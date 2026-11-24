// Model names: the live list the SDK reports for the key is the truth. A name that is not in it is refused with the
// closest matches, except a CLI-style name (`claude-opus-5-thinking-high`) that maps safely to one id plus parameters.
import type { ModelInfo } from "./client.ts";

export type ModelParam = { id: string; value: string };
export type Resolved = { id: string; params: ModelParam[] };

const MAX_PARAMS = 8;

/** `effort=low|high; fast=false|true` for a model's parameters. */
export const paramsText = (model: ModelInfo) => model.params.map((param) => `${param.id}=${param.values.join("|")}`).join("; ");

const tokens = (name: string) => name.toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean);

/** The models nearest to `name`: shared words first, then a shared start. */
export function closest(name: string, models: readonly ModelInfo[], count = 5): ModelInfo[] {
	const wanted = new Set(tokens(name));
	const lower = name.toLowerCase();
	const score = (model: ModelInfo) => {
		const own = tokens(model.id);
		let prefix = 0;
		while (prefix < lower.length && prefix < model.id.length && lower[prefix] === model.id[prefix]) prefix++;
		return own.filter((word) => wanted.has(word)).length * 10 + prefix / 10 - own.length / 100;
	};
	return models
		.map((model) => ({ model, score: score(model) }))
		.sort((a, b) => b.score - a.score)
		.slice(0, count)
		.map((entry) => entry.model);
}

function unknown(name: string, models: readonly ModelInfo[], why?: string): Error {
	const near = closest(name, models).map((model) => model.id);
	const ids = models.slice(0, 20).map((model) => model.id);
	return new Error(
		`${why ?? `“${name.slice(0, 80)}” is not a model in the live list for this key.`} Closest: ${near.join(", ")}. Allowed ids (${ids.length} of ${models.length}): ${ids.join(", ")}. Call \`cursor_models\` for the full list with each model's parameters; pass those as \`modelParams\` (for example {"effort":"high"}), not in the name.`,
	);
}

/** The value `word` names for `model`: `thinking` is thinking=true, `fast` is fast=true, else a value of one parameter. */
function paramFor(model: ModelInfo, word: string): ModelParam | undefined {
	if (word === "thinking" || word === "fast") {
		const param = model.params.find((entry) => entry.id === word);
		return param?.values.includes("true") ? { id: word, value: "true" } : undefined;
	}
	const hits = model.params.filter((entry) => entry.id !== "thinking" && entry.id !== "fast" && entry.values.includes(word));
	return hits.length === 1 ? { id: hits[0]!.id, value: word } : undefined;
}

/**
 * The model and parameters for a name and explicit parameters, or an Error saying what is allowed.
 * A name is an id or one alias no other model has. Otherwise the longest id that starts the name (at a dash) is used and
 * the rest must be words that each name one parameter value of that model (`thinking`, `fast`, `high`, `1m`, `extra-high`).
 */
export function resolveModel(name: string, explicit: Record<string, string> | undefined, models: readonly ModelInfo[]): Resolved {
	const lower = name.toLowerCase();
	let model = models.find((entry) => entry.id.toLowerCase() === lower);
	let params: ModelParam[] = [];
	if (model === undefined) {
		const byAlias = models.filter((entry) => entry.aliases.some((alias) => alias.toLowerCase() === lower));
		if (byAlias.length === 1) model = byAlias[0];
	}
	if (model === undefined) {
		const words = lower.split("-");
		for (let take = words.length - 1; take >= 1 && model === undefined; take--) {
			const prefix = words.slice(0, take).join("-");
			const candidate = models.find((entry) => entry.id.toLowerCase() === prefix);
			if (candidate === undefined) continue;
			// The rest, longest word group first (`extra-high`).
			const rest = words.slice(take);
			const found: ModelParam[] = [];
			let at = 0;
			while (at < rest.length) {
				let matched = false;
				for (let end = rest.length; end > at && !matched; end--) {
					const param = paramFor(candidate, rest.slice(at, end).join("-"));
					if (param !== undefined && !found.some((have) => have.id === param.id)) {
						found.push(param);
						at = end;
						matched = true;
					}
				}
				if (!matched) break;
			}
			if (at === rest.length) {
				model = candidate;
				params = found;
			}
		}
	}
	if (model === undefined) throw unknown(name, models);
	const given = Object.entries(explicit ?? {});
	if (given.length > MAX_PARAMS) throw new Error(`At most ${MAX_PARAMS} model parameters`);
	for (const [id, value] of given) {
		const definition = model.params.find((entry) => entry.id === id);
		if (definition === undefined)
			throw new Error(`${model.id} has no parameter “${id.slice(0, 40)}”. ${model.params.length ? `It has: ${paramsText(model)}.` : "It has none."}`);
		if (!definition.values.includes(value))
			throw new Error(`“${value.slice(0, 40)}” is not a value of ${model.id}'s ${id}. Allowed: ${definition.values.join(", ")}.`);
		params = [...params.filter((have) => have.id !== id), { id, value }];
	}
	return { id: model.id, params };
}

/** How a chosen model reads in a run's view: `claude-opus-5 (thinking=true, effort=high)`. */
export const modelLabel = (resolved: Resolved) =>
	resolved.params.length ? `${resolved.id} (${resolved.params.map((param) => `${param.id}=${param.value}`).join(", ")})` : resolved.id;
