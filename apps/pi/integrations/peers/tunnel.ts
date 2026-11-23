// One SSH connection to a peer's machine, kept up while the peer is linked: a forward to the peer's Pi (this instance calls
// it) and a reverse forward from the peer's loopback to this Pi (the peer calls this instance). The side with the SSH
// login owns the connection and reconnects it; the other side only answers.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { connect, createServer } from "node:net";
import type { Endpoint } from "./client.ts";
import { sshOptions } from "./discovery.ts";

export type LinkState = "up" | "connecting" | "down";

export type TunnelOptions = {
	ssh: string;
	target: string;
	/** The peer's Pi port, on the peer's machine. */
	remotePort: number;
	/** This instance's own Pi port. */
	port: number;
	/** Picks the reverse port: the same pair of instances tries the same ports. */
	seed: string;
	/** The forwards are up: check who answers and set the link up. Resolves to what went wrong, or nothing. */
	up(endpoint: Endpoint, reversePort: number): Promise<string | undefined>;
	/** The state or the error changed. */
	changed(): void;
};

const BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 30_000, 60_000];

const freePort = () =>
	new Promise<number>((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address() as { port: number };
			server.close(() => resolve(port));
		});
	});

const accepts = (port: number) =>
	new Promise<boolean>((resolve) => {
		const socket = connect({ host: "127.0.0.1", port });
		socket.once("connect", () => {
			socket.destroy();
			resolve(true);
		});
		socket.once("error", () => resolve(false));
	});

/**
 * A refused forward reaches the caller as a reset connection. SSH says why on its own stderr: the other machine's SSH
 * server, usually through an authorized_keys option such as `restrict`, does not let this login forward ports.
 */
function explain(
	problem: string | undefined,
	stderr: string,
): string | undefined {
	if (stderr.includes("administratively prohibited"))
		return "The other machine's SSH server does not allow port forwarding for this login (its authorized_keys entry needs port-forwarding, permitopen and permitlisten)";
	return problem;
}

const wait = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms).unref());

export function openTunnel(options: TunnelOptions) {
	let state: LinkState = "connecting";
	let error: string | undefined;
	let endpoint: Endpoint | undefined;
	let stopped = false;
	let child: ReturnType<typeof spawn> | undefined;
	const base =
		20_000 +
		(Number.parseInt(
			createHash("sha256").update(options.seed).digest("hex").slice(0, 6),
			16,
		) %
			20_000);

	const set = (next: LinkState, why?: string) => {
		const changed = state !== next || error !== why;
		state = next;
		error = why;
		if (next !== "up") endpoint = undefined;
		if (changed) options.changed();
	};

	const once = async (
		attempt: number,
	): Promise<{ held: number; remote: boolean }> => {
		const local = await freePort();
		const reverse = base + attempt;
		const stderr: string[] = [];
		child = spawn(
			options.ssh,
			[
				...sshOptions(),
				"-N",
				"-T",
				"-o",
				"ExitOnForwardFailure=yes",
				"-o",
				"ServerAliveInterval=15",
				"-o",
				"ServerAliveCountMax=3",
				"-L",
				`127.0.0.1:${local}:127.0.0.1:${options.remotePort}`,
				"-R",
				`127.0.0.1:${reverse}:127.0.0.1:${options.port}`,
				"--",
				options.target,
			],
			{ stdio: ["ignore", "ignore", "pipe"] },
		);
		const running = child;
		running.stderr?.on("data", (chunk: Buffer) => {
			stderr.push(chunk.toString("utf8"));
			if (stderr.length > 20) stderr.shift();
		});
		const exited = new Promise<number | null>((resolve) =>
			running.once("exit", (code) => resolve(code)),
		);
		let done = false;
		void exited.then(() => {
			done = true;
		});
		const reason = () =>
			stderr.join("").trim().split("\n").filter(Boolean).pop()?.slice(0, 200);
		const started = Date.now();
		while (!done && !(await accepts(local)) && Date.now() - started < 10_000)
			await wait(100);
		let upAt = 0;
		if (!done && (await accepts(local))) {
			const problem = await options
				.up({ port: local, hostPort: options.remotePort }, reverse)
				.catch((cause: unknown) =>
					cause instanceof Error ? cause.message : String(cause),
				);
			if (problem === undefined && !done) {
				endpoint = { port: local, hostPort: options.remotePort };
				upAt = Date.now();
				set("up");
			} else {
				set("down", explain(problem, stderr.join("")) ?? reason());
				running.kill();
			}
		}
		await exited;
		const lines = stderr.join("");
		if (state === "up") set("down", reason() ?? "The SSH connection ended");
		else if (state !== "down")
			set("down", reason() ?? "Could not set up the SSH connection");
		return {
			held: upAt === 0 ? 0 : Date.now() - upAt,
			remote: lines.includes("remote port forwarding failed"),
		};
	};

	void (async () => {
		let failures = 0;
		let attempt = 0;
		while (!stopped) {
			set("connecting", error);
			const { held, remote } = await once(attempt).catch((cause: unknown) => {
				set("down", cause instanceof Error ? cause.message : String(cause));
				return { held: 0, remote: false };
			});
			if (stopped) break;
			if (remote && attempt < 20) {
				attempt++;
				continue;
			}
			failures = held > 30_000 ? 0 : failures + 1;
			await wait(
				BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1] ?? 60_000,
			);
		}
	})();

	return {
		state: () => state,
		error: () => error,
		endpoint: () => endpoint,
		stop() {
			stopped = true;
			child?.kill();
		},
	};
}
export type Tunnel = ReturnType<typeof openTunnel>;
