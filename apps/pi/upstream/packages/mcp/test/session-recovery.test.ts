// HTTP session expiry recovery: rejected POSTs can retry; potentially executed calls cannot.
import type { ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { LATEST_PROTOCOL_VERSION, McpClient, McpSessionExpiredError, StreamableHttpTransport } from "../src/index.ts";
import { closeServers, listen, readBody } from "./helpers.ts";

type Message = { id?: number; method: string; params?: { name?: string } };
type Request = {
	method: string;
	session: string | string[] | undefined;
	authorization: string | undefined;
	lastEventId: string | string[] | undefined;
	message?: Message;
};

function gate() {
	let release = () => {};
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

function result(response: ServerResponse, message: Message, value: unknown, session?: string): void {
	response.writeHead(200, {
		"content-type": "application/json",
		...(session === undefined ? {} : { "mcp-session-id": session }),
	});
	response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: value }));
}

async function sessionServer(intercept?: (request: Request, response: ServerResponse) => Promise<boolean>) {
	const state = {
		initializes: 0,
		session: undefined as string | undefined,
		initialized: false,
		requests: [] as Request[],
		dispatched: [] as string[],
	};
	const origin = await listen(async (request, response) => {
		const entry: Request = {
			method: request.method ?? "",
			session: request.headers["mcp-session-id"],
			authorization: request.headers.authorization,
			lastEventId: request.headers["last-event-id"],
			...(request.method === "POST" ? { message: JSON.parse(await readBody(request)) as Message } : {}),
		};
		state.requests.push(entry);
		if (await intercept?.(entry, response)) return;
		if (entry.method !== "POST") {
			response.writeHead(entry.method === "GET" ? 405 : 200).end();
			return;
		}
		const message = entry.message!;
		if (message.method === "initialize") {
			state.session = `session-${++state.initializes}`;
			state.initialized = false;
			result(
				response,
				message,
				{
					protocolVersion: LATEST_PROTOCOL_VERSION,
					capabilities: { tools: {} },
					serverInfo: { name: "expiry-fixture", version: String(state.initializes) },
					instructions: `generation ${state.initializes}`,
				},
				state.session,
			);
			return;
		}
		// Unknown sessions are rejected before tool dispatch, as required by Streamable HTTP.
		if (state.session === undefined || entry.session !== state.session) {
			response.writeHead(404).end("Initialize without Mcp-Session-Id");
			return;
		}
		if (message.method === "notifications/initialized") {
			state.initialized = true;
			response.writeHead(202).end();
			return;
		}
		if (!state.initialized) {
			response.writeHead(400).end("Not initialized");
			return;
		}
		if (message.method === "tools/call") state.dispatched.push(message.params?.name ?? "");
		result(response, message, { content: [{ type: "text", text: "read-only fixture result" }] });
	});
	return {
		url: `${origin}/mcp`,
		state,
		expire() {
			state.session = undefined;
			state.initialized = false;
		},
	};
}

const clientInfo = { name: "expiry-test", version: "1" };
afterEach(closeServers);

