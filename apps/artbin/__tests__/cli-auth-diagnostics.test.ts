import { expect, test, vi } from "vitest";

import { identityFetch } from "./identity-fixture.ts";
import { createRouterHarness, router } from "./router-harness.ts";

test("CLI login reports only bounded outcomes without changing handoff or redemption", async () => {
  const harness = await createRouterHarness();
  const lines: string[] = [];
  const capture = (...args: unknown[]) => lines.push(args.join(" "));
  for (const level of ["info", "warn", "error", "log"] as const) {
    vi.spyOn(console, level).mockImplementation(capture);
  }
  vi.stubGlobal("fetch", identityFetch());
  async function start() {
    const response = await router.fetch(
      harness.request("/auth/cli/authorize?port=43217"),
    );
    expect(response.status).toBe(302);
    const provider = new URL(response.headers.get("Location")!);
    const cookie = response.headers.get("Set-Cookie")!.split(";")[0]!;
    return {
      provider,
      cookie,
      callback: `/auth/cli/callback?state=${provider.searchParams.get("state")}`,
    };
  }
  function redeem(code: string) {
    return router.fetch(
      harness.request("/auth/cli/redeem", undefined, {
        method: "POST",
        body: JSON.stringify({ code }),
      }),
    );
  }
  try {
    expect(
      (
        await router.fetch(
          harness.request("/auth/cli/authorize?port=not-a-port"),
        )
      ).status,
    ).toBe(400);
    const first = await start();
    const rejected = await router.fetch(
      harness.request(
        first.callback + "&error=synthetic-provider-detail",
        first.cookie,
      ),
    );
    expect(rejected.status).toBe(400);
    expect(await rejected.text()).toBe(
      "OAuth error: synthetic-provider-detail",
    );

    vi.stubGlobal("fetch", identityFetch());
    const second = await start();
    vi.stubGlobal("fetch", () => {
      throw new Error("synthetic-sensitive-exchange-failure");
    });
    const failed = await router.fetch(
      harness.request(
        second.callback + "&code=synthetic-oauth-code",
        second.cookie,
      ),
    );
    expect(failed.status).toBe(500);
    expect(await failed.text()).toBe("OAuth callback failed");

    vi.stubGlobal("fetch", identityFetch());
    const third = await start();
    vi.stubGlobal(
      "fetch",
      identityFetch(third.provider.searchParams.get("nonce")!),
    );
    const handedOff = await router.fetch(
      harness.request(
        third.callback + "&code=synthetic-oauth-code",
        third.cookie,
      ),
    );
    expect(handedOff.status).toBe(302);
    const loopback = new URL(handedOff.headers.get("Location")!);
    expect(loopback.origin).toBe("http://127.0.0.1:43217");
    const code = loopback.searchParams.get("code")!;
    const success = await redeem(code);
    expect(success.status).toBe(200);
    expect(await success.json()).toEqual({ session: expect.any(String) });
    expect((await redeem(code)).status).toBe(400);

    expect(lines.map((line) => JSON.parse(line))).toEqual(
      [
        ["authorize", "invalid_request"],
        ["authorize", "ok"],
        ["callback", "provider_error"],
        ["authorize", "ok"],
        ["callback", "ok"],
        ["exchange", "failed"],
        ["authorize", "ok"],
        ["callback", "ok"],
        ["exchange", "ok"],
        ["handoff", "ok"],
        ["redeem", "ok"],
        ["redeem", "invalid_grant"],
      ].map(([phase, outcome]) => ({
        event: "artbin_cli_auth",
        phase,
        outcome,
      })),
    );
  } finally {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    harness.close();
  }
});
