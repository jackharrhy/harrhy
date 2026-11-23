// A stand-in for the `@cursor/sdk` package, installed by the cursor tests into a fixture plugin's node_modules. It has the
// SDK's call shapes (Agent.create / agent.send / run.wait, Cursor.me, Cursor.models.list) and does whatever the test's
// `globalThis.__cursorFake` says; it never touches the network or a credential.
const fake = () => globalThis.__cursorFake;

exports.Cursor = {
	me: async (options) => fake().me(options),
	models: { list: async (options) => fake().models(options) },
};
exports.Agent = {
	create: async (options) => fake().create(options),
	getRun: async (runId, options) => fake().getRun(runId, options),
};
