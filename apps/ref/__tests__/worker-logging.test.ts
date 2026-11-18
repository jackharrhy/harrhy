import { afterEach, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));
import worker, { BoardCell } from "../worker.ts";
import { createLogger, currentLog } from "@harrhy/logger";
import { BoardAssets } from "../app/data/board-assets.ts";

afterEach(() => vi.restoreAllMocks());

it("the real Worker wraps health, early rejection, missing configuration and static failures exactly once", async () => {
  const records: Record<string, unknown>[] = [];
  for (const method of ["log", "warn", "error"] as const)
    vi.spyOn(console, method).mockImplementation((line) => {
      records.push(JSON.parse(String(line)));
    });
  const env = {
    ASSETS: {
      fetch() {
        throw new Error("Asset store unavailable");
      },
    },
  } as unknown as Env;
  for (const [path, status, headers] of [
    ["/health?sort=newest&code=PRIVATE_CODE", 200, {}],
    ["/", 403, { Origin: "https://different.example" }],
    ["/", 503, {}],
    ["/assets/example.js", 500, {}],
  ] as const) {
    const before = records.length;
    const response = await worker.fetch(
      new Request(`https://ref.example${path}`, { headers }),
      env,
    );
    expect(response.status).toBe(status);
    expect(records).toHaveLength(before + 1);
    expect(records.at(-1)).toMatchObject({
      service: "ref",
      "http.status": status,
    });
    expect(response.headers.get("X-Request-Id")).toBe(
      records.at(-1)!.request_id,
    );
  }
  expect(records[0]).toHaveProperty("http.query.sort", "newest");
  expect(JSON.stringify(records)).not.toContain("PRIVATE_CODE");
  expect(records.at(-1)!["error.message"]).toBe("Asset store unavailable");
});

it("a real cleanup alarm emits one bounded retry summary without dumping object keys", async () => {
  const records: Record<string, unknown>[] = [];
  for (const method of ["log", "warn", "error"] as const)
    vi.spyOn(console, method).mockImplementation((line) => {
      records.push(JSON.parse(String(line)));
    });
  const setAlarm = vi.fn().mockResolvedValue(undefined);
  const ctx = {
    blockConcurrencyWhile() {},
    storage: {
      setAlarm,
      getAlarm: async () => null,
      transactionSync: (callback: () => unknown) => callback(),
      sql: {
        exec(query: string) {
          return {
            toArray() {
              return query.includes("board_info")
                ? [{ board_id: "board_fixture" }]
                : query.includes("FROM pending_deletes")
                  ? [{ object_key: "PRIVATE_OBJECT_KEY" }]
                  : [];
            },
          };
        },
      },
    },
  } as unknown as DurableObjectState;
  const env = {
    MEDIA: {
      delete: vi.fn().mockRejectedValue(new Error("Object store unavailable")),
    },
  } as unknown as Env;
  await new BoardCell(ctx, env).alarm();
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    kind: "alarm",
    operation: "ref.assets.cleanup",
    outcome: "degraded",
    "cleanup.pending_count": 1,
    "cleanup.failed_count": 1,
    "retry.scheduled": true,
  });
  expect(records[0]!["error.message"]).toBe("Object store unavailable");
  expect(JSON.stringify(records)).not.toContain("PRIVATE_OBJECT_KEY");
  expect(setAlarm).toHaveBeenCalledOnce();
});

