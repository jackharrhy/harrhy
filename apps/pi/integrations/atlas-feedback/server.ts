// App-to-Pi ingress: server-derived root recipients; native stimuli own persistence and dispatch.
import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { join } from "node:path";
import { arr, compile, obj, opt, type Static, str } from "@earendil-works/pi-schema";
import {
	awaitWithContext,
	type Ctx,
	contribute,
	defineFacet,
	isChordError,
	literal,
	signalOf,
	withAbortSignal,
} from "@p2/app/v1";
import { optionalText, processLogs } from "@p2/app/v1/node";
import {
	bindStimulusPublisher,
	type EventReadbackSchema,
	externalTargets,
	Hosts,
	type RouteHandler,
	Routes,
	Server,
	StimulusSources,
	StimulusWorker,
	type SubscriptionSchema,
	sendJson,
	serverOf,
	sourceKey,
	WakeStore,
} from "@p2/app/v1/server";
import { AtlasFeedback, BatchSchema, payloadDigest, validateEvidence } from "./contract.server.ts";

const ConfigSchema = obj({
	token: str({ minLength: 32 }),
	resource: str({ minLength: 1, maxLength: 128 }),
	articleOrigin: str({ minLength: 1, maxLength: 2048 }),
	subscriptions: arr(str({ minLength: 1 })),
	recipients: opt(literal("top-level")),
	defaultSessionId: opt(str({ minLength: 1 })),
	piOrigin: opt(str({ minLength: 1, maxLength: 2048 })),
});
const configCheck = compile(ConfigSchema);
const batchCheck = compile(BatchSchema);
const sourceConfigCheck = compile(AtlasFeedback.configSchema);
type Config = Static<typeof ConfigSchema>;
type Subscription = Static<typeof SubscriptionSchema>;

const chatUrlOf = (receipt: Static<typeof EventReadbackSchema>, config: Config): string | undefined => {
	if (receipt.state !== "admitted" || config.piOrigin === undefined) return undefined;
	const { session, conversation } = receipt.event.envelope.delivery;
	return new URL(`/s/${encodeURIComponent(session)}/c/${conversation}`, config.piOrigin).href;
};
class IngressError extends Error {
	readonly status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}
const keyOf = (resource: string, id: string) =>
	createHash("sha256")
		.update(JSON.stringify(["atlas.feedback", resource, id]))
		.digest("hex");

const rootBindingPrefix = (config: Config) =>
	`atlas-feedback-root-${createHash("sha256").update(config.resource).digest("hex")}-`;
const rootBindingId = (config: Config, session: string, conversation: number) =>
	`${rootBindingPrefix(config)}${createHash("sha256")
		.update(JSON.stringify([session, conversation]))
		.digest("hex")}`;

