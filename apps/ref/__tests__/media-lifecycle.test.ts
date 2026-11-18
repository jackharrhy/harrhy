import {
  saveBoardLink,
  uploadBoardImage,
} from "../app/data/board-resources.ts";
import type { AppRuntimeService } from "../app/data/runtime.ts";
import type { AssetInput } from "../app/data/board-assets.ts";
import * as previews from "../app/data/link-preview.ts";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));
vi.mock("../app/build-info.ts", () => ({
  buildInfo: { "build.version": "media-lifecycle-test" },
}));
import { BoardCell } from "../app/data/board-cell.ts";

const databases: DatabaseSync[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const database of databases.splice(0)) database.close();
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function fixture() {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  const boardId = crypto.randomUUID();
  const objects = new Map<string, ArrayBuffer>();
  const bytes = new Uint8Array([137, 80, 78, 71]).buffer;
  const assetId = crypto.randomUUID();
  const asset = {
    id: assetId,
    objectKey: `boards/${boardId}/${assetId}`,
    filename: "synthetic.png",
    contentType: "image/png",
    size: bytes.byteLength,
  };
  const media = {
    head: vi.fn(async (key: string) => (objects.has(key) ? { key } : null)),
    put: vi.fn(async (key: string, value: ArrayBuffer) => {
      objects.set(key, value.slice(0));
    }),
    delete: vi.fn(async (key: string) => {
      objects.delete(key);
    }),
  };
  let alarm: number | null = null;
  let transaction = 0;
  async function instantiate() {
    const initialization: Promise<unknown>[] = [];
    const ctx = {
      blockConcurrencyWhile(callback: () => Promise<unknown>) {
        initialization.push(callback());
      },
      getWebSockets: () => [],
      storage: {
        setAlarm: vi.fn(async (at: number | Date) => {
          alarm = Number(at);
        }),
        getAlarm: async () => alarm,
        deleteAlarm: async () => {
          alarm = null;
        },
        transactionSync<T>(callback: () => T): T {
          const savepoint = `test_${transaction++}`;
          database.exec(`SAVEPOINT ${savepoint}`);
          try {
            const result = callback();
            database.exec(`RELEASE ${savepoint}`);
            return result;
          } catch (error) {
            database.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
            throw error;
          }
        },
        sql: {
          exec(query: string, ...bindings: SQLInputValue[]) {
            let rows: Record<string, unknown>[] = [];
            if (!bindings.length && query.includes("CREATE TABLE")) {
              database.exec(query);
            } else {
              rows = database.prepare(query).all(...bindings);
            }
            return {
              toArray: () => rows,
              one: () => {
                if (rows.length !== 1) throw new Error("Expected one SQL row");
                return rows[0];
              },
              [Symbol.iterator]: () => rows[Symbol.iterator](),
            };
          },
        },
      },
    } as unknown as DurableObjectState;
    const cell = new BoardCell(ctx, { MEDIA: media } as unknown as Env);
    await Promise.all(initialization);
    cell.initialize(boardId);
    return cell;
  }
  const cell = await instantiate();
  return {
    cell,
    runtime: { board: () => cell, media } as unknown as AppRuntimeService,
    instantiate,
    database,
    boardId,
    objects,
    bytes,
    asset,
    media,
    getAlarm: () => alarm,
    setAlarm: (value: number) => {
      alarm = value;
    },
  };
}

it("does not reclaim a staged upload while its owning instance is still putting bytes", async () => {
  const f = await fixture();
  const entered = deferred();
  const release = deferred();
  f.media.put.mockImplementationOnce(async (key, bytes) => {
    f.objects.set(key, bytes.slice(0));
    entered.resolve();
    await release.promise;
  });
  const write = f.cell.storeAsset(f.boardId, f.asset, f.bytes);
  await entered.promise;
  const future = Date.now() + 24 * 60 * 60 * 1000;
  vi.spyOn(Date, "now").mockReturnValue(future);
  try {
    await f.cell.alarm();
    expect(f.media.delete).not.toHaveBeenCalled();
    expect(f.objects.has(f.asset.objectKey)).toBe(true);
  } finally {
    release.resolve();
    await write;
  }
  expect(f.cell.asset(f.boardId, f.asset.id)).toMatchObject({
    objectKey: f.asset.objectKey,
  });
  expect(
    f.database.prepare("SELECT * FROM pending_media_writes").all(),
  ).toEqual([]);
});

