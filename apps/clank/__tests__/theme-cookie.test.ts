import assert from "node:assert/strict";
import { test } from "node:test";
import { readThemeCookie, themeCookie } from "../owner/theme-cookie.ts";

const name = "__Host-clank-theme";

test("writes a host-only, browser-writable one-year preference for all three modes", () => {
  for (const mode of ["system", "light", "dark"] as const) {
    assert.equal(
      themeCookie(mode),
      `${name}=${mode}; Path=/; Secure; SameSite=Lax; Max-Age=31536000`,
    );
    assert.equal(readThemeCookie(`a=b=c;\t${name}=${mode}; other=x`), mode);
  }
});

test("only a single exact plain preference counts", () => {
  for (const header of [
    undefined,
    `other=${name}=dark; ${name}-extra=light`,
    `${name}`,
    `${name}=`,
    `${name}=Dark`,
    `${name}="dark"`,
    `${name}=%64ark`,
    `${name}=dark=`,
    `${name}=dark `,
    `${name}= light`,
    `${name}=dark; ${name}=dark`,
    `${name}=light; ${name}=system`,
    `${name}; ${name}=dark`,
    `${name}=system; ${name} =dark`,
    `${name}=unknown; ${name}=light`,
  ]) {
    assert.equal(readThemeCookie(header), undefined, String(header));
  }
});
