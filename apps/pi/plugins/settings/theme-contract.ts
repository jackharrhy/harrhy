import { int, nul, obj, str, union } from "@earendil-works/pi-schema";
import { method, remote, serverHost } from "@p2/app/v1";

export const MAX_LOGO_BYTES = 500_000;
export const MAX_LOGO_BASE64_LENGTH = 4 * Math.ceil(MAX_LOGO_BYTES / 3);
export const MAX_NAME_LENGTH = 40;
export const PNG_DATA_URL_PREFIX = "data:image/png;base64,";

const tint = union([int({ minimum: 0, maximum: 359 }), nul()]);
const logo = union([
	str({
		pattern: `^${PNG_DATA_URL_PREFIX}[A-Za-z0-9+/]+={0,2}$`,
		maxLength: PNG_DATA_URL_PREFIX.length + MAX_LOGO_BASE64_LENGTH,
	}),
	nul(),
]);
const name = union([str({ minLength: 1, maxLength: MAX_NAME_LENGTH }), nul()]);
export const themeState = { tint, logo, name };
export const themeMethods = {
	setTint: method(obj({ tint })),
	setLogo: method(obj({ base64: str({ minLength: 4, maxLength: MAX_LOGO_BASE64_LENGTH }) })),
	clearLogo: method(),
	setName: method(obj({ name })),
};

export const ThemeBranding = remote("p2.theme-branding", {
	version: 2,
	params: {},
	hostAddress: serverHost,
	variants: { owner: { state: themeState, methods: themeMethods } },
});
