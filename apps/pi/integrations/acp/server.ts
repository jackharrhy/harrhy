import { realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { defineFacet, forbidden, isWorker, signalOf } from "@p2/app/v1";
import { Acp } from "./contract.ts";
import { runAcp } from "./runner.ts";

export default defineFacet((host) => {
	const command = process.env.HARRHY_PI_ACP_AGY;
	const workspace = process.env.HARRHY_PI_ACP_WORKSPACE;
	let busy = false;

	host.serve(Acp, (_params, principal) => {
		if (!isWorker(principal)) throw forbidden("ACP tasks are for session workers");
		return {
			variant: "worker",
			members: {
				prompt: async ({ cwd, prompt }, ctx) => {
					if (!command || !workspace || !isAbsolute(command) || !isAbsolute(workspace))
						throw forbidden("ACP is disabled: the operator must configure an absolute Antigravity CLI path and workspace");
					if (!isAbsolute(cwd)) throw forbidden("ACP requires a local workspace");
					if (busy) throw forbidden("An ACP task is already running; try again after it finishes");
					busy = true;
					try {
						const root = await realpath(workspace);
						if ((await realpath(cwd)) !== root || !(await stat(root)).isDirectory())
							throw forbidden("ACP is only enabled from the operator-approved workspace");
						return await runAcp({ command, args: ["acp"], cwd: root, prompt, signal: signalOf(ctx) });
					} finally {
						busy = false;
					}
				},
			},
		};
	});
});
