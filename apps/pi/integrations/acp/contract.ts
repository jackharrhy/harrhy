import { obj, str } from "@earendil-works/pi-schema";
import { method, remote, serverHost } from "@p2/app/v1";

export const AcpPrompt = str({ minLength: 1, maxLength: 12_000 });

export const Acp = remote("p2.acp", {
	version: 1,
	params: {},
	hostAddress: serverHost,
	variants: {
		worker: {
			methods: {
				prompt: method(obj({ cwd: str({ maxLength: 4096 }), prompt: AcpPrompt }), str()),
			},
		},
	},
});
