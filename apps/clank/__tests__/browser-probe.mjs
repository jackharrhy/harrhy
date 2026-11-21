import { newWebSocketRpcSession } from "capnweb";

// Independent /live client for the fixture test. Never included in the app bundle.
window.probeCatalog = async (hold = false) => {
  const ws = new WebSocket("/live");
  const api = newWebSocketRpcSession(ws);
  const snapshot = Promise.withResolvers();
  const gate = Promise.withResolvers();
  const frames = [];
  const closed = new Promise((resolve) =>
    ws.addEventListener(
      "close",
      () => {
        api[Symbol.dispose]();
        gate.resolve();
        resolve();
      },
      { once: true },
    ),
  );
  const deadline = setTimeout(() => ws.close(), 10_000);
  try {
    await api.watch(async (frame) => {
      frames.push(frame);
      if (frame.kind === "snapshot") {
        snapshot.resolve();
        if (hold) await gate.promise;
      }
    });
    await Promise.race([snapshot.promise, closed]);
    if (!frames.length) throw Error("No probe snapshot");
    return { api, ws, frames, resume: gate.resolve, closed };
  } finally {
    clearTimeout(deadline);
  }
};
