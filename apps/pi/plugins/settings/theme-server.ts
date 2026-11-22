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

const SVG_TAG = /<svg[\s>]/i;
// An SVG is only ever drawn to PNG here, never served. These could still pull in other files or the network.
const UNSAFE_SVG = /<!ENTITY|<!DOCTYPE|<script|<foreignObject|<image|<use|(?:xlink:)?href\s*=\s*["'](?!#)|url\(\s*["']?(?!#)/i;

function looksLikeSvg(input: Buffer): boolean {
	return SVG_TAG.test(input.toString("utf8", 0, 2048));
}

async function rasterizeSvg(input: Buffer): Promise<string> {
	const text = input.toString("utf8");
	if (UNSAFE_SVG.test(text)) {
		throw invalid("args", "The SVG may not contain images, scripts, external references or entities");
	}
	const { default: sharp }: typeof import("sharp") = await import(codec);
	let png: Buffer;
	try {
		png = await sharp(input, { limitInputPixels: 4096 ** 2, density: 288, failOn: "warning" })
			.resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside" })
			.png()
			.toBuffer();
	} catch {
		throw invalid("args", "Logo must be a valid SVG");
	}
	if (png.length > MAX_LOGO_BYTES) throw invalid("args", "The resulting PNG exceeds 500,000 bytes");
	return PNG_DATA_URL_PREFIX + png.toString("base64");
}

export async function normalizeLogo(base64: string): Promise<string> {
	if (base64.length > MAX_LOGO_BASE64_LENGTH || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
		throw invalid("args", "Provide a base64 logo of at most 500,000 bytes");
	}
	const input = Buffer.from(base64, "base64");
	if (input.length > MAX_LOGO_BYTES || input.toString("base64") !== base64) {
		throw invalid("args", "Provide a base64 logo of at most 500,000 bytes");
	}

	if (looksLikeSvg(input)) return rasterizeSvg(input);

	// Reject other formats before invoking sharp.
	const format = input.subarray(0, 8).equals(PNG_SIGNATURE) ? "png"
		: input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff ? "jpeg"
		: input.toString("latin1", 0, 4) === "RIFF" && input.toString("latin1", 8, 12) === "WEBP" ? "webp"
		: null;
	if (!format) throw invalid("args", "Logo must be a PNG, JPEG, WebP or SVG image");

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
	// 2: the tab name. Version 1 held the tint and logo only.
	version: 2,
	schema: obj(themeState),
	initial: () => ({ tint: null, logo: null, name: null }),
	migrate: (value) => ({ ...(value as { tint: number | null; logo: string | null }), name: null }),
	persist: true,
	checkpointWhen: () => true,
});

const BrandingStore = local("p2.theme-branding-store", {
	version: 2,
	params: {},
	members: { ...themeState, ...themeMethods },
});

export function serveThemeBranding(host: FacetHost): void {
	host.serve(BrandingStore, (_params, self) => {
		const state = self.state(BrandingState);
		return {
			tint: deriveTyped(self, [state], ([value]) => value.tint),
			logo: deriveTyped(self, [state], ([value]) => value.logo),
			name: deriveTyped(self, [state], ([value]) => value.name),
			setName: async ({ name }, ctx) => {
				await state.change((draft) => {
					draft.name = name?.trim() || null;
				}, ctx);
				return null;
			},
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
				name: store.name,
				setName: (args, ctx) => store.setName(args, ctx),
				setTint: (args, ctx) => store.setTint(args, ctx),
				setLogo: (args, ctx) => store.setLogo(args, ctx),
				clearLogo: (ctx) => store.clearLogo(ctx),
			},
		};
	});
}
