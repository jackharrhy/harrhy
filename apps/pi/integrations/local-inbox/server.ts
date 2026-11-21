import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { compile, nul, obj, opt, type Static, str, union } from "@earendil-works/pi-schema";
import {
  defineFacet,
  defineState,
  forbidden,
  isChordError,
  isOwner,
  local,
  type Ctx,
} from "@p2/app/v1";
import {
  AddressedPolicies,
  PROXY_MARKER_HEADER,
  type RouteHandler,
  Routes,
  sendJson,
  WakeStore,
} from "@p2/app/v1/server";

import { AdminMethods, Grant, GrantFields, Hash, LocalInboxAdmin } from "./contract.ts";

const prefix = "/api/local-inbox/v1";
const peer = "local-inbox";
const id = str({ minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$" });
const sessionId = str({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

type Status = Static<typeof import("./contract.ts").Status>;
type InboxMembers = {
  status(): Promise<Status>;
  provision(args: { grant: Static<typeof Grant>; bearerHash: string }, ctx: Ctx): Promise<Status>;
  rotate(args: { bearerHash: string }, ctx: Ctx): Promise<Status>;
  revoke(args: object, ctx: Ctx): Promise<Status>;
};
const Inbox = local("p2.local-inbox", { version: 1, params: {}, members: AdminMethods });
const Saved = defineState("p2.local-inbox-grant", {
  version: 1,
  schema: obj({
    active: union([
      obj({
        policy: obj({ ...GrantFields, revision: id, label: str() }),
        bearerHash: Hash,
      }),
      nul(),
    ]),
  }),
  initial: () => ({ active: null }),
  persist: true,
  checkpointWhen: () => true,
});
const eventSchema = compile(
  obj({
    eventId: id,
    session: opt(sessionId),
    text: str({ minLength: 1, maxLength: 32768 }),
  }),
);
const idSchema = compile(id);

export default defineFacet((host) => {
  const disabledPolicy = { label: "Local inbox", revision: "disabled" };
  host.serve(Inbox, (_params, self) => {
    const saved = self.state(Saved);
    self.contribute(AddressedPolicies, {
      [peer]: () => saved.value.active?.policy ?? disabledPolicy,
    });
    const status = (): Status => {
      const policy = saved.value.active?.policy;
      if (!policy) return { enabled: false };
      const { label: _label, revision, ...grant } = policy;
      return { enabled: true, revision, grant };
    };
    const admin = {
      status: async () => status(),
      provision: async ({ grant, bearerHash }, ctx) => {
        await saved.change((draft) => {
          draft.active = {
            policy: { ...grant, label: "Local inbox", revision: randomUUID() },
            bearerHash,
          };
        }, ctx);
        return status();
      },
      rotate: async ({ bearerHash }, ctx) => {
        await saved.change((draft) => {
          if (!draft.active) throw forbidden("No active inbox grant");
          draft.active.bearerHash = bearerHash;
        }, ctx);
        return status();
      },
      revoke: async (_args, ctx) => {
        await saved.change((draft) => {
          draft.active = null;
        }, ctx);
        return status();
      },
    } satisfies InboxMembers;
    const handle =
      (operation: "targets" | "send" | "receipt"): RouteHandler =>
      async (request, response, { origin }, ctx) => {
        const reply = (status: number, value: unknown, headers: Record<string, string> = {}) =>
          sendJson(response, status, value, { "Cache-Control": "no-store", ...headers });
        if (
          !directLoopback(request, origin) ||
          !request.url?.startsWith(prefix + "/") ||
          Object.keys(request.headers).some(
            (key) => ["origin", "referer", "cookie"].includes(key) || key.startsWith("sec-fetch-"),
          )
        )
          return reply(403, { error: "Direct loopback client required" });

        const expected = saved.value.active?.bearerHash;
        if (!expected) return reply(404, { error: "Local inbox disabled" });
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
          if (operation === "targets") {
            const targets = await store.discoverAddressed({ peer }, ctx);
            if (saved.value.active?.bearerHash !== expected)
              return reply(401, { error: "Credential changed" });
            return reply(200, { targets });
          }
          if (operation === "receipt") {
            const eventId = url.pathname.slice((prefix + "/receipts/").length);
            if (!idSchema.check(eventId)) return reply(400, { error: "Invalid event ID" });
            const result = await store.receiptAddressed({ peer, eventId }, ctx);
            if (saved.value.active?.bearerHash !== expected)
              return reply(401, { error: "Credential changed" });
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
          if (saved.value.active?.bearerHash !== expected)
            return reply(401, { error: "Credential changed" });
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
    return admin;
  });
  host.serve(LocalInboxAdmin, (_params, principal, self) => {
    if (!isOwner(principal)) throw forbidden("Local inbox administration is owner-only");
    const inbox = self.get(Inbox, {});
    return {
      variant: "owner",
      members: {
        status: (_args, ctx) => inbox.status({}, ctx),
        provision: (args, ctx) => inbox.provision(args, ctx),
        rotate: (args, ctx) => inbox.rotate(args, ctx),
        revoke: (_args, ctx) => inbox.revoke({}, ctx),
      },
    };
  });
});

function directLoopback(request: IncomingMessage, origin: Parameters<RouteHandler>[2]["origin"]) {
  return (
    !origin.remote &&
    origin.relayShellOrigin === undefined &&
    origin.relayUser === undefined &&
    request.socket.remoteAddress === "127.0.0.1" &&
    !Object.keys(request.headers).some(
      (key) =>
        key.startsWith("x-forwarded-") ||
        [
          PROXY_MARKER_HEADER,
          "forwarded",
          "via",
          "proxy-authorization",
          "proxy-connection",
        ].includes(key),
    )
  );
}

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