it("cleanup reuses an ambient job, owns a standalone scope when absent, and preserves storage errors", async () => {
  const records: Record<string, unknown>[] = [];
  for (const method of ["log", "warn", "error"] as const)
    vi.spyOn(console, method).mockImplementation((line) =>
      records.push(JSON.parse(String(line))),
    );
  const failure = new Error("Storage unavailable");
  let storageFails = false;
  const ctx = {
    storage: {
      setAlarm: vi.fn().mockResolvedValue(undefined),
      getAlarm: async () => null,
      transactionSync: (callback: () => unknown) => callback(),
      sql: {
        exec(query: string) {
          if (storageFails) throw failure;
          return {
            toArray: () =>
              query.includes("FROM pending_deletes")
                ? [{ object_key: "PRIVATE_OBJECT_KEY" }]
                : [],
          };
        },
      },
    },
  } as unknown as DurableObjectState;
  const assets = new BoardAssets(ctx, {
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as R2Bucket);
  await assets.drainPendingDeletes();
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    operation: "ref.assets.cleanup",
    "cleanup.deleted_count": 1,
  });
  const fixture = createLogger({
    service: "ambient-fixture",
    sink: (record) => records.push(record),
  });
  await fixture.open("alarm", { operation: "fixture.alarm" }).run(async () => {
    const active = currentLog();
    await assets.drainPendingDeletes();
    expect(currentLog()).toBe(active);
    expect(records).toHaveLength(1);
  });
  expect(records).toHaveLength(2);
  expect(records[1]).toMatchObject({
    operation: "fixture.alarm",
    "cleanup.deleted_count": 1,
  });
  storageFails = true;
  await expect(assets.drainPendingDeletes()).rejects.toBe(failure);
  expect(records).toHaveLength(3);
  expect(records[2]).toMatchObject({
    outcome: "error",
    operation: "ref.assets.cleanup",
  });
  expect(currentLog()).toBeUndefined();
  expect(JSON.stringify(records)).not.toContain("PRIVATE_OBJECT_KEY");
});

it("keeps machine resource identity stable with an alternate browser origin", async () => {
  const env = {
    AUTH_PUBLIC_ORIGIN: "https://old.example",
    HARRHY_REF_ALTERNATE_BROWSER_ORIGIN: "https://new.example",
    AUTH_ISSUER: "https://issuer.example",
    AUTH_CLIENT_ID: "client",
    AUTH_PROJECT_ID: "project",
    AUTH_ORGANIZATION_ID: "organization",
  } as unknown as Env;
  const path = "/.well-known/oauth-protected-resource/mcp";
  for (const host of ["old.example", "new.example"]) {
    const response = await worker.fetch(
      new Request(`https://${host}${path}`),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      resource: "https://old.example/mcp",
      authorization_servers: ["https://issuer.example"],
    });
  }
  expect(
    (
      await worker.fetch(
        new Request(`https://other.example${path}`, {
          headers: { "X-Forwarded-Host": "new.example" },
        }),
        env,
      )
    ).status,
  ).toBe(421);
  expect(
    (
      await worker.fetch(
        new Request(`https://new.example${path}`, {
          headers: { Origin: "https://old.example" },
        }),
        env,
      )
    ).status,
  ).toBe(403);
});

it("preserves a moved board in the sign-in link only on the alternate host", async () => {
  const env = {
    AUTH_PUBLIC_ORIGIN: "https://old.example",
    HARRHY_REF_ALTERNATE_BROWSER_ORIGIN: "https://new.example",
    AUTH_ISSUER: "https://issuer.example",
    AUTH_CLIENT_ID: "client",
    AUTH_PROJECT_ID: "project",
    AUTH_ORGANIZATION_ID: "organization",
    DIRECTORY: { getByName: () => ({}) },
  } as unknown as Env;
  const path = "/boards/example-id?moved=1&ignored=extra";
  const moved = await worker.fetch(
    new Request(`https://new.example${path}`),
    env,
  );
  expect(moved.status).toBe(200);
  const html = await moved.text();
  expect(html).toContain("update your bookmark");
  expect(html).toContain(
    "/auth/login?returnTo=%2Fboards%2Fexample-id%3Fmoved%3D1",
  );
  expect(html).not.toContain("ignored");
  const legacy = await worker.fetch(
    new Request(`https://old.example${path}`),
    env,
  );
  expect(legacy.status).toBe(303);
  expect(legacy.headers.get("Location")).toBe("/");
});
