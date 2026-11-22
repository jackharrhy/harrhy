import assert from "node:assert/strict";
import { test } from "node:test";
import { compile, obj } from "@earendil-works/pi-schema";
import sharp from "sharp";
import { BACKGROUND_CONTEXT, whenLive } from "@p2/app/v1";
import { MAX_LOGO_BASE64_LENGTH, MAX_LOGO_BYTES, PNG_DATA_URL_PREFIX, ThemeBranding, themeState } from "../../plugins/settings/theme-contract.ts";
import { normalizeLogo } from "../../plugins/settings/theme-server.ts";

import { expectChord, startFixture } from "./helpers.ts";

const image = (width: number) => sharp({ create: { width, height: 2, channels: 3, background: "red" } });

test("theme branding stores a nullable integer hue in the full 0–359 range", () => {
	const state = compile(obj(themeState));
	for (const tint of [null, 0, 359]) assert.equal(state.check({ tint, logo: null, name: null }), true);
	for (const tint of [-1, 360, 10.5, "15"]) assert.equal(state.check({ tint, logo: null, name: null }), false);
	for (const name of ["Work Pi", null]) assert.equal(state.check({ tint: null, logo: null, name }), true);
	for (const name of ["", "x".repeat(41), 5]) assert.equal(state.check({ tint: null, logo: null, name }), false);
});

test("theme branding is unavailable to guests even with full session access", async (t) => {
	const fixture = await startFixture();
	t.after(() => fixture.close());
	const guest = fixture.as({ kind: "guest", id: "guest", name: "Guest", home: "fixture", sessions: { fixture: "full" }, revision: 1 });
	const ref = guest.hold(ThemeBranding, {}, BACKGROUND_CONTEXT);
	await expectChord(whenLive(ref), "forbidden");
	ref.release();
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

test("logo upload draws an SVG to a PNG", async () => {
	const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32" viewBox="0 0 64 32"><rect width="64" height="32" fill="#c33"/></svg>';
	const logo = await normalizeLogo(Buffer.from(svg).toString("base64"));
	assert.ok(logo.startsWith(PNG_DATA_URL_PREFIX));
	const { format, width, height } = await sharp(Buffer.from(logo.slice(PNG_DATA_URL_PREFIX.length), "base64")).metadata();
	assert.deepEqual({ format, width, height }, { format: "png", width: 512, height: 256 });
});

test("logo upload rejects unsupported, corrupt, noncanonical and oversized input", async () => {
	const valid = await image(10).png().toBuffer();
	const oversized = Buffer.concat([valid, Buffer.alloc(MAX_LOGO_BYTES + 1 - valid.length)]).toString("base64");
	assert.equal(oversized.length, MAX_LOGO_BASE64_LENGTH);
	await assert.rejects(normalizeLogo(oversized), /500,000 bytes/);
	await assert.rejects(normalizeLogo("A".repeat(MAX_LOGO_BASE64_LENGTH + 1)), /500,000 bytes/);
	await assert.rejects(normalizeLogo(valid.toString("base64") + "\n"), /base64/);
	await assert.rejects(normalizeLogo(Buffer.from("not an image").toString("base64")), /PNG, JPEG, WebP or SVG/);
	await assert.rejects(normalizeLogo(Buffer.from('<svg><image href="file:///etc/passwd"/></svg>').toString("base64")), /may not contain/);
	await assert.rejects(normalizeLogo(Buffer.from("<svg><script>1</script></svg>").toString("base64")), /may not contain/);
	await assert.rejects(normalizeLogo(valid.subarray(0, 34).toString("base64")), /valid PNG/);
	await assert.rejects(normalizeLogo((await image(513).png().toBuffer()).toString("base64")), /512/);
});
