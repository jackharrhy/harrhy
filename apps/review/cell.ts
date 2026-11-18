import { DurableObject } from "cloudflare:workers";
import { parsePatchFiles } from "@pierre/diffs";

export type Snapshot = {
  base: string;
  head: string;
  mergeBase: string;
  patch: string;
};
export type Anchor = { file: number; side: "old" | "new"; line: number };
type Thread = Anchor & {
  id: string;
  resolved: boolean;
  messages: { text: string; created: number }[];
};
type SnapshotRow = Snapshot & { id: string; created: number };
export function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}
function files(patch: string) {
  return parsePatchFiles(patch, { throwOnError: true }).flatMap((p) => p.files);
}

export class ReviewCell extends DurableObject<Env> {
  private sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY, base TEXT NOT NULL, head TEXT NOT NULL,
      mergeBase TEXT NOT NULL, patch TEXT NOT NULL, created INTEGER NOT NULL
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS threads (
      seq INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, review TEXT NOT NULL REFERENCES reviews(id), data TEXT NOT NULL
    )`);
  }

  list() {
    return this.sql
      .exec<SnapshotRow>("SELECT * FROM reviews ORDER BY created DESC, id")
      .toArray()
      .map(({ patch, ...review }) => {
        const changed = files(patch);
        return {
          ...review,
          firstFile: changed[0]?.name,
          fileCount: changed.length,
        };
      });
  }

  exists(id: string) {
    return (
      this.sql.exec("SELECT 1 FROM reviews WHERE id = ?", id).toArray()
        .length !== 0
    );
  }

  private snapshot(id: string) {
    return this.sql
      .exec<SnapshotRow>("SELECT * FROM reviews WHERE id = ?", id)
      .toArray()[0];
  }

  threads(id: string) {
    if (!this.exists(id)) return null;
    return this.sql
      .exec<{ data: string }>(
        "SELECT data FROM threads WHERE review = ? ORDER BY seq",
        id,
      )
      .toArray()
      .map(({ data }) => JSON.parse(data) as Thread);
  }

  get(id: string) {
    const snapshot = this.snapshot(id);
    return snapshot ? { ...snapshot, threads: this.threads(id)! } : null;
  }

  submit(input: Snapshot, origin: string) {
    let count;
    try {
      count = files(input.patch).length;
    } catch {
      return error(400, "Invalid unified patch");
    }
    if (!count || count > 100)
      return error(400, "Expected 1–100 changed files");
    if (
      this.sql
        .exec<{ count: number }>("SELECT count(*) AS count FROM reviews")
        .one().count >= 50
    )
      return error(409, "Inbox is full; delete a review first");
    const id = crypto.randomUUID();
    this.sql.exec(
      "INSERT INTO reviews (id, base, head, mergeBase, patch, created) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      input.base,
      input.head,
      input.mergeBase,
      input.patch,
      Date.now(),
    );
    return Response.json(
      { id, url: `${origin}/reviews/${id}` },
      { status: 201 },
    );
  }

  remove(id: string) {
    if (!this.exists(id)) return error(404, "Review not found");
    this.ctx.storage.transactionSync(() => {
      this.sql.exec("DELETE FROM threads WHERE review = ?", id);
      this.sql.exec("DELETE FROM reviews WHERE id = ?", id);
    });
    return new Response(null, { status: 204 });
  }

  add(id: string, anchor: Anchor, text: string) {
    const snapshot = this.snapshot(id);
    if (!snapshot) return error(404, "Review not found");
    const file = files(snapshot.patch)[anchor.file];
    const visible = file?.hunks.some((hunk) => {
      const [start, count] =
        anchor.side === "old"
          ? [hunk.deletionStart, hunk.deletionCount]
          : [hunk.additionStart, hunk.additionCount];
      return anchor.line >= start && anchor.line < start + count;
    });
    if (!visible)
      return error(400, "Anchor must be a line in a displayed hunk");
    if (
      this.sql
        .exec<{ count: number }>(
          "SELECT count(*) AS count FROM threads WHERE review = ?",
          id,
        )
        .one().count >= 100
    )
      return error(409, "Review has reached its thread limit");
    const thread: Thread = {
      ...anchor,
      id: crypto.randomUUID(),
      resolved: false,
      messages: [{ text, created: Date.now() }],
    };
    this.sql.exec(
      "INSERT INTO threads (id, review, data) VALUES (?, ?, ?)",
      thread.id,
      id,
      JSON.stringify(thread),
    );
    return Response.json(thread, { status: 201 });
  }

  update(
    id: string,
    tid: string,
    change:
      | { action: "reply"; text: string }
      | { action: "resolve" | "reopen" },
  ) {
    const row = this.sql
      .exec<{ data: string }>(
        "SELECT data FROM threads WHERE review = ? AND id = ?",
        id,
        tid,
      )
      .toArray()[0];
    if (!row) return error(404, "Thread not found");
    const thread = JSON.parse(row.data) as Thread;
    if (change.action === "reply") {
      if (thread.messages.length >= 25)
        return error(409, "Thread has reached its message limit");
      thread.messages.push({ text: change.text, created: Date.now() });
    } else {
      thread.resolved = change.action === "resolve";
    }
    this.sql.exec(
      "UPDATE threads SET data = ? WHERE id = ?",
      JSON.stringify(thread),
      tid,
    );
    return Response.json(thread);
  }
}
