import { annotationProjectionInput } from "../content/annotation.ts";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  canonicalComments,
  type CommentBatch,
  type QuoteEvidence,
  type TargetBinding,
} from "./contract.ts";
import { matchesEvidence } from "./evidence.ts";

export interface ArticleSnapshot {
  readonly sourceContent: string;
  readonly sourceDigest: string;
  readonly annotationText: string;
  readonly annotationDigest: string;
}

export interface SavedComment {
  readonly revision: number;
  readonly evidence: QuoteEvidence;
}
export interface SavedBatch {
  readonly body: CommentBatch;
  readonly items: readonly { id: string; revision: number }[];
  readonly receipt: unknown;
}
export interface CommentStore {
  list(): readonly SavedComment[];
  save(evidence: QuoteEvidence, expectedRevision: number, snapshot: ArticleSnapshot): SavedComment;
  remove(id: string, expectedRevision: number): void;
  freeze(items: readonly { id: string; revision: number }[], target: TargetBinding): SavedBatch;
  batch(id: string): SavedBatch | undefined;
  batches(): readonly SavedBatch[];
  rememberReceipt(id: string, receipt: unknown): void;
  close(): void;
}

// State is operator-controlled, outside published content and any symlink alias.
export async function openCommentStore(directory: string): Promise<CommentStore> {
  if (!path.isAbsolute(directory)) throw new Error("Comment state path must be absolute");
  let current = path.parse(directory).root;
  for (const part of directory.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Invalid comment state directory");
  }
  const directoryStat = await lstat(directory);
  if ((directoryStat.mode & 0o077) !== 0 || directoryStat.uid !== process.getuid?.())
    throw new Error("Comment state directory must be private and owned by the server user");
  const filename = path.join(directory, "annotations.sqlite");
  const file = await open(
    filename,
    constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o077) !== 0 ||
      stat.uid !== directoryStat.uid
    )
      throw new Error("Comment state file must be private");
  } finally {
    await file.close();
  }
  const db = new DatabaseSync(filename, { timeout: 5000, allowExtension: false });
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    PRAGMA max_page_count = 65536;
    CREATE TABLE IF NOT EXISTS article_snapshots (
      source_digest TEXT NOT NULL, projection_digest TEXT NOT NULL, source TEXT NOT NULL, projection TEXT NOT NULL,
      PRIMARY KEY (source_digest, projection_digest)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY, revision INTEGER NOT NULL, evidence TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY, body TEXT NOT NULL, receipt TEXT NOT NULL DEFAULT 'null'
    ) STRICT;
    CREATE TABLE IF NOT EXISTS batch_comments (
      comment_id TEXT NOT NULL, revision INTEGER NOT NULL, batch_id TEXT NOT NULL REFERENCES batches(id),
      PRIMARY KEY (comment_id, revision)
    ) STRICT;
  `);
  function transaction<T>(run: () => T): T {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  function comment(id: string): SavedComment | undefined {
    const row = db
      .prepare("SELECT revision, evidence FROM comments WHERE id = ? AND deleted = 0")
      .get(id);
    return row
      ? {
          revision: Number(row.revision),
          evidence: JSON.parse(String(row.evidence)) as QuoteEvidence,
        }
      : undefined;
  }
  function readBatch(row: Record<string, unknown>): SavedBatch {
    const body = JSON.parse(String(row.body)) as CommentBatch;
    return {
      body,
      items: db
        .prepare(
          "SELECT comment_id, revision FROM batch_comments WHERE batch_id = ? ORDER BY rowid",
        )
        .all(body.batchId)
        .map((item) => ({ id: String(item.comment_id), revision: Number(item.revision) })),
      receipt: JSON.parse(String(row.receipt)) as unknown,
    };
  }
  function batch(id: string): SavedBatch | undefined {
    const row = db.prepare("SELECT body, receipt FROM batches WHERE id = ?").get(id);
    return row ? readBatch(row) : undefined;
  }
  return {
    list: () =>
      db
        .prepare("SELECT revision, evidence FROM comments WHERE deleted = 0 ORDER BY rowid")
        .all()
        .map((row) => ({
          revision: Number(row.revision),
          evidence: JSON.parse(String(row.evidence)) as QuoteEvidence,
        })),
    save: (evidence, expectedRevision, snapshot) =>
      transaction(() => {
        if (
          !matchesEvidence(evidence, snapshot) ||
          createHash("sha256").update(snapshot.sourceContent).digest("hex") !==
            snapshot.sourceDigest ||
          (createHash("sha256").update(snapshot.annotationText).digest("hex") !==
            snapshot.annotationDigest &&
            createHash("sha256")
              .update(annotationProjectionInput(snapshot.annotationText))
              .digest("hex") !== snapshot.annotationDigest)
        )
          throw new Error("Comment source revision no longer matches");
        if (
          Buffer.byteLength(snapshot.sourceContent) + Buffer.byteLength(snapshot.annotationText) >
          4 * 1024 * 1024
        )
          throw new Error("Comment source snapshot exceeds limit");
        db.prepare(
          "INSERT OR IGNORE INTO article_snapshots(source_digest,projection_digest,source,projection) VALUES (?,?,?,?)",
        ).run(
          snapshot.sourceDigest,
          snapshot.annotationDigest,
          snapshot.sourceContent,
          snapshot.annotationText,
        );
        const previous = comment(evidence.id);
        if (
          !previous &&
          Number(
            db.prepare("SELECT count(*) AS count FROM comments WHERE deleted = 0").get()!.count,
          ) >= 512
        )
          throw new Error("Saved comment limit reached; remove comments before staging more");
        if (!previous && db.prepare("SELECT id FROM comments WHERE id = ?").get(evidence.id))
          throw new Error("Removed comment identity cannot be reused");
        if ((previous?.revision ?? 0) !== expectedRevision)
          throw new Error("Comment revision conflict");
        const revision = expectedRevision + 1;
        db.prepare(
          "INSERT INTO comments(id,revision,evidence) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,evidence=excluded.evidence",
        ).run(evidence.id, revision, JSON.stringify(evidence));
        return { revision, evidence };
      }),
    remove: (id, expectedRevision) =>
      transaction(() => {
        if (comment(id)?.revision !== expectedRevision)
          throw new Error("Comment revision conflict");
        db.prepare("UPDATE comments SET deleted = 1 WHERE id = ?").run(id);
      }),
    freeze: (items, target) =>
      transaction(() => {
        if (
          !items.length ||
          items.length > 32 ||
          new Set(items.map((item) => item.id)).size !== items.length
        )
          throw new Error("Invalid comment batch");
        const comments = items.map((item) => {
          const saved = comment(item.id);
          if (!saved || saved.revision !== item.revision)
            throw new Error("Comment revision conflict");
          if (
            db
              .prepare("SELECT batch_id FROM batch_comments WHERE comment_id = ? AND revision = ?")
              .get(item.id, item.revision)
          )
            throw new Error("Comment revision already submitted; use original batch receipt");
          return saved.evidence;
        });
        const body: CommentBatch = {
          payloadVersion: 1,
          target: { ...target },
          batchId: randomUUID(),
          payloadDigest: createHash("sha256").update(canonicalComments(comments)).digest("hex"),
          comments,
        };
        const encoded = JSON.stringify(body);
        if (Buffer.byteLength(encoded) > 24576)
          throw new Error("Comment batch exceeds bridge limit");
        db.prepare("INSERT INTO batches(id,body) VALUES (?,?)").run(body.batchId, encoded);
        for (const item of items)
          db.prepare("INSERT INTO batch_comments(comment_id,revision,batch_id) VALUES (?,?,?)").run(
            item.id,
            item.revision,
            body.batchId,
          );
        return { body, items: items.map((item) => ({ ...item })), receipt: null };
      }),
    batch,
    batches: () =>
      db.prepare("SELECT body, receipt FROM batches ORDER BY rowid").all().map(readBatch),
    rememberReceipt: (id, receipt) => {
      const encoded = JSON.stringify(receipt);
      if (encoded === undefined || Buffer.byteLength(encoded) > 262144)
        throw new Error("Invalid receipt");
      if (!batch(id)) throw new Error("Unknown comment batch");
      db.prepare("UPDATE batches SET receipt = ? WHERE id = ?").run(encoded, id);
    },
    close: () => db.close(),
  };
}
