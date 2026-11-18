import { afterEach, describe, expect, it, vi } from "vitest";
import { bindLogContext, createLogger, currentLog } from "@harrhy/logger";
import {
  logRequest,
  requestFields,
  errorContext,
  openLinkedJob,
  failOperation,
} from "../app/logging.ts";
import { callRefTool } from "../app/mcp/tools.ts";
import type { AppRuntimeService } from "../app/data/runtime.ts";

function setup(rate = 1) {
  const records: Record<string, unknown>[] = [];
  return {
    records,
    logger: createLogger({
      service: "ref-fixture",
      sample: { rate },
      sink(record) {
        records.push(record);
      },
    }),
  };
}
afterEach(() => vi.restoreAllMocks());
const boardId = "c3203347-8c3a-4ee7-99ec-063ed8794008";

describe("Ref completion events", () => {
  it("captures ordinary query values and resource identity, excluding credentials and private payloads", async () => {
    const fixture = setup();
    const response = await logRequest(
      new Request(
        `https://ref.example/api/boards/${boardId}/snapshot?sort=newest&token_count=2&tag=a&tag=b&session_key=PRIVATE_KEY&auth_code=PRIVATE_AUTH_CODE&other=PRIVATE_AUTH&alias=PRIVATE_COOKIE&code=PRIVATE_CODE&state=PRIVATE_STATE&access_token=PRIVATE_TOKEN&code_verifier=PRIVATE_PKCE&session=PRIVATE_SESSION&payload=PRIVATE_BODY&url=${encodeURIComponent("https://example.test/photo?X-Amz-Signature=PRIVATE_SIGNATURE")}`,
        {
          headers: {
            Cookie: "ref_session=PRIVATE_COOKIE",
            Authorization: "Bearer PRIVATE_AUTH",
            "X-Request-Id": "upstream_1",
          },
        },
      ),
      async () => {
        currentLog()?.set({ "boards.count": 2 });
        return Response.json({ private: "PRIVATE_RESPONSE" });
      },
      fixture,
    );
    expect(fixture.records).toHaveLength(1);
    const event = fixture.records[0]!;
    expect(event).toMatchObject({
      "http.route": "/api/boards/:boardId/snapshot",
      "http.method": "GET",
      "http.status": 200,
      "resource.boardId": boardId,
      "http.query.sort": "newest",
      "http.query.token_count": "2",
      "http.query.tag": '["a","b"]',
      "boards.count": 2,
      outcome: "ok",
      upstream_request_id: "upstream_1",
    });
    expect(response.headers.get("X-Request-Id")).toBe(event.request_id);
    expect(event.request_id).not.toBe("upstream_1");
    expect(JSON.stringify(event)).not.toContain("PRIVATE_");
    expect(await response.json()).toEqual({ private: "PRIVATE_RESPONSE" });
  });

  it("keeps returned 4xx/5xx at zero success sampling and preserves response semantics", async () => {
    const fixture = setup(0);
    for (const status of [303, 401, 404, 503]) {
      const response = await logRequest(
        new Request("https://ref.example/auth/login"),
        async () =>
          new Response(null, {
            status,
            headers: {
              Location: "/",
              "WWW-Authenticate": "Bearer fixture",
              "Set-Cookie": "fixture=PRIVATE_COOKIE",
            },
          }),
        fixture,
      );
      expect(response.status).toBe(status);
      expect(response.headers.get("Location")).toBe("/");
      expect(response.headers.get("Set-Cookie")).toBe("fixture=PRIVATE_COOKIE");
    }
    expect(
      fixture.records.map((record) => [record["http.status"], record.outcome]),
    ).toEqual([
      [401, "degraded"],
      [404, "degraded"],
      [503, "error"],
    ]);
  });

  it("keeps useful exception diagnostics and redacts actual request/host secrets", async () => {
    const fixture = setup();
    const response = await logRequest(
      new Request("https://ref.example/ready?code=PRIVATE_CODE", {
        headers: {
          Authorization: "Bearer PRIVATE_AUTH",
          Cookie: "ref_session=PRIVATE_COOKIE",
        },
      }),
      async () => {
        throw new Error(
          "Store timed out PRIVATE_CODE PRIVATE_AUTH PRIVATE_COOKIE PRIVATE_HOST https://host.test/check?token=PRIVATE_URL",
        );
      },
      { ...fixture, privateValues: ["PRIVATE_HOST"] },
    );
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Internal Server Error");
    expect(fixture.records[0]).toMatchObject({
      "http.status": 500,
      outcome: "error",
      "error.type": "Error",
    });
    expect(fixture.records[0]!["error.message"]).toContain("Store timed out");
    expect(fixture.records[0]!["error.stack"]).toContain("logging.test.ts");
    expect(JSON.stringify(fixture.records)).not.toContain("PRIVATE_");
  });

  it("MCP business errors remain errors at HTTP 200 without logging tool inputs or result snapshots", async () => {
    const fixture = setup(0);
    await logRequest(
      new Request("https://ref.example/mcp", { method: "POST" }),
      async () => {
        const result = await callRefTool(
          {} as AppRuntimeService,
          { subject: "actor_fixture", canRead: true, canWrite: true },
          "board_create",
          { title: "" },
          "https://ref.example",
        );
        return Response.json(result);
      },
      fixture,
    );
    expect(fixture.records).toHaveLength(1);
    expect(fixture.records[0]).toMatchObject({
      "http.status": 200,
      outcome: "degraded",
      "mcp.method": "tools/call",
      "mcp.tool": "board_create",
      "mcp.outcome": "error",
      "actor.id": "actor_fixture",
    });
    expect(fixture.records[0]).not.toHaveProperty("title");
  });

  it("MCP caught dependency errors retain safe cause and original masked protocol result", async () => {
    const fixture = setup();
    const runtime = {
      directory: {
        listBoards() {
          throw new Error("Directory unavailable");
        },
      },
    } as unknown as AppRuntimeService;
    const response = await logRequest(
      new Request("https://ref.example/mcp", { method: "POST" }),
      async () =>
        Response.json(
          await callRefTool(
            runtime,
            { subject: "actor_fixture", canRead: true, canWrite: false },
            "boards_list",
            {},
            "https://ref.example",
          ),
        ),
      fixture,
    );
    expect(((await response.json()) as { isError: boolean }).isError).toBe(
      true,
    );
    expect(fixture.records[0]).toMatchObject({
      outcome: "error",
      "http.status": 200,
      "mcp.outcome": "error",
    });
    expect(fixture.records[0]!["error.stack"]).toContain(
      "Directory unavailable",
    );
  });

  it("does not turn stream preparation into a fabricated delivery status or replace upgrade capability", async () => {
    const fixture = setup();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("prepared"));
      },
    });
    const response = await logRequest(
      new Request("https://ref.example/media/a/b"),
      async () => new Response(stream),
      fixture,
    );
    expect(fixture.records[0]).toMatchObject({
      "http.status": 200,
      "http.completion": "response",
    });
    await response.body!.cancel();
    expect(fixture.records).toHaveLength(1);
    const upgrade = {
      status: 101,
      headers: new Headers(),
      webSocket: { capability: true },
    } as unknown as Response;
    expect(
      await logRequest(
        new Request(`https://ref.example/api/boards/${boardId}/ws`),
        async () => upgrade,
        fixture,
      ),
    ).toBe(upgrade);
    expect(fixture.records[1]).toMatchObject({
      "http.status": 101,
      "http.completion": "upgrade",
    });
  });

  it("bounds query enrichment and rejects hostile upstream IDs without changing app results", async () => {
    const query = new URLSearchParams(
      Array.from({ length: 40 }, (_, n) => [`field${n}`, "x".repeat(600)]),
    );
    const fields = requestFields(
      new Request(`https://ref.example/?${query}`, {
        headers: { "X-Request-Id": "attacker ".repeat(100) },
      }),
    );
    expect(fields).not.toHaveProperty("upstream_request_id");
    expect(fields["http.query.truncated"]).toBe(1);
    expect(String(fields["http.query.field0"]).length).toBe(512);
    const fixture = createLogger({
      service: "ref-fixture",
      sink() {
        throw new Error("sink unavailable");
      },
    });
    const response = await logRequest(
      new Request("https://ref.example/health"),
      async () => Response.json({ ok: true }),
      { logger: fixture },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

it("MCP revision conflicts retain their business outcome without logging snapshots", async () => {
  const fixture = setup(0);
  const id = "c3203347-8c3a-4ee7-99ec-063ed8794008";
  const runtime = {
    directory: { board: async () => ({ id }) },
    board: () => ({
      submitOperation: async () => ({
        type: "rejected",
        reason: "revision_conflict",
        snapshot: { private: "PRIVATE_BOARD_CONTENT" },
      }),
    }),
  } as unknown as AppRuntimeService;
  await logRequest(
    new Request("https://ref.example/mcp", { method: "POST" }),
    async () =>
      Response.json(
        await callRefTool(
          runtime,
          { subject: "actor_fixture", canRead: true, canWrite: true },
          "item_remove",
          { boardId: id, operationId: id, itemId: id, baseRevision: 1 },
          "https://ref.example",
        ),
      ),
    fixture,
  );
  expect(fixture.records[0]).toMatchObject({
    "mcp.outcome": "error",
    "http.status": 200,
    outcome: "degraded",
    "operation.id": id,
  });
  expect(JSON.stringify(fixture.records)).not.toContain(
    "PRIVATE_BOARD_CONTENT",
  );
});

it("scrubs decoded Ref PKCE transaction values and quoted credential assignments, preserving safe causes", async () => {
  const fixture = setup();
  const transaction = btoa(
    JSON.stringify({
      verifier: "PRIVATE_VERIFIER",
      codeVerifier: "PRIVATE_PKCE",
      nonce: "PRIVATE_NONCE",
      state: "PRIVATE_STATE",
    }),
  );
  await logRequest(
    new Request("https://ref.example/auth/callback", {
      headers: { Cookie: `ref_oauth_fixture=${transaction}` },
    }),
    async () => {
      throw new Error(
        "Exchange failed PRIVATE_VERIFIER PRIVATE_PKCE PRIVATE_NONCE PRIVATE_STATE",
        { cause: new Error("Issuer connection reset") },
      );
    },
    fixture,
  );
  expect(JSON.stringify(fixture.records)).not.toContain("PRIVATE_");
  expect(fixture.records[0]).toHaveProperty(
    "error.cause",
    "Issuer connection reset",
  );
  expect(
    JSON.stringify(
      errorContext(
        new Error(
          'Exchange failed {"access_token":"PRIVATE_RETURNED_TOKEN","code_verifier":"PRIVATE_RETURNED_PKCE"}',
        ),
      ),
    ),
  ).not.toContain("PRIVATE_");
});

it("concurrent deferred tool jobs and nested jobs inherit only their own request context", async () => {
  const records: Record<string, unknown>[] = [];
  for (const method of ["log", "warn", "error"] as const)
    vi.spyOn(console, method).mockImplementation((line) =>
      records.push(JSON.parse(String(line))),
    );
  const fixture = setup();
  const callbacks: (() => Promise<void>)[] = [];
  const responses = await Promise.all(
    ["FIRST_SECRET", "SECOND_SECRET"].map((secret) =>
      logRequest(
        new Request(`https://ref.example/mcp?code=${secret}`),
        async () => {
          callbacks.push(
            bindLogContext(() =>
              openLinkedJob({ operation: "fixture.tool" }).run(async () => {
                await Promise.resolve();
                await openLinkedJob({ operation: "fixture.nested" }).run(() => {
                  failOperation(new Error(`Dependency failed ${secret}`));
                });
                failOperation(new Error(`Tool failed ${secret}`));
              }),
            ),
          );
          return new Response("stream prepared");
        },
        fixture,
      ),
    ),
  );
  expect(fixture.records).toHaveLength(2);
  expect(records).toHaveLength(0);
  await Promise.all(callbacks.toReversed().map((callback) => callback()));
  expect(records).toHaveLength(4);
  for (const response of responses) {
    const events = records.filter(
      (record) => record.request_id === response.headers.get("X-Request-Id"),
    );
    expect(events).toHaveLength(2);
    expect(
      events
        .map((record) => String(record.operation))
        .toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(["fixture.nested", "fixture.tool"]);
    expect(
      events.every(
        (record) => record.kind === "job" && record.outcome === "error",
      ),
    ).toBe(true);
  }
  expect(JSON.stringify(records)).not.toMatch(/FIRST_SECRET|SECOND_SECRET/);
  expect(currentLog()).toBeUndefined();
  expect(() => failOperation(new Error("no active operation"))).not.toThrow();
});
