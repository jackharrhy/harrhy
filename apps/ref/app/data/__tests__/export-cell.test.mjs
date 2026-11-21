import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { it, vi } from "vitest";
import { validateArchive } from "../../../scripts/archive-format.mjs";
import { ExportCell } from "../export-cell.ts";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(ctx, env) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

function fixture() {
  const db = new DatabaseSync(":memory:");
  let alarm;
  const ctx = {
    blockConcurrencyWhile: (fn) => fn(),
    storage: {
      async setAlarm(at) { alarm = at; },
      sql: {
        exec(query, ...args) {
          if (query.includes("CREATE TABLE")) return db.exec(query);
          const rows = db.prepare(query).all(...args.map((a) => a instanceof ArrayBuffer ? new Uint8Array(a) : a));
          return { toArray: () => rows };
        },
      },
      transactionSync(fn) {
        db.exec("BEGIN");
        try {
          fn();
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    },
  };
  const boardId = crypto.randomUUID();
  const previewId = "a".repeat(64);
  const record = { id: boardId, title: "Synthetic", createdAt: 1, updatedAt: 2 };
  const item = {
    id: crypto.randomUUID(), assetId: crypto.randomUUID(), filename: "fixture.png",
    x: 0, y: 1, width: 100, height: 100, rotation: 0, z: 1, revision: 2,
  };
  const link = {
    url: "https://example.com/", title: "Fixture", siteName: "example.com",
    description: "", imageUrl: `/previews/${boardId}/${previewId}`, videoUrl: null,
  };
  const items = [item, { ...item, id: crypto.randomUUID() }, {
    ...item, id: crypto.randomUUID(), assetId: crypto.randomUUID(), filename: link.title, link,
  }];
  const image = new Uint8Array(150_000);
  image.set([137, 80, 78, 71]);
  const asset = {
    objectKey: `boards/${boardId}/${item.assetId}`, size: image.length, contentType: "image/png",
  };
  const objects = new Map([
    [asset.objectKey, image], [`boards/${boardId}/previews/${previewId}`, image.slice(0, 8)],
  ]);
  const board = {
    snapshot: async () => structuredClone({ boardId, sequence: 7, items }),
    asset: async () => asset,
  };
  const directory = { listBoards: async () => [structuredClone(record)] };
  const media = {
    async get(key) {
      const bytes = objects.get(key);
      if (!bytes) return null;
      return {
        size: bytes.length, httpMetadata: { contentType: "image/png" },
        arrayBuffer: async () => bytes.slice().buffer,
      };
    },
  };
  const env = { DIRECTORY: { getByName: () => directory }, BOARDS: { getByName: () => board }, MEDIA: media };
  const open = () => new ExportCell(ctx, env);
  return { db, open, media, items, record, objects, directory, getAlarm: () => alarm,
    chunks: () => db.prepare("SELECT count(*) AS n FROM chunks").get().n };
}

it("rebuilds after interruption and streams a private archive accepted by the CLI validator", async () => {
  const f = fixture();
  const dir = await mkdtemp(join(tmpdir(), "ref-export-test-"));
  try {
    const first = f.open();
    const job = await first.start("owner");
    assert.deepEqual(await first.start("owner"), job);
    assert.equal(await first.start("other"), null);
    assert.ok(f.getAlarm() <= Date.now());
    assert.equal((await first.download("owner", job.id)).status, 409);

    const original = f.media.get.bind(f.media);
    const paused = Promise.withResolvers();
    const release = Promise.withResolvers();
    f.media.get = async (key) => {
      if (key.includes("/previews/")) {
        paused.resolve();
        await release.promise;
      }
      return original(key);
    };
    const interrupted = first.alarm();
    await paused.promise;
    assert.ok(f.chunks() > 0);
    const cell = f.open();
    f.media.get = original;
    await cell.alarm();
    release.resolve();
    await interrupted;
    assert.equal(cell.status("owner", job.id).state, "ready");
    assert.equal(f.getAlarm(), job.expiresAt);
    assert.equal(cell.status("other", job.id), null);
    assert.equal((await cell.download("other", job.id)).status, 404);
    assert.equal((await cell.download("owner", crypto.randomUUID())).status, 404);

    f.objects.clear(); // Download must not touch current board/media state.
    const response = await f.open().download("owner", job.id);
    assert.equal(response.headers.get("content-type"), "application/x-tar");
    assert.match(response.headers.get("content-disposition"), /^attachment;/);
    const tar = Buffer.from(await response.arrayBuffer());
    assert.equal(tar.length, Number(response.headers.get("content-length")));
    execFileSync("tar", ["-xf", "-", "-C", dir], { input: tar });
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
    await validateArchive(manifest, dir);
    assert.deepEqual(manifest.boards[0].items, f.items);
    assert.deepEqual(manifest.boards[0].record, f.record);
    assert.equal(manifest.boards[0].assets.length, 1);
    assert.equal(manifest.boards[0].previews.length, 1);

    const reader = (await cell.download("owner", job.id)).body.getReader();
    assert.equal((await reader.read()).done, false);
    f.db.prepare("UPDATE job SET expiresAt = ?").run(Date.now());
    assert.equal(cell.status("owner", job.id), null);
    assert.equal((await cell.download("owner", job.id)).status, 404);
    await cell.alarm();
    assert.equal(f.chunks(), 0);
    const next = await cell.start("other");
    assert.notEqual(next.id, job.id);
    await assert.rejects(reader.read(), /expired/);
  } finally {
    f.db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

it("rejects an oversized object before reading its body", async () => {
  const f = fixture();
  try {
    const cell = f.open();
    const job = await cell.start("owner");
    let read = false;
    let cancelled = false;
    f.media.get = async () => ({
      size: 21 * 1024 * 1024,
      body: { cancel: async () => { cancelled = true; } },
      arrayBuffer: async () => { read = true; },
    });
    await cell.alarm();
    assert.equal(read, false);
    assert.equal(cancelled, true);
    assert.equal(cell.status("owner", job.id).state, "failed");
    assert.equal(f.chunks(), 0);
  } finally {
    f.db.close();
  }
});

for (const change of ["board record", "link metadata", "item revision", "transient read"]) {
  it(`never publishes partial data after a changed ${change} or exhausted retry`, async () => {
    const f = fixture();
    try {
      const cell = f.open();
      const job = await cell.start("owner");
      const original = f.media.get.bind(f.media);
      let calls = 0;
      f.media.get = async (key) => {
        if (key.includes("/previews/")) {
          calls++;
          if (change === "board record") f.record.title += "!";
          if (change === "item revision") f.items[0].revision++;
          if (change === "link metadata") f.items[2].link.description += "!";
          if (change === "transient read") throw new Error("private upstream detail");
        }
        return original(key);
      };
      for (let n = 0; n < 4; n++) await f.open().alarm();
      assert.deepEqual(cell.status("owner", job.id), { ...job, state: "failed" });
      assert.equal(calls, change === "transient read" ? 3 : 1);
      assert.equal(f.chunks(), 0);
      const response = await cell.download("owner", job.id);
      assert.equal(response.status, 409);
      assert.equal(await response.text(), "Archive unavailable");
    } finally {
      f.db.close();
    }
  });
}
