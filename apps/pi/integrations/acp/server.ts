import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { pluginFile } from "@earendil-works/chord/plugins";
import { compile, obj, str } from "@earendil-works/pi-schema";
import { defineFacet, forbidden, isWorker, signalOf } from "@p2/app/v1";
import { Acp } from "./contract.ts";
import { runAcp } from "./runner.ts";

const trialConfig = compile(obj({ command: str(), workspace: str(), session: str({ minLength: 1 }) }));

async function readTrial(path: string) {
	let content: string;
	try {
		content = await readFile(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw forbidden("ACP could not read its trial configuration");
	}
	let value: unknown;
	try {
		value = JSON.parse(content);
	} catch {
		throw forbidden("ACP trial configuration is not valid JSON");
	}
	if (!trialConfig.check(value)) throw forbidden("ACP trial configuration requires command, workspace and session");
	return value;
}

export default defineFacet((host) => {
	const trialPath = pluginFile("trial.json");
	let busy = false;

	host.serve(Acp, (_params, principal) => {
		if (!isWorker(principal)) throw forbidden("ACP tasks are for session workers");
		return {
			variant: "worker",
			members: {
				prompt: async ({ cwd, prompt }, ctx) => {
					if (!isAbsolute(cwd)) throw forbidden("ACP requires a local workspace");
					if (busy) throw forbidden("An ACP task is already running; try again after it finishes");
					busy = true;
					try {
						const trial = await readTrial(trialPath);
						if (trial && trial.session !== principal.session) throw forbidden("ACP is only enabled in the operator-approved session");
						const command = trial?.command ?? process.env.HARRHY_PI_ACP_AGY;
						const workspace = trial?.workspace ?? process.env.HARRHY_PI_ACP_WORKSPACE;
						if (!command || !workspace || !isAbsolute(command) || !isAbsolute(workspace))
							throw forbidden("ACP is disabled: the operator must configure an absolute Antigravity CLI path and workspace");
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
