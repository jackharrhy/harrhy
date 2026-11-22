import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { pluginFile } from "@earendil-works/chord/plugins";
import { arr, bool, compile, obj, opt, str } from "@earendil-works/pi-schema";
import { contribute, defineFacet, isChordError } from "@p2/app/v1";
import {
  AddressedPolicies,
  PROXY_MARKER_HEADER,
  type RouteHandler,
  Routes,
  sendJson,
  WakeStore,
} from "@p2/app/v1/server";

const prefix = "/api/local-inbox/v1";
const peer = "local-inbox";
const id = str({ minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$" });
const sessionId = str({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const sessions = arr(sessionId, { maxItems: 100 });
const configSchema = compile(
  obj({
    revision: id,
    discover: opt(sessions),
    send: opt(obj({ sessions, familiar: opt(bool()) })),
    receipts: opt(bool()),
  }),
);
const eventSchema = compile(
  obj({
    eventId: id,
    session: opt(sessionId),
    text: str({ minLength: 1, maxLength: 32768 }),
  }),
);
const idSchema = compile(id);

export default defineFacet((host) => {
  contribute(host, "p2.local-inbox", (self) => {
    let config: unknown;
    try {
      config = JSON.parse(readFileSync(pluginFile("policy.json"), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw new Error("Local inbox policy is unreadable or invalid");
    }
    if (!configSchema.check(config)) throw new Error("Invalid local inbox policy");
    const credentialFile = pluginFile("bearer.sha256");
    self.contribute(AddressedPolicies, { [peer]: { ...config, label: "Local inbox" } });
    const handle =
      (operation: "targets" | "send" | "receipt"): RouteHandler =>
      async (request, response, { origin }, ctx) => {
        const reply = (status: number, value: unknown, headers: Record<string, string> = {}) =>
          sendJson(response, status, value, { "Cache-Control": "no-store", ...headers });
        if (
          origin.remote ||
          request.socket.remoteAddress !== "127.0.0.1" ||
          !request.url?.startsWith(prefix + "/") ||
          Object.keys(request.headers).some(
            (key) =>
              [
                "origin",
                "referer",
                "cookie",
                "forwarded",
                "via",
                "proxy-authorization",
                "proxy-connection",
                PROXY_MARKER_HEADER,
              ].includes(key) ||
              key.startsWith("sec-fetch-") ||
              key.startsWith("x-forwarded-"),
          )
        )
          return reply(403, { error: "Direct loopback client required" });

        let expected: string;
        try {
          expected = (await readFile(credentialFile, "utf8")).trim();
        } catch (error) {
          return (error as NodeJS.ErrnoException).code === "ENOENT"
            ? reply(404, { error: "Local inbox disabled" })
            : reply(503, { error: "Local inbox credential unavailable" });
        }
        if (!/^[a-f0-9]{64}$/.test(expected))
          return reply(503, { error: "Local inbox credential unavailable" });
        const authorization = request.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/i);
        if (
          !authorization ||
          !timingSafeEqual(
            createHash("sha256").update(authorization[1]!).digest(),
            Buffer.from(expected, "hex"),
          )
        )
          return reply(
            401,
            { error: "Invalid local inbox credential" },
            { "WWW-Authenticate": "Bearer" },
          );

        const url = new URL(request.url, origin.origin);
        if (url.search || url.hash)
          return reply(400, { error: "Use only the documented path and JSON body" });
        try {
          const store = await ctx.get(WakeStore, {});
          if (operation === "targets")
            return reply(200, { targets: await store.discoverAddressed({ peer }, ctx) });
          if (operation === "receipt") {
            const eventId = url.pathname.slice((prefix + "/receipts/").length);
            if (!idSchema.check(eventId)) return reply(400, { error: "Invalid event ID" });
            const result = await store.receiptAddressed({ peer, eventId }, ctx);
            return reply(result.state === "missing" ? 404 : 200, result);
          }
          if (
            request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !==
            "application/json"
          )
            return reply(415, { error: "Expected application/json" });
          const bytes = await readBody(request);
          if (!bytes) return reply(413, { error: "Body exceeds 256 KiB" }, { Connection: "close" });
          let event: unknown;
          try {
            event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
          } catch {
            return reply(400, { error: "Invalid UTF-8 JSON" });
          }
          if (!eventSchema.check(event) || Buffer.byteLength(event.text) > 32768)
            return reply(400, {
              error: "Expected eventId, optional session ID and text of 1–32768 bytes",
            });
          const result = await store.sendAddressed({ ...event, peer }, ctx);
          return reply(
            result.state === "recorded" || result.state === "unknown" ? 202 : 200,
            result,
          );
        } catch (error) {
          if (isChordError(error, "forbidden"))
            return reply(403, { error: "Operation or target not permitted" });
          if (error instanceof Error && error.message.includes("Addressed stimulus conflict"))
            return reply(409, { error: "Event ID already has a different selector or payload" });
          return reply(503, {
            error: "Outcome unavailable; keep the original event ID, selector and payload",
          });
        }
      };
    self.contribute(Routes, {
      [`GET ${prefix}/targets`]: handle("targets"),
      [`POST ${prefix}/events`]: handle("send"),
      [`GET ${prefix}/receipts/*`]: handle("receipt"),
    });
  });
});

async function readBody(request: IncomingMessage): Promise<Buffer | undefined> {
  const maxBytes = 256 * 1024;
  if (Number(request.headers["content-length"]) > maxBytes) return undefined;
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) return undefined;
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}
