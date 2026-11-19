// The owner-only read surface for registered preview URLs.
import { arr, bool, num, obj, type Static, str, union } from "@earendil-works/pi-schema";
import { literal, method, remote, serverHost } from "@p2/app/v1";

const PreviewSchema = obj({
	id: str(),
	name: str(),
	url: str(),
	lease: union([
		obj({ kind: literal("unknown") }),
		obj({ kind: literal("none") }),
		obj({ kind: literal("expires"), at: num() }),
	]),
	access: str(),
});
export type Preview = Static<typeof PreviewSchema>;
const PreviewReadSchema = obj({ checked: num(), items: arr(PreviewSchema), failures: arr(str()) });
export type PreviewRead = Static<typeof PreviewReadSchema>;

export const Previews = remote("p2.previews", {
	version: 1,
	params: {},
	hostAddress: serverHost,
	variants: {
		owner: { methods: { list: method(obj({ refresh: bool() }), PreviewReadSchema) } },
	},
});
