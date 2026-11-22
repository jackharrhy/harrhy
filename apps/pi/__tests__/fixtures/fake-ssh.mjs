#!/usr/bin/env node
// A stand-in for `ssh` in tests: both "machines" are this one. A command runs locally; -N with -L/-R forwards TCP between
// loopback ports until it is killed. Targets ending in @unknown or @denied fail as SSH would.
import { spawn } from "node:child_process";
import { connect, createServer } from "node:net";

const args = process.argv.slice(2);
const dash = args.indexOf("--");
const target = args[dash + 1] ?? "";
if (target.endsWith("@unknown")) {
	console.error("Host key verification failed.");
	process.exit(255);
}
if (target.endsWith("@denied")) {
	console.error("jack@host: Permission denied (publickey).");
	process.exit(255);
}
const command = args.slice(dash + 2).join(" ");
if (command) {
	spawn("bash", ["-c", command], { stdio: "inherit" }).on("exit", (code) =>
		process.exit(code ?? 1),
	);
} else {
	for (let index = 0; index < dash; index++) {
		if (args[index] !== "-L" && args[index] !== "-R") continue;
		const [, listen, , to] = (args[index + 1] ?? "").split(":");
		createServer((client) => {
			const upstream = connect({ host: "127.0.0.1", port: Number(to) });
			client.pipe(upstream).pipe(client);
			client.on("error", () => upstream.destroy());
			upstream.on("error", () => client.destroy());
		}).listen(Number(listen), "127.0.0.1");
	}
	process.on("SIGTERM", () => process.exit(0));
}