it("recovers staged bytes after losing the owning instance before put returns", async () => {
  const f = await fixture();
  const entered = deferred();
  // Model instance loss at an I/O boundary: its continuation never resumes.
  f.media.put.mockImplementationOnce(async (key, bytes) => {
    f.objects.set(key, bytes.slice(0));
    entered.resolve();
    await new Promise<void>(() => {});
  });
  void f.cell.storeAsset(f.boardId, f.asset, f.bytes);
  await entered.promise;
  expect(
    f.database.prepare("SELECT * FROM pending_media_writes").all(),
  ).toHaveLength(1);
  const restarted = await f.instantiate();
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 24 * 60 * 60 * 1000);
  await restarted.alarm();
  expect(f.media.delete).toHaveBeenCalledWith(f.asset.objectKey);
  expect(f.objects.has(f.asset.objectKey)).toBe(false);
  expect(restarted.asset(f.boardId, f.asset.id)).toBeNull();
});

it("retries failed cleanup after a put stores bytes but reports failure", async () => {
  const f = await fixture();
  f.media.put.mockImplementationOnce(async (key, bytes) => {
    f.objects.set(key, bytes.slice(0));
    throw new Error("Synthetic put response loss");
  });
  f.media.delete.mockRejectedValueOnce(new Error("Synthetic delete failure"));
  await expect(
    f.cell.storeAsset(f.boardId, f.asset, f.bytes),
  ).rejects.toThrow();
  const restarted = await f.instantiate();
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 24 * 60 * 60 * 1000);
  await restarted.alarm();
  await restarted.alarm();
  expect(
    f.media.delete.mock.calls.filter(([key]) => key === f.asset.objectKey)
      .length,
  ).toBeGreaterThanOrEqual(2);
  expect(f.objects.has(f.asset.objectKey)).toBe(false);
  expect(restarted.asset(f.boardId, f.asset.id)).toBeNull();
});

it("preserves committed metadata and media when only the caller loses the successful RPC response", async () => {
  const f = await fixture();
  const store = f.cell.storeAsset.bind(f.cell);
  let committed!: AssetInput;
  vi.spyOn(f.cell, "storeAsset").mockImplementationOnce(
    async (boardId, asset, bytes) => {
      await store(boardId, asset, bytes);
      committed = asset;
      throw new Error("Synthetic RPC response loss after commit");
    },
  );
  await expect(
    uploadBoardImage(
      f.runtime,
      f.boardId,
      new File([f.bytes], "synthetic.png"),
    ),
  ).rejects.toThrow("after commit");
  const restarted = await f.instantiate();
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 24 * 60 * 60_000);
  await restarted.alarm();
  expect(restarted.asset(f.boardId, committed.id)).toMatchObject({
    objectKey: committed.objectKey,
  });
  expect(f.objects.get(committed.objectKey)).toEqual(f.bytes);
  expect(f.media.delete).not.toHaveBeenCalled();
  expect(
    f.database.prepare("SELECT * FROM pending_media_writes").all(),
  ).toEqual([]);
});

it("retries last-use asset deletion through the real item operation and SQL paths", async () => {
  const f = await fixture();
  await f.cell.storeAsset(f.boardId, f.asset, f.bytes);
  const itemId = crypto.randomUUID();
  const created = await f.cell.submitOperation(
    f.boardId,
    "session-a",
    {
      kind: "create",
      operationId: crypto.randomUUID(),
      item: {
        id: itemId,
        assetId: f.asset.id,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        z: 0,
      },
    },
    "subject-a",
  );
  expect(created.type).toBe("applied");
  f.media.delete.mockRejectedValueOnce(new Error("Synthetic delete failure"));
  const removed = await f.cell.submitOperation(
    f.boardId,
    "session-a",
    {
      kind: "remove",
      operationId: crypto.randomUUID(),
      itemId,
      baseRevision: 1,
    },
    "subject-a",
  );
  expect(removed.type).toBe("applied");
  expect(f.cell.snapshot(f.boardId).items).toEqual([]);
  expect(f.objects.has(f.asset.objectKey)).toBe(true);
  const restarted = await f.instantiate();
  await restarted.alarm();
  expect(f.objects.has(f.asset.objectKey)).toBe(false);
  expect(f.media.delete).toHaveBeenCalledTimes(2);
});