describe("HTTP session recovery", () => {
	it("does not resurrect a connection closed during the initialized acknowledgement", async () => {
		const acknowledging = gate();
		const finish = gate();
		const transport = new StreamableHttpTransport({
			url: "http://fixture.invalid/mcp",
			openGetStream: false,
			fetch: async (_url, init) => {
				const message = JSON.parse(String(init?.body)) as Message;
				if (message.method === "initialize") {
					return new Response(
						JSON.stringify({
							jsonrpc: "2.0",
							id: message.id,
							result: {
								protocolVersion: LATEST_PROTOCOL_VERSION,
								capabilities: {},
								serverInfo: clientInfo,
							},
						}),
						{ headers: { "content-type": "application/json" } },
					);
				}
				acknowledging.release();
				await finish.promise;
				return new Response(null, { status: 202 });
			},
		});
		const client = new McpClient(clientInfo);
		const connected = expect(client.connect(transport)).rejects.toMatchObject({ name: "McpConnectionClosedError" });
		await acknowledging.promise;
		await client.close();
		finish.release();
		await connected;
		expect(client.connectionState).toBe("closed");
	});

	it("discards buffered notifications from a retired background stream", async () => {
		const delivered = gate();
		const transport = new StreamableHttpTransport({
			url: "http://fixture.invalid/mcp",
			reconnect: { maxRetries: 0 },
			fetch: async (_url, init) =>
				init?.method === "GET"
					? new Response(
							["first", "retired"]
								.map((method) => `data: ${JSON.stringify({ jsonrpc: "2.0", method })}\n\n`)
								.join(""),
							{ headers: { "content-type": "text/event-stream" } },
						)
					: new Response(null, { status: 202 }),
		});
		const messages: string[] = [];
		const errors: Error[] = [];
		transport.onError((error) => errors.push(error));
		transport.onMessage((message) => {
			if (!("method" in message)) return;
			messages.push(message.method);
			transport.resetSession();
			delivered.release();
		});
		await transport.start();
		await transport.send({ jsonrpc: "2.0", method: "notifications/initialized" });
		await delivered.promise;
		await transport.close();
		expect(messages).toEqual(["first"]);
		expect(errors).toEqual([]);
	});

	it("settles failed recovery even when an error listener throws", async () => {
		const recovering = gate();
		const finish = gate();
		const fixture = await sessionServer(async (request, response) => {
			if (request.message?.method !== "initialize" || fixture.state.initializes === 0) return false;
			recovering.release();
			await finish.promise;
			response.writeHead(401).end();
			return true;
		});
		const client = new McpClient(clientInfo);
		await client.connect(new StreamableHttpTransport({ url: fixture.url, openGetStream: false }));
		client.onError(() => {
			throw new Error("listener failure");
		});
		fixture.expire();
		const first = expect(client.callTool("first")).rejects.toThrow("listener failure");
		await recovering.promise;
		const waiting = expect(client.callTool("waiting")).rejects.toMatchObject({ status: 401 });
		finish.release();
		await Promise.all([first, waiting]);
		expect(client.connectionState).toBe("closed");
	});

	it("reinitializes without the stale header and retries only the rejected POST", async () => {
		const fixture = await sessionServer();
		let authorizations = 0;
		const transport = new StreamableHttpTransport({
			url: fixture.url,
			openGetStream: false,
			authProvider: {
				token: async () => "fixture-token",
				onUnauthorized: async () => {
					authorizations++;
				},
			},
		});
		const client = new McpClient(clientInfo);
		const errors: Error[] = [];
		client.onError((error) => errors.push(error));
		await client.connect(transport);
		fixture.expire();
		await expect(client.callTool("read-skill")).resolves.toMatchObject({
			content: [{ text: "read-only fixture result" }],
		});
		expect(fixture.state.initializes).toBe(2);
		expect(fixture.state.dispatched).toEqual(["read-skill"]);
		expect(
			fixture.state.requests
				.filter((request) => request.message?.method === "initialize")
				.map((request) => request.session),
		).toEqual([undefined, undefined]);
		expect(
			fixture.state.requests
				.filter((request) => request.message?.method === "tools/call")
				.map((request) => request.session),
		).toEqual(["session-1", "session-2"]);
		expect(transport.sessionId).toBe("session-2");
		expect(client.instructions).toBe("generation 2");
		expect(client.serverInfo?.version).toBe("2");
		expect(errors).toHaveLength(1);
		expect(errors[0]).toBeInstanceOf(McpSessionExpiredError);
		expect(errors[0]).toMatchObject({ status: 404 });
		expect(authorizations).toBe(0);
		await client.close();
	});

	it("shares recovery and ignores late old-session 404s and session headers", async () => {
		const oldSuccessStarted = gate();
		const oldSuccess = gate();
		const late404Started = gate();
		const late404 = gate();
		const recovering = gate();
		const finishRecovery = gate();
		const fixture = await sessionServer(async (request, response) => {
			if (request.message?.params?.name === "old-success" && request.session === "session-1") {
				oldSuccessStarted.release();
				await oldSuccess.promise;
				result(response, request.message, { content: [] }, "session-1");
				return true;
			}
			if (request.message?.params?.name === "late-404" && request.session === "session-1") {
				late404Started.release();
				await late404.promise;
				response.writeHead(404).end("gone");
				return true;
			}
			if (request.message?.method === "initialize" && fixture.state.initializes === 1) {
				recovering.release();
				await finishRecovery.promise;
			}
			return false;
		});
		const transport = new StreamableHttpTransport({ url: fixture.url, openGetStream: false });
		const client = new McpClient(clientInfo);
		await client.connect(transport);
		const old = client.callTool("old-success");
		const late = client.callTool("late-404");
		await Promise.all([oldSuccessStarted.promise, late404Started.promise]);
		fixture.expire();
		const reads = [client.callTool("read-one"), client.callTool("read-two")];
		await recovering.promise;
		const queued = client.callTool("queued-read");
		finishRecovery.release();
		await Promise.all([...reads, queued]);
		late404.release();
		await late;
		oldSuccess.release();
		await old;
		expect(fixture.state.initializes).toBe(2);
		expect(transport.sessionId).toBe("session-2");
		expect(fixture.state.dispatched.sort()).toEqual(["late-404", "queued-read", "read-one", "read-two"]);
		await client.close();
	});

	it("keeps the old session on a send delayed by token lookup, without resetting a recovered session", async () => {
		const authStarted = gate();
		const releaseAuth = gate();
		let delayNextToken = false;
		const fixture = await sessionServer();
		const transport = new StreamableHttpTransport({
			url: fixture.url,
			openGetStream: false,
			authProvider: {
				token: async () => {
					if (delayNextToken) {
						delayNextToken = false;
						authStarted.release();
						await releaseAuth.promise;
					}
					return "fixture-token";
				},
			},
		});
		const client = new McpClient(clientInfo);
		await client.connect(transport);
		delayNextToken = true;
		const delayed = client.callTool("delayed-auth");
		await authStarted.promise;
		fixture.expire();
		await client.callTool("read-skill");
		releaseAuth.release();
		await delayed;
		expect(fixture.state.initializes).toBe(2);
		expect(
			fixture.state.requests
				.filter((request) => request.message?.params?.name === "delayed-auth")
				.map((request) => request.session),
		).toEqual(["session-1", "session-2"]);
		expect(fixture.state.dispatched).toEqual(["read-skill", "delayed-auth"]);
		await client.close();
	});

	it("retains original deadlines and cancellation while a shared initialize is pending", async () => {
		const recovering = gate();
		const finishRecovery = gate();
		const fixture = await sessionServer(async (request) => {
			if (request.message?.method === "initialize" && fixture.state.initializes === 1) {
				recovering.release();
				await finishRecovery.promise;
			}
			return false;
		});
		const client = new McpClient(clientInfo);
		await client.connect(new StreamableHttpTransport({ url: fixture.url, openGetStream: false }));
		fixture.expire();
		const timedOut = expect(client.callTool("timed-out", {}, { timeoutMs: 100 })).rejects.toMatchObject({
			name: "McpTimeoutError",
		});
		await recovering.promise;
		const controller = new AbortController();
		const aborted = expect(client.callTool("aborted", {}, { signal: controller.signal })).rejects.toMatchObject({
			name: "AbortError",
		});
		const kept = client.callTool("kept");
		controller.abort();
		await Promise.all([aborted, timedOut]);
		finishRecovery.release();
		await kept;
		expect(fixture.state.dispatched).toEqual(["kept"]);
		expect(fixture.state.initializes).toBe(2);
		await client.close();
	});

	it.each([400, 401, 403, 500])("does not reinitialize or replay an HTTP %i failure", async (status) => {
		const fixture = await sessionServer(async (request, response) => {
			if (request.message?.method !== "tools/call") return false;
			response.writeHead(status).end("MCP session expired");
			return true;
		});
		const client = new McpClient(clientInfo);
		await client.connect(new StreamableHttpTransport({ url: fixture.url, openGetStream: false }));
		await expect(client.callTool("read-skill")).rejects.toMatchObject({ status });
		expect(fixture.state.initializes).toBe(1);
		expect(fixture.state.requests.filter((request) => request.message?.method === "tools/call")).toHaveLength(1);
		await client.close();
	});

	it("never treats an inner RPC or tool error string as an outer HTTP 404", async () => {
		const fixture = await sessionServer(async (request, response) => {
			if (request.message?.params?.name === "rpc-error") {
				response.writeHead(200, { "content-type": "application/json" });
				response.end(
					JSON.stringify({
						jsonrpc: "2.0",
						id: request.message.id,
						error: { code: -32603, message: "MCP session expired" },
					}),
				);
				return true;
			}
			if (request.message?.params?.name === "tool-error") {
				result(response, request.message, {
					isError: true,
					content: [{ type: "text", text: "MCP session expired" }],
				});
				return true;
			}
			return false;
		});
		const client = new McpClient(clientInfo);
		await client.connect(new StreamableHttpTransport({ url: fixture.url, openGetStream: false }));
		await expect(client.callTool("rpc-error")).rejects.toMatchObject({ name: "McpError", code: -32603 });
		await expect(client.callTool("tool-error")).resolves.toMatchObject({ isError: true });
		expect(fixture.state.initializes).toBe(1);
		expect(fixture.state.requests.filter((request) => request.message?.method === "tools/call")).toHaveLength(2);
		await client.close();
	});

	it("does not replay a possibly executed call after its HTTP acknowledgement is lost", async () => {
		const fixture = await sessionServer(async (request, response) => {
			if (request.message?.method !== "tools/call") return false;
			fixture.state.dispatched.push("write-fixture");
			response.destroy();
			return true;
		});
		const client = new McpClient(clientInfo);
		await client.connect(new StreamableHttpTransport({ url: fixture.url, openGetStream: false }));
		await expect(client.callTool("write-fixture")).rejects.toBeInstanceOf(TypeError);
		expect(fixture.state.initializes).toBe(1);
		expect(fixture.state.dispatched).toEqual(["write-fixture"]);
		expect(fixture.state.requests.filter((request) => request.message?.method === "tools/call")).toHaveLength(1);
		await client.close();
	});

	it("does not replay a possibly executed call when SSE resumption gets HTTP 404", async () => {
		const fixture = await sessionServer(async (request, response) => {
			if (request.method === "GET" && request.lastEventId) {
				response.writeHead(404).end("gone");
				return true;
			}
			if (request.message?.method !== "tools/call") return false;
			fixture.state.dispatched.push("write-fixture");
			response.writeHead(200, { "content-type": "text/event-stream" });
			response.end("id: pending\nretry: 0\ndata:\n\n");
			return true;
		});
		const client = new McpClient(clientInfo);
		await client.connect(new StreamableHttpTransport({ url: fixture.url, openGetStream: false }));
		await expect(client.callTool("write-fixture")).rejects.toThrow("MCP response stream failed: MCP session expired");
		expect(fixture.state.initializes).toBe(1);
		expect(fixture.state.dispatched).toEqual(["write-fixture"]);
		expect(fixture.state.requests.filter((request) => request.message?.method === "tools/call")).toHaveLength(1);
		await client.close();
	});

	it("bounds recovery to one retry when the replacement session is also rejected", async () => {
		const fixture = await sessionServer(async (request, response) => {
			if (request.message?.method !== "tools/call") return false;
			response.writeHead(404).end("gone");
			return true;
		});
		const client = new McpClient(clientInfo);
		await client.connect(new StreamableHttpTransport({ url: fixture.url, openGetStream: false }));
		await expect(client.callTool("read-skill")).rejects.toBeInstanceOf(McpSessionExpiredError);
		expect(fixture.state.initializes).toBe(2);
		expect(fixture.state.requests.filter((request) => request.message?.method === "tools/call")).toHaveLength(2);
		await client.close();
	});

	it("does not recover an initial headerless 404 and preserves failed reinitialization provenance", async () => {
		let rejectInitial = true;
		const fixture = await sessionServer(async (request, response) => {
			if (request.message?.method !== "initialize") return false;
			if (rejectInitial || fixture.state.initializes === 1) {
				response.writeHead(rejectInitial ? 404 : 401).end("fixture rejection");
				return true;
			}
			return false;
		});
		const initial = new McpClient(clientInfo);
		await expect(
			initial.connect(new StreamableHttpTransport({ url: fixture.url, openGetStream: false })),
		).rejects.toMatchObject({ name: "McpHttpError", status: 404 });
		expect(fixture.state.requests.filter((request) => request.message?.method === "initialize")).toHaveLength(1);
		rejectInitial = false;
		const client = new McpClient(clientInfo);
		await client.connect(new StreamableHttpTransport({ url: fixture.url, openGetStream: false }));
		fixture.expire();
		await expect(client.callTool("read-skill")).rejects.toMatchObject({ name: "McpAuthRequiredError", status: 401 });
		expect(client.connectionState).toBe("closed");
		expect(fixture.state.dispatched).toEqual([]);
	});

	it("refreshes OAuth on 401, then independently replaces a 404 session without another authorization", async () => {
		let token = "old-fixture-token";
		let authorizations = 0;
		const fixture = await sessionServer(async (request, response) => {
			if (request.message?.method === "tools/call" && request.authorization === "Bearer old-fixture-token") {
				response.writeHead(401, { "www-authenticate": "Bearer" }).end();
				return true;
			}
			return false;
		});
		const client = new McpClient(clientInfo);
		await client.connect(
			new StreamableHttpTransport({
				url: fixture.url,
				openGetStream: false,
				authProvider: {
					token: async () => token,
					onUnauthorized: async () => {
						authorizations++;
						token = "fresh-fixture-token";
					},
				},
			}),
		);
		fixture.expire();
		await client.callTool("read-skill");
		expect(authorizations).toBe(1);
		expect(fixture.state.initializes).toBe(2);
		expect(
			fixture.state.requests
				.filter((request) => request.message?.method === "tools/call")
				.map((request) => request.session),
		).toEqual(["session-1", "session-1", "session-2"]);
		expect(fixture.state.dispatched).toEqual(["read-skill"]);
		await client.close();
	});

	it("aborts the expired background GET and opens a fresh stream without its old cursor", async () => {
		const firstEvent = gate();
		const firstClosed = gate();
		const secondGet = gate();
		const fixture = await sessionServer(async (request, response) => {
			if (request.method !== "GET") return false;
			response.writeHead(200, { "content-type": "text/event-stream" });
			if (request.session === "session-1") {
				response.on("close", firstClosed.release);
				response.write(`id: old-cursor\ndata: ${JSON.stringify({ jsonrpc: "2.0", method: "fixture/ready" })}\n\n`);
			} else {
				response.write(": fresh stream\n\n");
				secondGet.release();
			}
			return true;
		});
		const client = new McpClient(clientInfo);
		client.onNotification("fixture/ready", firstEvent.release);
		await client.connect(new StreamableHttpTransport({ url: fixture.url }));
		await firstEvent.promise;
		fixture.expire();
		await client.callTool("read-skill");
		await Promise.all([firstClosed.promise, secondGet.promise]);
		expect(
			fixture.state.requests
				.filter((request) => request.method === "GET")
				.map((request) => ({ session: request.session, lastEventId: request.lastEventId })),
		).toEqual([
			{ session: "session-1", lastEventId: undefined },
			{ session: "session-2", lastEventId: undefined },
		]);
		await client.close();
	});
});
