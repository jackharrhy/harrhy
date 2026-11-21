import { DurableObject } from "cloudflare:workers";
import { parsePatchFiles } from "@pierre/diffs";
import { untitledReview } from "./title.ts";

export type Snapshot = {
  base: string;
  head: string;
  mergeBase: string;
  patch: string;
};
type Anchor = { file: number; side: "old" | "new"; line: number };
type ThreadTarget =
  | (Anchor & { scope?: undefined })
  | { scope: "review" }
  | { scope: "file"; file: number };
type Thread = ThreadTarget & {
  id: string;
  resolved: boolean;
  messages: { text: string; created: number }[];
};
type SnapshotRow = Snapshot & { id: string; created: number };
type ReviewRow = SnapshotRow & { title: string | null };
const reviewWithTitle =
  "SELECT reviews.*, review_titles.title FROM reviews LEFT JOIN review_titles ON review_titles.review = reviews.id";
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
    this.sql.exec(`CREATE TABLE IF NOT EXISTS review_titles (
      review TEXT PRIMARY KEY REFERENCES reviews(id), title TEXT NOT NULL
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS viewed_files (
      review TEXT NOT NULL REFERENCES reviews(id), file INTEGER NOT NULL,
      PRIMARY KEY (review, file)
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS threads (
      seq INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, review TEXT NOT NULL REFERENCES reviews(id), data TEXT NOT NULL
    )`);
  }

  list() {
    return this.sql
      .exec<ReviewRow>(`${reviewWithTitle} ORDER BY created DESC, id`)
      .toArray()
      .map(({ patch, ...review }) => ({
        ...review,
        title: review.title ?? untitledReview,
        fileCount: files(patch).length,
      }));
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
    const review = this.sql
      .exec<ReviewRow>(`${reviewWithTitle} WHERE reviews.id = ?`, id)
      .toArray()[0];
    return review
      ? {
          ...review,
          title: review.title ?? untitledReview,
          fileCount: files(review.patch).length,
          threads: this.threads(id)!,
          viewedFiles: this.sql
            .exec<{ file: number }>(
              "SELECT file FROM viewed_files WHERE review = ? ORDER BY file",
              id,
            )
            .toArray()
            .map((row) => row.file),
        }
      : null;
  }

  setViewed(id: string, file: number, viewed: boolean) {
    const snapshot = this.snapshot(id);
    if (!snapshot) return error(404, "Review not found");
    if (file >= files(snapshot.patch).length)
      return error(400, "File index is outside the snapshot");
    if (viewed)
      this.sql.exec(
        "INSERT OR IGNORE INTO viewed_files (review, file) VALUES (?, ?)",
        id,
        file,
      );
    else
      this.sql.exec(
        "DELETE FROM viewed_files WHERE review = ? AND file = ?",
        id,
        file,
      );
    return Response.json({ file, viewed });
  }

  private setTitle(id: string, title: string) {
    this.sql.exec(
      "INSERT INTO review_titles (review, title) VALUES (?, ?) ON CONFLICT (review) DO UPDATE SET title = excluded.title",
      id,
      title,
    );
  }

  rename(id: string, title: string) {
    if (!this.exists(id)) return error(404, "Review not found");
    this.setTitle(id, title);
    return Response.json({ title });
  }

  submit(input: Snapshot, origin: string, title: string | null) {
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
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        "INSERT INTO reviews (id, base, head, mergeBase, patch, created) VALUES (?, ?, ?, ?, ?, ?)",
        id,
        input.base,
        input.head,
        input.mergeBase,
        input.patch,
        Date.now(),
      );
      if (title !== null) this.setTitle(id, title);
    });
    return Response.json(
      { id, url: `${origin}/reviews/${id}` },
      { status: 201 },
    );
  }

  remove(id: string) {
    if (!this.exists(id)) return error(404, "Review not found");
    this.ctx.storage.transactionSync(() => {
      this.sql.exec("DELETE FROM threads WHERE review = ?", id);
      this.sql.exec("DELETE FROM review_titles WHERE review = ?", id);
      this.sql.exec("DELETE FROM viewed_files WHERE review = ?", id);
      this.sql.exec("DELETE FROM reviews WHERE id = ?", id);
    });
    return new Response(null, { status: 204 });
  }

  add(id: string, anchor: ThreadTarget, text: string) {
    const snapshot = this.snapshot(id);
    if (!snapshot) return error(404, "Review not found");
    if (anchor.scope !== "review") {
      const file = files(snapshot.patch)[anchor.file];
      if (!file) return error(400, "File index is outside the snapshot");
      if (anchor.scope !== "file") {
        const visible = file?.hunks.some((hunk) => {
          const [start, count] =
            anchor.side === "old"
              ? [hunk.deletionStart, hunk.deletionCount]
              : [hunk.additionStart, hunk.additionCount];
          return anchor.line >= start && anchor.line < start + count;
        });
        if (!visible)
          return error(400, "Anchor must be a line in a displayed hunk");
      }
    }
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