async function place(cell: BoardCell, boardId: string, assetId: string) {
  const itemId = crypto.randomUUID();
  const result = await cell.submitOperation(
    boardId,
    "session-a",
    {
      kind: "create",
      operationId: crypto.randomUUID(),
      item: {
        id: itemId,
        assetId,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        z: 0,
      },
    },
    "subject-a",
  );
  expect(result.type).toBe("applied");
  return itemId;
}

function remove(cell: BoardCell, boardId: string, itemId: string) {
  return cell.submitOperation(
    boardId,
    "session-a",
    {
      kind: "remove",
      operationId: crypto.randomUUID(),
      itemId,
      baseRevision: 1,
    },
    "subject-a",
  );
}

it("reclaims a failed old preview generation without deleting a re-added link's new generation", async () => {
  const f = await fixture();
  const url = "https://example.com/post";
  vi.spyOn(previews, "previewLink").mockResolvedValue({
    url,
    title: "Synthetic post",
    description: "",
    imageUrl: "https://example.com/image.png",
    siteName: "Example",
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(f.bytes, { headers: { "Content-Type": "image/png" } }),
  );
  async function addLink() {
    const result = await saveBoardLink(f.runtime, f.boardId, url);
    if (!result.ok) throw new Error(result.message);
    const imageUrl = result.value.preview.imageUrl!;
    expect(imageUrl).toMatch(
      new RegExp(`^/previews/${f.boardId}/[0-9a-f]{64}$`),
    );
    return {
      ...result.value,
      key: `boards/${f.boardId}/previews/${imageUrl.split("/").at(-1)}`,
    };
  }
  const oldLink = await addLink();
  const oldItem = await place(f.cell, f.boardId, oldLink.assetId);
  f.media.delete.mockRejectedValueOnce(
    new Error("Synthetic old preview delete failure"),
  );
  expect((await remove(f.cell, f.boardId, oldItem)).type).toBe("applied");
  expect(f.objects.has(oldLink.key)).toBe(true);
  const newLink = await addLink();
  expect(newLink.key).not.toBe(oldLink.key);
  await place(f.cell, f.boardId, newLink.assetId);
  const restarted = await f.instantiate();
  await restarted.alarm();
  expect(f.objects.has(oldLink.key)).toBe(false);
  expect(f.objects.get(newLink.key)).toEqual(f.bytes);
  expect(f.media.delete.mock.calls.map(([key]) => key)).toEqual([
    oldLink.key,
    oldLink.key,
  ]);
  expect(restarted.snapshot(f.boardId).items[0]?.link?.imageUrl).toBe(
    newLink.preview.imageUrl,
  );
});

it("fences preview attachment while deletion is in flight and rejects stale attachment after cleanup", async () => {
  const f = await fixture();
  const hash = "c".repeat(64);
  const key = `boards/${f.boardId}/previews/${hash}`;
  const preview = {
    url: "https://example.com/post",
    title: "Synthetic post",
    description: "",
    imageUrl: `/previews/${f.boardId}/${hash}`,
    siteName: "Example",
  };
  await f.cell.storePreview(f.boardId, hash, f.bytes, "image/png");
  const link = f.cell.recordLink(f.boardId, preview);
  const itemId = await place(f.cell, f.boardId, link.assetId);
  const entered = deferred();
  const release = deferred();
  f.media.delete.mockImplementationOnce(async (objectKey) => {
    entered.resolve();
    await release.promise;
    f.objects.delete(objectKey);
  });
  const removal = remove(f.cell, f.boardId, itemId);
  await entered.promise;
  try {
    expect(
      f.database.prepare("SELECT object_key FROM pending_deletes").all(),
    ).toEqual([{ object_key: key }]);
    expect(f.cell.restoreLink(f.boardId, link.assetId, preview)).toBe(false);
    expect(() => f.cell.recordLink(f.boardId, preview)).toThrow("unavailable");
  } finally {
    release.resolve();
    await removal;
  }
  expect(f.objects.has(key)).toBe(false);
  expect(
    f.database.prepare("SELECT object_key FROM pending_deletes").all(),
  ).toEqual([]);
  expect(() => f.cell.recordLink(f.boardId, preview)).toThrow("unavailable");
  expect(f.cell.existingLink(f.boardId, preview.url)).toBeNull();
});

it("retains an abandoned tombstone to reclaim a put that completes after instance recovery", async () => {
  const f = await fixture();
  const entered = deferred();
  const release = deferred();
  const startedAt = Date.now();
  f.media.put.mockImplementationOnce(async (key, bytes) => {
    entered.resolve();
    await release.promise;
    f.objects.set(key, bytes.slice(0));
  });
  // Both instances share SQLite and the fake object store to model restart and
  // delayed external completion, not actual Celld process or network behavior.
  const original = f.cell.storeAsset(f.boardId, f.asset, f.bytes);
  await entered.promise;
  const restarted = await f.instantiate();
  const abandonedAt = startedAt + 16 * 60_000;
  const clock = vi.spyOn(Date, "now").mockReturnValue(abandonedAt);
  await restarted.alarm();
  expect(f.media.delete).toHaveBeenCalledWith(f.asset.objectKey);
  expect(f.objects.has(f.asset.objectKey)).toBe(false);
  const tombstone = () =>
    f.database
      .prepare("SELECT object_key, state FROM pending_media_writes")
      .all();
  expect(tombstone()).toEqual([
    { object_key: f.asset.objectKey, state: "abandoned" },
  ]);

  const rejected = expect(original).rejects.toThrow("expired");
  release.resolve();
  await rejected;
  expect(f.objects.get(f.asset.objectKey)).toEqual(f.bytes);
  expect(restarted.asset(f.boardId, f.asset.id)).toBeNull();
  expect(restarted.restoreAsset(f.boardId, f.asset)).toBe(false);
  expect(tombstone()).toEqual([
    { object_key: f.asset.objectKey, state: "abandoned" },
  ]);

  clock.mockReturnValue(abandonedAt + 24 * 60 * 60_000 + 1);
  await restarted.alarm();
  expect(f.objects.has(f.asset.objectKey)).toBe(false);
  expect(f.media.delete).toHaveBeenCalledTimes(2);
  expect(restarted.asset(f.boardId, f.asset.id)).toBeNull();
  expect(tombstone()).toEqual([
    { object_key: f.asset.objectKey, state: "abandoned" },
  ]);
});

it("reclaims a known-ready unattached preview without retaining an uncertain-write tombstone", async () => {
  const f = await fixture();
  const hash = "d".repeat(64);
  const key = `boards/${f.boardId}/previews/${hash}`;
  await f.cell.storePreview(f.boardId, hash, f.bytes, "image/png");
  expect(
    f.database
      .prepare("SELECT object_key, state FROM pending_media_writes")
      .all(),
  ).toEqual([{ object_key: key, state: "ready" }]);
  const restarted = await f.instantiate();
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 16 * 60_000);
  await restarted.alarm();
  expect(f.media.delete).toHaveBeenCalledWith(key);
  expect(f.objects.has(key)).toBe(false);
  expect(
    f.database.prepare("SELECT * FROM pending_media_writes").all(),
  ).toEqual([]);
  expect(f.database.prepare("SELECT * FROM pending_deletes").all()).toEqual([]);
});

