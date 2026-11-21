import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Boot the real Auth entry without binding its Node listener. Only the entry
// module is adapted: router, forms, sessions, database and provider adapters
// all run unchanged. Tests in a file must start/close instances sequentially.
let instance = 0;
export async function loadAuthFetch(
  env,
  entry = new URL("../../src/server.mjs", import.meta.url),
) {
  const url = new URL(entry);
  url.searchParams.set("test-instance", String(++instance));
  const previousEnv = process.env;
  const signals = ["SIGTERM", "SIGINT"];
  const previousListeners = signals.map((signal) => process.listeners(signal));
  const cleanup = () => {
    signals.forEach((signal, index) => {
      for (const listener of process.listeners(signal)) {
        if (!previousListeners[index].includes(listener))
          process.off(signal, listener);
      }
    });
    process.env = previousEnv;
  };
  const hooks = registerHooks({
    load(moduleUrl, context, next) {
      const result = next(moduleUrl, context);
      if (moduleUrl !== url.href) return result;
      const source = Buffer.from(result.source).toString();
      const listener = /\nserver\.listen\([\s\S]*?\n\);/;
      assert.match(
        source,
        listener,
        "Auth entry must still own the Node listener",
      );
      return {
        ...result,
        source:
          source.replace(listener, "\nserver.close = (done) => done();") +
          "\nexport { fetchRequest, stop };\n",
      };
    },
  });
  try {
    process.env = { ...env };
    const { fetchRequest, stop } = await import(url.href);
    return {
      fetch: fetchRequest,
      async close() {
        try {
          await stop();
        } finally {
          cleanup();
        }
      },
    };
  } catch (error) {
    cleanup();
    throw error;
  } finally {
    hooks.deregister();
  }
}
