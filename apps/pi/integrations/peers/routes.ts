// The routes a peer calls, on loopback only: a request reaches them through SSH, from the sshd on this machine.
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { isChordError, PluginError } from "@p2/app/v1";
import {
	PROXY_MARKER_HEADER,
	type RouteHandler,
	sendJson,
	WakeStore,
} from "@p2/app/v1/server";
import { type Manager, senderName } from "./manager.ts";
import {
	EVENT_ID,
	linkRequest,
	linkUp,
	MAX_BODY,
	PREFIX,
	PROTOCOL,
	peerEvent,
} from "./protocol.ts";

/** What the owner's browser cannot be: a direct loopback client with no cookies, proxies or Fetch Metadata. */
function direct(
	request: IncomingMessage,
	origin: Parameters<RouteHandler>[2]["origin"],
): boolean {
	return (
		!origin.remote &&
		request.socket.remoteAddress === "127.0.0.1" &&
		!Object.keys(request.headers).some(
			(key) =>
				key.startsWith("x-forwarded-") ||
				key.startsWith("sec-fetch-") ||
				[
					"origin",
					"referer",
					"cookie",
					PROXY_MARKER_HEADER,
					"forwarded",
					"via",
					"proxy-authorization",
					"proxy-connection",
				].includes(key),
		)
	);
}

async function body(request: IncomingMessage): Promise<unknown> {
	if (Number(request.headers["content-length"]) > MAX_BODY)
		throw new Error("too large");
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request.iterator({ destroyOnReturn: false })) {
		size += Buffer.from(chunk).length;
		if (size > MAX_BODY) throw new Error("too large");
		chunks.push(Buffer.from(chunk));
	}
	return size === 0
		? undefined
		: JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
}

export function peerRoutes(
	manager: Manager,
	name: () => string,
	capabilities: readonly string[],
): Record<string, RouteHandler> {
	const guarded =
		(
			handle: (
				request: IncomingMessage,
				reply: (status: number, value: unknown) => void,
				ctx: Parameters<RouteHandler>[3],
			) => Promise<void>,
		): RouteHandler =>
		async (request, response, { origin }, ctx) => {
			const reply = (status: number, value: unknown) =>
				sendJson(response, status, value, { "Cache-Control": "no-store" });
			if (!direct(request, origin) || !request.url?.startsWith(`${PREFIX}/`))
				return reply(403, { error: "Direct loopback client required" });
			try {
				await handle(request, reply, ctx);
			} catch (error) {
				if (
					error instanceof SyntaxError ||
					(error instanceof Error && error.message === "too large")
				)
					return reply(400, { error: "Expected a small JSON body" });
				if (isChordError(error, "forbidden"))
					return reply(403, { error: "Operation or target not permitted" });
				if (error instanceof PluginError && error.code === "addressed_conflict")
					return reply(409, {
						error: "Event ID already has a different selector or payload",
					});
				reply(503, {
					error:
						"Outcome unavailable; keep the original event ID, selector and payload",
				});
			}
		};
	/** The authenticated peer, or an answer saying it is not one. */
	const peerOf = (
		request: IncomingMessage,
		reply: (status: number, value: unknown) => void,
	) => {
		const record = manager.authenticate(request.headers);
		if (!record) reply(401, { error: "Not a linked peer" });
		return record;
	};
	const tail = (request: IncomingMessage, route: string) =>
		(request.url ?? "").split("?")[0]?.slice(`${PREFIX}${route}`.length) ?? "";

	return {
		[`GET ${PREFIX}/hello`]: guarded(async (_request, reply) => {
			reply(200, {
				protocol: PROTOCOL,
				instanceId: manager.me().id,
				name: name(),
				capabilities,
			});
		}),
		[`POST ${PREFIX}/requests`]: guarded(async (request, reply, ctx) => {
			const value = await body(request);
			if (!linkRequest.check(value))
				return reply(400, { error: "Not a link request" });
			const result = await manager.receive(value, ctx);
			if (result === "linked") return reply(409, { error: "Already linked" });
			if (result === "busy") return reply(429, { error: "Too many requests" });
			reply(201, result);
		}),
		[`GET ${PREFIX}/requests/*`]: guarded(async (request, reply) => {
			const id = tail(request, "/requests/");
			if (!/^[a-f0-9]{64}$/.test(id))
				return reply(400, { error: "Invalid request ID" });
			const answer = await manager.answer(id);
			if (!answer) return reply(404, { error: "No such request" });
			reply(200, answer);
		}),
		[`POST ${PREFIX}/link`]: guarded(async (request, reply, ctx) => {
			const record = peerOf(request, reply);
			if (!record) return;
			const value = await body(request);
			if (!linkUp.check(value))
				return reply(400, { error: "Not a link announcement" });
			await manager.linked(record, value, ctx);
			reply(200, { ok: true });
		}),
		[`POST ${PREFIX}/unlink`]: guarded(async (request, reply, ctx) => {
			const record = peerOf(request, reply);
			if (!record) return;
			await manager.dropLink(record.id, ctx);
			reply(200, { ok: true });
		}),
		[`GET ${PREFIX}/targets`]: guarded(async (request, reply, ctx) => {
			const record = peerOf(request, reply);
			if (!record) return;
			const store = await ctx.get(WakeStore, {});
			reply(200, {
				targets: await store.discoverAddressed(
					{ peer: `peer:${record.id}` },
					ctx,
				),
			});
		}),
		[`POST ${PREFIX}/events`]: guarded(async (request, reply, ctx) => {
			const record = peerOf(request, reply);
			if (!record) return;
			const value = await body(request);
			if (!peerEvent.check(value))
				return reply(400, {
					error:
						"Expected text of 1 to 32768 bytes, with optional session and eventId",
				});
			if (Buffer.byteLength(value.text) > 32768)
				return reply(400, { error: "Text exceeds 32768 bytes" });
			const eventId = value.eventId ?? randomUUID();
			const store = await ctx.get(WakeStore, {});
			const result = await store.sendAddressed(
				{
					...value,
					peer: `peer:${record.id}`,
					eventId,
					from: senderName(record.name),
				},
				ctx,
			);
			reply(
				result.state === "recorded" || result.state === "unknown" ? 202 : 200,
				{ eventId, ...result },
			);
		}),
		[`GET ${PREFIX}/receipts/*`]: guarded(async (request, reply, ctx) => {
			const record = peerOf(request, reply);
			if (!record) return;
			const eventId = tail(request, "/receipts/");
			if (!EVENT_ID.check(eventId))
				return reply(400, { error: "Invalid event ID" });
			const store = await ctx.get(WakeStore, {});
			const result = await store.receiptAddressed(
				{ peer: `peer:${record.id}`, eventId },
				ctx,
			);
			reply(result.state === "missing" ? 404 : 200, result);
		}),
	};
}