it("resumes a staged restore with matching bytes after losing its put response", async () => {
  const f = await fixture();
  const hash = "e".repeat(64);
  const key = `boards/${f.boardId}/previews/${hash}`;
  f.media.put.mockImplementationOnce(async (objectKey, bytes) => {
    f.objects.set(objectKey, bytes.slice(0));
    throw new Error("Synthetic restore put response loss");
  });
  await expect(
    f.cell.restorePreview(f.boardId, hash, f.bytes, "image/png"),
  ).rejects.toThrow("response loss");
  expect(
    f.database.prepare("SELECT state FROM pending_media_writes").all(),
  ).toEqual([{ state: "staged" }]);
  const restarted = await f.instantiate();
  await expect(
    restarted.restorePreview(
      f.boardId,
      hash,
      new Uint8Array([1, 2, 3]).buffer,
      "image/png",
    ),
  ).rejects.toThrow("conflicts");
  await restarted.restorePreview(f.boardId, hash, f.bytes, "image/png");
  expect(f.objects.get(key)).toEqual(f.bytes);
  expect(f.media.put).toHaveBeenCalledTimes(1);
  expect(
    f.database.prepare("SELECT state FROM pending_media_writes").all(),
  ).toEqual([{ state: "ready" }]);
});

it("resumes an abandoned restore with matching bytes after cleanup without allowing mismatched bytes", async () => {
  const f = await fixture();
  const hash = "f".repeat(64);
  const key = `boards/${f.boardId}/previews/${hash}`;
  f.media.put.mockImplementationOnce(async (objectKey, bytes) => {
    f.objects.set(objectKey, bytes.slice(0));
    throw new Error("Synthetic restore put response loss");
  });
  await expect(
    f.cell.restorePreview(f.boardId, hash, f.bytes, "image/png"),
  ).rejects.toThrow();
  const restarted = await f.instantiate();
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 16 * 60_000);
  await restarted.alarm();
  expect(f.objects.has(key)).toBe(false);
  expect(
    f.database.prepare("SELECT state FROM pending_media_writes").all(),
  ).toEqual([{ state: "abandoned" }]);
  await expect(
    restarted.restorePreview(
      f.boardId,
      hash,
      new Uint8Array([1, 2, 3]).buffer,
      "image/png",
    ),
  ).rejects.toThrow("conflicts");
  expect(
    f.database.prepare("SELECT state FROM pending_media_writes").all(),
  ).toEqual([{ state: "abandoned" }]);
  await restarted.restorePreview(f.boardId, hash, f.bytes, "image/png");
  expect(f.objects.get(key)).toEqual(f.bytes);
  expect(
    f.database.prepare("SELECT state FROM pending_media_writes").all(),
  ).toEqual([{ state: "ready" }]);
});

