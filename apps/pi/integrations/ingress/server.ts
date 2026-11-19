// Optional loopback-only HTTP ingress, scoped to one existing Familiar; no owner authentication is granted.
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { join } from "node:path";
import { compile, obj, str } from "@earendil-works/pi-schema";
import { awaitWithContext, contribute, defineFacet } from "@p2/app/v1";
import { familiarIngressAvailable, type RouteHandler, Routes, Server, sendJson, serverOf } from "@p2/app/v1/server";
import { EventIdSchema, EventSchema, ExternalIngress } from "./contract.ts";

const configCheck = compile(
	obj({
		sender: EventIdSchema,
		name: str({ minLength: 1, maxLength: 80 }),
		session: str({ minLength: 1 }),
		tokenHash: str({ pattern: "^[a-f0-9]{64}$" }),
	}),
).check;
const eventCheck = compile(EventSchema).check;
const idCheck = compile(EventIdSchema).check;

export default defineFacet((host) => {
	contribute(host, "p2.ingress-routes", (self) => {
		const server = self.get(Server, {});
		const natives = serverOf(self);
		self.contribute(
			Routes,
			Object.fromEntries(
				(["admit", "receipt"] as const).map((operation) => [
					operation === "admit" ? "POST /api/ingress/v1/events" : "GET /api/ingress/v1/receipts/*",
					(async (request, response, { origin }, ctx) => {
						// This wire boundary is deliberately local-only, including when a relay resolves the request first.
						if (
							origin.remote ||
							origin.relayShellOrigin !== undefined ||
							request.headers.origin !== undefined ||
							request.headers["sec-fetch-site"] !== undefined ||
							request.headers.forwarded !== undefined ||
							Object.keys(request.headers).some(
								(key) => key.startsWith("x-forwarded-") || key === "x-p2-proxy-secret",
							)
						)
							return sendJson(response, 403, { error: "Local client only" });
						let raw: string;
						try {
							raw = await readFile(join(server.info.value.dataDir, "ingress.json"), "utf8");
						} catch (error) {
							if ((error as NodeJS.ErrnoException).code === "ENOENT")
								return sendJson(response, 404, { error: "Ingress disabled" });
							return sendJson(response, 503, { error: "Ingress configuration unavailable" });
						}
						let config: unknown;
						try {
							config = JSON.parse(raw);
						} catch {
							return sendJson(response, 503, { error: "Invalid ingress configuration" });
						}
						if (!configCheck(config)) return sendJson(response, 503, { error: "Invalid ingress configuration" });
						const authorization = request.headers.authorization;
						if (
							!authorization?.startsWith("Bearer ") ||
							!timingSafeEqual(
								createHash("sha256").update(authorization.slice(7)).digest(),
								Buffer.from(config.tokenHash, "hex"),
							)
						)
							return sendJson(response, 401, { error: "Invalid ingress credential" });
						try {
							if (!(await familiarIngressAvailable(config.session, ctx)))
								return sendJson(response, 503, { error: "Configured Familiar unavailable" });
							let event: { eventId: string; text: string } | undefined;
							const eventId = new URL(request.url ?? "/", "http://p2").pathname.slice(
								"/api/ingress/v1/receipts/".length,
							);
							if (operation === "admit") {
								const body = await readBody(request);
								if (body === undefined) return sendJson(response, 413, { error: "Body exceeds 64 KiB" });
								let value: unknown;
								try {
									value = JSON.parse(body);
								} catch {
									return sendJson(response, 400, { error: "Invalid JSON" });
								}
								if (!eventCheck(value) || Buffer.byteLength(value.text) > 32768)
									return sendJson(response, 400, { error: "Expected eventId and text (at most 32 KiB)" });
								event = value;
							} else if (!idCheck(eventId)) return sendJson(response, 400, { error: "Invalid event ID" });
							const result = await natives().root(async (root) => {
								const peer = await awaitWithContext(
									root.get(ExternalIngress, { session: config.session }),
									root,
								);
								if (!(await familiarIngressAvailable(config.session, root)))
									throw new Error("Familiar unavailable");
								return event === undefined
									? peer.receipt({ sender: config.sender, eventId }, root)
									: peer.admit(
											{
												...event,
												sender: config.sender,
												name: config.name,
												contentHash: createHash("sha256").update(event.text).digest("hex"),
											},
											root,
										);
							}, ctx);
							if (result === null) return sendJson(response, 404, { error: "No admitted receipt" });
							if (result.state === "conflict")
								return sendJson(response, 409, { error: "Event ID already has different content" });
							return sendJson(response, 200, result);
						} catch {
							return sendJson(response, 503, {
								error: "Admission outcome unknown; retry the same event ID and content",
							});
						}
					}) satisfies RouteHandler,
				]),
			),
		);
	});
});

/** The HTTP wire boundary: a bounded UTF-8 JSON body. */
async function readBody(request: IncomingMessage): Promise<string | undefined> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request) {
		const bytes = Buffer.from(chunk);
		size += bytes.length;
		if (size > 65536) return undefined;
		chunks.push(bytes);
	}
	return Buffer.concat(chunks).toString("utf8");
}
