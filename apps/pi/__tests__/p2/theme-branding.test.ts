import assert from "node:assert/strict";
import { test } from "node:test";
import { compile, obj } from "@earendil-works/pi-schema";
import sharp from "sharp";
import { MAX_LOGO_BASE64_LENGTH, MAX_LOGO_BYTES, PNG_DATA_URL_PREFIX, themeState } from "../../plugins/settings/theme-contract.ts";
import { normalizeLogo } from "../../plugins/settings/theme-server.ts";

const image = (width: number) => sharp({ create: { width, height: 2, channels: 3, background: "red" } });

test("theme branding stores a nullable integer hue in the full 0–359 range", () => {
	const state = compile(obj(themeState));
	for (const tint of [null, 0, 359]) assert.equal(state.check({ tint, logo: null }), true);
	for (const tint of [-1, 360, 10.5, "15"]) assert.equal(state.check({ tint, logo: null }), false);
});

test("logo upload decodes PNG, JPEG and WebP and returns a PNG", async () => {
	for (const format of ["png", "jpeg", "webp"] as const) {
		const input = await image(512).toFormat(format).toBuffer();
		const logo = await normalizeLogo(input.toString("base64"));
		assert.ok(logo.startsWith(PNG_DATA_URL_PREFIX));
		const output = Buffer.from(logo.slice(PNG_DATA_URL_PREFIX.length), "base64");
		const { format: actual, width, height } = await sharp(output).metadata();
		assert.deepEqual({ actual, width, height }, { actual: "png", width: 512, height: 2 });
	}
});

test("logo upload rejects unsupported, corrupt, noncanonical and oversized input", async () => {
	const valid = await image(10).png().toBuffer();
	const oversized = Buffer.concat([valid, Buffer.alloc(MAX_LOGO_BYTES + 1 - valid.length)]).toString("base64");
	assert.equal(oversized.length, MAX_LOGO_BASE64_LENGTH);
	await assert.rejects(normalizeLogo(oversized), /500,000 bytes/);
	await assert.rejects(normalizeLogo("A".repeat(MAX_LOGO_BASE64_LENGTH + 1)), /500,000 bytes/);
	await assert.rejects(normalizeLogo(valid.toString("base64") + "\n"), /base64/);
	await assert.rejects(normalizeLogo(Buffer.from("<svg/>").toString("base64")), /PNG, JPEG or WebP/);
	await assert.rejects(normalizeLogo(valid.subarray(0, 34).toString("base64")), /valid PNG/);
	await assert.rejects(normalizeLogo((await image(513).png().toBuffer()).toString("base64")), /512/);
});
