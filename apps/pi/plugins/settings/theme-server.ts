import { Buffer } from "node:buffer";
import { obj } from "@earendil-works/pi-schema";
import { defineState, deriveTyped, type FacetHost, forbidden, invalid, isOwner, local } from "@p2/app/v1";
import {
	MAX_LOGO_BASE64_LENGTH,
	MAX_LOGO_BYTES,
	PNG_DATA_URL_PREFIX,
	ThemeBranding,
	themeMethods,
	themeState,
} from "./theme-contract.ts";

const MAX_DIMENSION = 512;
// Load the native codec only for uploads, through the facet external-package resolver.
const codec = "sharp";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export async function normalizeLogo(base64: string): Promise<string> {
	if (base64.length > MAX_LOGO_BASE64_LENGTH || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
		throw invalid("args", "Provide a base64 logo of at most 500,000 bytes");
	}
	const input = Buffer.from(base64, "base64");
	if (input.length > MAX_LOGO_BYTES || input.toString("base64") !== base64) {
		throw invalid("args", "Provide a base64 logo of at most 500,000 bytes");
	}

	// Reject other formats before invoking sharp (in particular, never sniff arbitrary SVG as an image).
	const format = input.subarray(0, 8).equals(PNG_SIGNATURE) ? "png"
		: input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff ? "jpeg"
		: input.toString("latin1", 0, 4) === "RIFF" && input.toString("latin1", 8, 12) === "WEBP" ? "webp"
		: null;
	if (!format) throw invalid("args", "Logo must be a PNG, JPEG or WebP image");

	const { default: sharp }: typeof import("sharp") = await import(codec);
	let png: Buffer;
	try {
		const image = sharp(input, { limitInputPixels: MAX_DIMENSION ** 2, failOn: "warning" });
		const { format: detected, width, height } = await image.metadata();
		if (detected !== format || width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
			throw new Error("Invalid format or dimensions");
		}
		png = await image.autoOrient().png().toBuffer();
	} catch {
		throw invalid("args", "Logo must be a valid PNG, JPEG or WebP no larger than 512 × 512 pixels");
	}
	if (png.length > MAX_LOGO_BYTES) throw invalid("args", "The resulting PNG exceeds 500,000 bytes");
	return PNG_DATA_URL_PREFIX + png.toString("base64");
}

const BrandingState = defineState("p2.theme-branding-state", {
	version: 1,
	schema: obj(themeState),
	initial: () => ({ tint: null, logo: null }),
	persist: true,
	checkpointWhen: () => true,
});

const BrandingStore = local("p2.theme-branding-store", {
	version: 1,
	params: {},
	members: { ...themeState, ...themeMethods },
});

export function serveThemeBranding(host: FacetHost): void {
	host.serve(BrandingStore, (_params, self) => {
		const state = self.state(BrandingState);
		return {
			tint: deriveTyped(self, [state], ([value]) => value.tint),
			logo: deriveTyped(self, [state], ([value]) => value.logo),
			setTint: async ({ tint }, ctx) => {
				await state.change((draft) => {
					draft.tint = tint;
				}, ctx);
				return null;
			},
			setLogo: async ({ base64 }, ctx) => {
				const logo = await normalizeLogo(base64);
				await state.change((draft) => {
					draft.logo = logo;
				}, ctx);
				return null;
			},
			clearLogo: async (ctx) => {
				await state.change((draft) => {
					draft.logo = null;
				}, ctx);
				return null;
			},
		};
	});

	host.serve(ThemeBranding, (_params, principal, self) => {
		if (!isOwner(principal)) throw forbidden("theme branding is owner-only");
		const store = self.get(BrandingStore, {});
		return {
			variant: "owner",
			members: {
				tint: store.tint,
				logo: store.logo,
				setTint: (args, ctx) => store.setTint(args, ctx),
				setLogo: (args, ctx) => store.setLogo(args, ctx),
				clearLogo: (ctx) => store.clearLogo(ctx),
			},
		};
	});
}
