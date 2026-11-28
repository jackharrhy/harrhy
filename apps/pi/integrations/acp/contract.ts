import { obj, opt, str, union } from "@earendil-works/pi-schema";
import { literal, method, remote, serverHost } from "@p2/app/v1";

export const AcpTaskFields = {
	prompt: str({ minLength: 1, maxLength: 12_000 }),
	agent: opt(union([literal("antigravity"), literal("cursor")])),
	mode: opt(union([literal("ask"), literal("plan"), literal("agent")])),
	model: opt(str({ minLength: 1, maxLength: 200, description: "Cursor model ID; optional. Antigravity uses its current model." })),
};

export const Acp = remote("p2.acp", {
	version: 3,
	params: {},
	hostAddress: serverHost,
	variants: {
		worker: {
			methods: {
				prompt: method(obj({ cwd: str({ maxLength: 4096 }), ...AcpTaskFields }), str()),
			},
		},
	},
});