it("preserves an earlier alarm when staging media and removing its last item", async () => {
  const f = await fixture();
  const deadline = Date.now() + 1_000;
  f.setAlarm(deadline);
  await f.cell.storeAsset(f.boardId, f.asset, f.bytes);
  expect(f.getAlarm()).toBe(deadline);
  const itemId = await place(f.cell, f.boardId, f.asset.id);
  await remove(f.cell, f.boardId, itemId);
  expect(f.getAlarm()).toBe(deadline);
});

it("retains uncertain restore history after resume, attachment and last-use removal to reclaim an old late put", async () => {
  const f = await fixture();
  const hash = "9".repeat(64);
  const key = `boards/${f.boardId}/previews/${hash}`;
  const entered = deferred();
  const release = deferred();
  f.media.put.mockImplementationOnce(async (objectKey, bytes) => {
    entered.resolve();
    await release.promise;
    f.objects.set(objectKey, bytes.slice(0));
  });
  const original = f.cell.restorePreview(f.boardId, hash, f.bytes, "image/png");
  await entered.promise;
  const restarted = await f.instantiate();
  await restarted.restorePreview(f.boardId, hash, f.bytes, "image/png");
  const preview = {
    url: "https://example.com/resumed",
    title: "Resumed restore",
    description: "",
    imageUrl: `/previews/${f.boardId}/${hash}`,
    siteName: "Example",
  };
  const link = restarted.recordLink(f.boardId, preview);
  const itemId = await place(restarted, f.boardId, link.assetId);
  const retained = () =>
    f.database
      .prepare(
        "SELECT state, uncertain FROM pending_media_writes WHERE object_key = ?",
      )
      .all(key);
  expect(retained()).toEqual([{ state: "retained", uncertain: 1 }]);
  await remove(restarted, f.boardId, itemId);
  expect(f.objects.has(key)).toBe(false);
  expect(retained()).toEqual([{ state: "retained", uncertain: 1 }]);

  const rejected = expect(original).rejects.toThrow("expired");
  release.resolve();
  await rejected;
  expect(f.objects.get(key)).toEqual(f.bytes);
  expect(restarted.snapshot(f.boardId).items).toEqual([]);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 24 * 60 * 60_000 + 1);
  await restarted.alarm();
  expect(f.objects.has(key)).toBe(false);
  expect(retained()).toEqual([{ state: "retained", uncertain: 1 }]);
});
