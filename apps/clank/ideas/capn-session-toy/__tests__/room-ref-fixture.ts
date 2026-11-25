import { once } from "node:events";
import WS from "ws";
import { socketSession, type Host, type Principal } from "../toy.ts";

export async function wireSession(
  url: string,
  host: Host,
  principal: Principal,
) {
  const ws = new WS(url, {
    headers: { authorization: `Bearer fixture-${host}-${principal}` },
  });
  await once(ws, "open");
  return {
    api: socketSession(ws),
    async disconnect() {
      const closed = once(ws, "close");
      ws.terminate();
      await closed;
    },
  };
}
