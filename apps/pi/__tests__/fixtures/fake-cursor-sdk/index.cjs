// In-process test double for the hosted SDK.
const inProcess = () => globalThis.__cursorFake;
exports.Cursor = {
	me: async (options) => inProcess().me(options),
	models: { list: async (options) => inProcess().models(options) },
};
exports.Agent = {
	create: async (options) => inProcess().create(options),
	resume: async (agentId, options) => inProcess().resume(agentId, options),
	getRun: async (runId, options) => inProcess().getRun(runId, options),
};
