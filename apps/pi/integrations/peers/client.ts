// Calling a peer: HTTP on a loopback port that SSH forwards to the peer's Pi. The `Host` must be the peer's own port, which
// is what its loopback check wants; connections are kept alive, since one link carries many calls.
import { Agent, request } from "node:http";
import { PREFIX } from "./protocol.ts";

/** Where a peer's Pi answers from here: a loopback port, and the port the peer itself listens on. */
export type Endpoint = { readonly port: number; readonly hostPort: number };

export type PeerResponse = { readonly status: number; readonly body: unknown };

const agent = new Agent({
	keepAlive: true,
	maxSockets: 8,
	keepAliveMsecs: 30_000,
});

/** One call. `auth` carries this instance's id and the token the peer gave it; none for `hello` and requests. */
export function call(
	endpoint: Endpoint,
	method: "GET" | "POST",
	path: string,
	options: {
		auth?: { instanceId: string; token: string };
		body?: unknown;
		timeoutMs?: number;
		signal?: AbortSignal;
	} = {},
): Promise<PeerResponse> {
	const payload =
		options.body === undefined
			? undefined
			: Buffer.from(JSON.stringify(options.body));
	return new Promise((resolve, reject) => {
		const outgoing = request(
			{
				agent,
				host: "127.0.0.1",
				port: endpoint.port,
				method,
				path: PREFIX + path,
				headers: {
					Host: `127.0.0.1:${endpoint.hostPort}`,
					Accept: "application/json",
					...(payload === undefined
						? {}
						: {
								"Content-Type": "application/json",
								"Content-Length": payload.length,
							}),
					...(options.auth === undefined
						? {}
						: {
								Authorization: `Bearer ${options.auth.token}`,
								"X-Pi-Peer": options.auth.instanceId,
							}),
				},
				timeout: options.timeoutMs ?? 15_000,
				signal: options.signal,
			},
			(response) => {
				const chunks: Buffer[] = [];
				let size = 0;
				response.on("data", (chunk: Buffer) => {
					size += chunk.length;
					if (size > 1024 * 1024)
						outgoing.destroy(new Error("The peer's answer is too large"));
					else chunks.push(chunk);
				});
				response.on("end", () => {
					const text = Buffer.concat(chunks).toString("utf8");
					let body: unknown = text;
					try {
						body = text ? JSON.parse(text) : undefined;
					} catch {}
					resolve({ status: response.statusCode ?? 0, body });
				});
				response.on("error", reject);
			},
		);
		outgoing.on("timeout", () =>
			outgoing.destroy(new Error("The peer did not answer in time")),
		);
		outgoing.on("error", reject);
		outgoing.end(payload);
	});
}
