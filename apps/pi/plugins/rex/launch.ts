// Rex-owned entry point: publish the pane's private receipt before starting the existing p2 TUI (no agent creation).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeReceipt } from "./receipt.ts";

try {
	const [path, nonce, hostId, endpoint, sessionId, url, target] = process.argv.slice(2);
	if (!path || !url || !target || process.env.REX_SESSION !== sessionId)
		throw new Error("Rex launch environment does not match the configured target");
	await writeReceipt(path, { nonce, hostId, endpoint, sessionId, blockId: process.env.REX_BLOCK });
	const app = new URL("../../", import.meta.url);
	const child = spawn(
		process.execPath,
		[
			"--import",
			fileURLToPath(new URL("src/source.ts", app)),
			fileURLToPath(new URL("src/hosts/tui.ts", app)),
			url,
			"--session",
			target,
		],
		{ stdio: "inherit" },
	);
	for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) process.once(signal, () => child.kill(signal));
	child.once("error", () => {
		console.error("p2 Rex TUI could not start");
		process.exitCode = 1;
	});
	child.once("exit", (code) => {
		process.exitCode = code ?? 1;
	});
} catch {
	console.error("p2 Rex launch identity could not be recorded safely; no TUI was started");
	process.exitCode = 1;
}
