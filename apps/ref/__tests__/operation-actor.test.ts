import { afterEach, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));
import { BoardCell } from "../app/data/board-cell.ts";

afterEach(() => vi.restoreAllMocks());

it("concurrent socket operations use current verified subjects, not attachment or frame identity; denied access emits no operation", async () => {
  const records: Record<string, unknown>[] = [];
  vi.spyOn(console, "log").mockImplementation((line) =>
    records.push(JSON.parse(String(line))),
  );
  const boardId = crypto.randomUUID();
  const ctx = {
    blockConcurrencyWhile() {},
    getWebSockets: () => [],
    storage: {
      sql: {
        exec(query: string) {
          return {
            toArray: () =>
              query.includes("FROM board_info")
                ? [{ board_id: boardId }]
                : query.includes("FROM operations")
                  ? [
                      {
                        sequence: 1,
                        item_id: crypto.randomUUID(),
                        item_json: null,
                      },
                    ]
                  : [],
          };
        },
      },
    },
  } as unknown as DurableObjectState;
  const cell = new BoardCell(ctx, {
    DIRECTORY: {
      getByName: () => ({
        socketAccess: async (_board: string, key: string) => {
          await Promise.resolve();
          return key === "PRIVATE_denied"
            ? null
            : {
                expiresAt: Date.now() + 60_000,
                subject: key === "PRIVATE_a" ? "subject-a" : "subject-b",
              };
        },
      }),
    },
  } as unknown as Env);
  const operations = ["PRIVATE_a", "PRIVATE_b", "PRIVATE_denied"].map(
    (sessionHash) => {
      const operationId = crypto.randomUUID();
      const socket = {
        deserializeAttachment: () => ({
          sessionHash,
          expiresAt: Date.now() + 60_000,
          accessVersion: 0,
          windowStartedAt: Date.now(),
          messageCount: 0,
          subject: "untrusted",
        }),
        serializeAttachment() {},
        send: vi.fn(),
        close: vi.fn(),
      } as unknown as WebSocket;
      return {
        operationId,
        socket,
        frame: JSON.stringify({
          type: "operation",
          subject: "untrusted",
          operation: {
            kind: "transform",
            operationId,
            itemId: crypto.randomUUID(),
            baseRevision: 1,
            x: 1,
            y: 2,
            width: 100,
            height: 100,
            rotation: 0,
            z: 1,
          },
        }),
      };
    },
  );
  await Promise.all(
    operations.map(({ socket, frame }) => cell.webSocketMessage(socket, frame)),
  );
  expect(records).toHaveLength(2);
  for (const [index, subject] of ["subject-a", "subject-b"].entries()) {
    expect(
      records.find((event) => event.job_id === operations[index]!.operationId),
    ).toMatchObject({ "actor.id": subject, operation: "ref.board.transform" });
  }
  expect(operations[2]!.socket.close).toHaveBeenCalledWith(
    1008,
    "Session ended",
  );
  expect(JSON.stringify(records)).not.toMatch(/PRIVATE_|untrusted/);
});