export default defineFacet((host) => {
	contribute(host, "p2.atlas-feedback-routes", (self) => {
		const natives = serverOf(self);
		self.contribute(StimulusSources, { [sourceKey(AtlasFeedback)]: AtlasFeedback });
		const guarded =
			(handle: (request: IncomingMessage, config: Config, ctx: Ctx) => Promise<unknown>): RouteHandler =>
			async (request, response, _access, ctx) => {
				try {
					const server = await ctx.get(Server, {});
					const text = await optionalText(join(server.info.value.dataDir, "atlas-feedback.json"));
					if (text === undefined) throw new IngressError(503, "Atlas adapter is not configured");
					let config: unknown;
					try {
						config = JSON.parse(text);
					} catch {
						throw new IngressError(503, "Invalid Atlas adapter configuration");
					}
					if (!configCheck.check(config)) throw new IngressError(503, "Invalid Atlas adapter configuration");
					try {
						const origin = new URL(config.articleOrigin);
						if (origin.origin !== config.articleOrigin || !["https:", "http:"].includes(origin.protocol))
							throw new Error("Not an exact HTTP(S) origin");
					} catch {
						throw new IngressError(503, "Invalid Atlas article origin");
					}
					if (config.piOrigin !== undefined) {
						try {
							const origin = new URL(config.piOrigin);
							if (origin.origin !== config.piOrigin || origin.protocol !== "https:")
								throw new Error("Not an exact HTTPS origin");
						} catch {
							throw new IngressError(503, "Invalid Pi origin");
						}
					}
					processLogs.redactor.addSecret(config.token);
					const expected = createHash("sha256").update(`Bearer ${config.token}`).digest();
					const actual = createHash("sha256")
						.update(request.headers.authorization ?? "")
						.digest();
					if (!timingSafeEqual(expected, actual)) throw new IngressError(401, "Atlas app credential required");
					// Browser credentials and cross-site traffic have no authority at this server-to-server boundary.
					if (request.headers.origin !== undefined || request.headers["sec-fetch-site"] !== undefined)
						throw new IngressError(403, "Server-to-server requests only");
					sendJson(response, 200, await handle(request, config, ctx), { "Cache-Control": "no-store" });
				} catch (error) {
					if (error instanceof IngressError) sendJson(response, error.status, { error: error.message });
					else if (isChordError(error, "forbidden"))
						sendJson(response, 409, { error: "Target or binding is unavailable" });
					else throw error;
				}
			};
		const bindings = async (config: Config, ctx: Ctx) =>
			(await (await ctx.get(WakeStore, {})).subscriptions({}, ctx)).filter(
				(row) =>
					(config.subscriptions.includes(row.id) ||
						// The resource-owned native namespace survives later target revisions for frozen-batch receipts.
						(config.recipients === "top-level" && row.id.startsWith(rootBindingPrefix(config)))) &&
					row.source.id === AtlasFeedback.id &&
					row.source.version === AtlasFeedback.version,
			);
		const resolve = async (key: string, config: Config, ctx: Ctx) => {
			const row = (await bindings(config, ctx)).find((item) => keyOf(config.resource, item.id) === key);
			if (!row) throw new IngressError(404, "Unknown Atlas target");
			return row;
		};
		const eligible = async (row: Subscription, config: Config, ctx: Ctx) => {
			const targets = await externalTargets(ctx);
			const session = targets.get(row.target.session);
			if (
				!row.enabled ||
				row.source.id !== AtlasFeedback.id ||
				row.source.version !== AtlasFeedback.version ||
				!session ||
				session.archivedAt !== null ||
				(session.main !== row.target.conversation &&
					!session.branches.some((branch) => branch.conversation === row.target.conversation)) ||
				!sourceConfigCheck.check(row.config) ||
				row.config.resource !== config.resource ||
				row.config.articleOrigin !== config.articleOrigin
			)
				return undefined;
			try {
				await (await ctx.get(StimulusWorker, { session: session.id })).validateTarget(
					{ conversation: row.target.conversation },
					ctx,
				);
			} catch (error) {
				if (isChordError(error, "forbidden")) return undefined;
				throw error;
			}
			// Recheck server-owned policy after the worker read, including concurrent archive/share changes.
			const current = targets.get(session.id);
			if (!current || current.archivedAt !== null) return undefined;
			return current;
		};
		// Concurrent catalog reads share provisioning, not an event or a publication attempt.
		const provisioning = new Map<string, Promise<Subscription>>();
		const provision = async (session: string, conversation: number, config: Config, ctx: Ctx) => {
			const id = rootBindingId(config, session, conversation);
			const pending = provisioning.get(id);
			if (pending) return pending;
			const creation = (async () => {
				const store = await ctx.get(WakeStore, {});
				const existing = (await store.subscriptions({}, ctx)).find((row) => row.id === id);
				if (existing) return existing;
				return store.createSubscription(
					{
						id,
						source: { id: AtlasFeedback.id, version: AtlasFeedback.version },
						target: { session, conversation },
						config: { resource: config.resource, articleOrigin: config.articleOrigin },
					},
					ctx,
				);
			})();
			provisioning.set(id, creation);
			try {
				return await creation;
			} finally {
				provisioning.delete(id);
			}
		};
		self.contribute(Routes, {
			"GET /atlas-feedback/targets": guarded(async (_request, config, ctx) => {
				const nativeTargets = await externalTargets(ctx);
				const hosts = await ctx.get(Hosts, {});
				const targets = [];
				const unavailable: { sessionId: string; label: string; reason: string }[] = [];
				const registered = await bindings(config, ctx);
				// Catalog rows are sessions only: subagents/one-shots live in ChildStore, never here.
				for (const candidate of nativeTargets.list()) {
					if (candidate.archivedAt !== null) continue;
					if (config.recipients !== "top-level" && !registered.some((row) => row.target.session === candidate.id))
						continue;
					let row = registered.find(
						(item) => item.target.session === candidate.id && item.target.conversation === candidate.main,
					);
					let session: Awaited<ReturnType<typeof eligible>>;
					// A failed native start stays waiting until owner Retry; it must not hold the whole catalog open.
					const deadline = AbortSignal.timeout(5000);
					const bounded = withAbortSignal(deadline, ctx);
					try {
						if (!hosts.workers.value[candidate.id]?.error)
							await natives().root(async (scoped) => {
								if (!row && config.recipients === "top-level")
									row = await awaitWithContext(
										provision(candidate.id, candidate.main, config, scoped),
										scoped,
									);
								if (row) session = await awaitWithContext(eligible(row, config, scoped), scoped);
							}, bounded);
					} catch (error) {
						if (signalOf(ctx).aborted) throw error;
						if (
							!isChordError(error, "forbidden") &&
							!deadline.aborted &&
							!(error instanceof Error && error.name === "TimeoutError")
						)
							throw error;
					}
					if (!row || !session || session.id !== candidate.id || session.main !== row.target.conversation) {
						if (nativeTargets.get(candidate.id)?.archivedAt === null)
							unavailable.push({
								sessionId: candidate.id,
								label: candidate.title,
								reason: row && !row.enabled ? "binding-disabled" : "not-writable",
							});
						continue;
					}
					targets.push({
						sessionId: session.id,
						key: keyOf(config.resource, row.id),
						revision: row.revision,
						label: session.title,
					});
				}
				return {
					targets,
					defaultSessionId: config.defaultSessionId ?? null,
					eligibleCount: targets.length,
					unavailable,
				};
			}),
			"POST /atlas-feedback/batches": guarded(async (request, config, ctx) => {
				if (request.headers["content-type"] !== "application/json")
					throw new IngressError(415, "Expected application/json");
				let size = 0;
				const chunks: Buffer[] = [];
				for await (const chunk of request) {
					const bytes = Buffer.from(chunk);
					size += bytes.length;
					if (size > 24576) throw new IngressError(413, "Atlas batch exceeds 24 KiB");
					chunks.push(bytes);
				}
				let body: unknown;
				try {
					body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
				} catch {
					throw new IngressError(400, "Invalid JSON");
				}
				if (!batchCheck.check(body)) throw new IngressError(400, "Invalid Atlas batch");
				if (payloadDigest(body.comments) !== body.payloadDigest)
					throw new IngressError(409, "Payload digest mismatch");
				const row = await resolve(body.target.key, config, ctx);
				const publisher = bindStimulusPublisher(await ctx.get(WakeStore, {}), AtlasFeedback, {
					...row,
					revision: body.target.revision,
				});
				const previous = await publisher.receipt({ eventId: body.batchId }, ctx);
				if (previous.state === "missing") {
					const session = await eligible(row, config, ctx);
					if (row.revision !== body.target.revision || !session || session.main !== row.target.conversation)
						throw new IngressError(409, "Target or binding is unavailable");
				}
				const event = {
					payloadVersion: body.payloadVersion,
					resource: config.resource,
					batchId: body.batchId,
					payloadDigest: body.payloadDigest,
					comments: body.comments,
				};
				if (previous.state === "missing") {
					try {
						validateEvidence(body.comments, config.articleOrigin);
					} catch {
						throw new IngressError(400, "Invalid Atlas evidence");
					}
				}
				try {
					const receipt = await publisher.publish({ eventId: body.batchId, event }, ctx);
					return {
						batchId: body.batchId,
						payloadDigest: body.payloadDigest,
						binding: body.target,
						receipt,
						chatUrl: chatUrlOf(receipt, config),
					};
				} catch (error) {
					if (error instanceof Error && error.message.includes("Stimulus event conflict"))
						throw new IngressError(409, "Atlas batch identity conflicts with its saved payload");
					throw error;
				}
			}),
			"GET /atlas-feedback/receipt": guarded(async (request, config, ctx) => {
				const url = new URL(request.url ?? "", "http://localhost");
				const key = url.searchParams.get("key") ?? "";
				const revision = Number(url.searchParams.get("revision"));
				const batchId = url.searchParams.get("batchId") ?? "";
				if (!Number.isSafeInteger(revision) || revision < 1 || !batchId.length || batchId.length > 256)
					throw new IngressError(400, "Invalid receipt identity");
				const row = await resolve(key, config, ctx);
				const publisher = bindStimulusPublisher(await ctx.get(WakeStore, {}), AtlasFeedback, { ...row, revision });
				const receipt = await publisher.receipt({ eventId: batchId }, ctx);
				return { batchId, binding: { key, revision }, receipt, chatUrl: chatUrlOf(receipt, config) };
			}),
		});
	});
});
