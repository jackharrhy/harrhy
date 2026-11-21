import { DurableObject } from "cloudflare:workers";
import { ArchiveUnavailable, writeExportArchive } from "./export-archive.ts";

const TTL = 15 * 60_000;
const BUILD_TIME = 5 * 60_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY = 5_000;
const CHUNK = 128 * 1024;

export interface ExportStatus {
  id: string;
  state: "building" | "ready" | "failed";
  expiresAt: number;
}

interface Job extends ExportStatus, Record<string, SqlStorageValue> {
  subject: string;
  deadline: number;
  attempts: number;
  size: number;
}

function publicStatus({ id, state, expiresAt }: Job): ExportStatus {
  return { id, state, expiresAt };
}

// Routed by the caller to a single named object. Staging is entirely local to
// SQLite: a lost response or late R2 read cannot leave an orphan object/put.
export class ExportCell extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS job (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1), id TEXT NOT NULL,
        subject TEXT NOT NULL, state TEXT NOT NULL, expiresAt INTEGER NOT NULL,
        deadline INTEGER NOT NULL, attempts INTEGER NOT NULL, size INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chunks (seq INTEGER PRIMARY KEY, data BLOB NOT NULL);
    `);
  }

  #job(): Job | undefined {
    return this.ctx.storage.sql.exec<Job>("SELECT * FROM job").toArray()[0];
  }

  #owned(subject: string, id: string) {
    const job = this.#job();
    if (
      job &&
      job.subject === subject &&
      job.id === id &&
      Date.now() < job.expiresAt
    )
      return job;
    return null;
  }

  async start(subject: string): Promise<ExportStatus | null> {
    if (typeof subject !== "string" || !subject.trim() || subject.length > 1024)
      return null;
    return this.ctx.blockConcurrencyWhile(async () => {
      const now = Date.now();
      const job = this.#job();
      if (job && now < job.expiresAt)
        return job.subject === subject ? publicStatus(job) : null;
      // Arm before persisting the claim. Crashing here can cause an empty wake,
      // but never a durable job with no wakeup. No external I/O under the gate.
      await this.ctx.storage.setAlarm(now);
      const id = crypto.randomUUID();
      const expiresAt = now + TTL;
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec("DELETE FROM chunks");
        this.ctx.storage.sql.exec(
          "INSERT OR REPLACE INTO job VALUES (1, ?, ?, 'building', ?, ?, 0, 0)",
          id,
          subject,
          expiresAt,
          now + BUILD_TIME,
        );
      });
      return { id, state: "building", expiresAt } as const;
    });
  }

  status(subject: string, id: string): ExportStatus | null {
    const job = this.#owned(subject, id);
    return job && publicStatus(job);
  }

  // Return a bounded RPC page, not a stream whose later pulls depend on the
  // lifetime of a completed Durable Object invocation.
  readPage(subject: string, id: string, seq: number) {
    const job = this.#owned(subject, id);
    if (!job) return { state: "missing" } as const;
    if (job.state !== "ready") return { state: "unavailable" } as const;
    const rows = this.ctx.storage.sql
      .exec<{ data: ArrayBuffer }>(
        "SELECT data FROM chunks WHERE seq >= ? ORDER BY seq LIMIT 16",
        seq,
      )
      .toArray();
    if (!rows.length) throw new Error("Archive unavailable");
    const bytes = new Uint8Array(
      rows.reduce((n, r) => n + r.data.byteLength, 0),
    );
    let offset = 0;
    for (const row of rows) {
      bytes.set(new Uint8Array(row.data), offset);
      offset += row.data.byteLength;
    }
    return {
      state: "ready",
      bytes,
      size: job.size,
      next: seq + rows.length,
    } as const;
  }

  async alarm(): Promise<void> {
    const job = this.#job();
    if (!job) return;
    const { storage } = this.ctx;
    if (Date.now() >= job.expiresAt) {
      storage.transactionSync(() => {
        storage.sql.exec("DELETE FROM chunks");
        storage.sql.exec("DELETE FROM job");
      });
      return;
    }
    if (job.state !== "building") {
      await storage.setAlarm(job.expiresAt);
      return;
    }

    // At-least-once alarm. Restart an interrupted attempt from the source, not
    // from partially staged bytes. Persist the retry budget before external I/O.
    const attempt = job.attempts + 1;
    const ownsAttempt = () => {
      const current = this.#job();
      return (
        current?.id === job.id &&
        current.state === "building" &&
        current.attempts === attempt
      );
    };
    const checkActive = () => {
      if (Date.now() >= job.deadline || !ownsAttempt())
        throw new ArchiveUnavailable();
    };
    storage.transactionSync(() => {
      storage.sql.exec("DELETE FROM chunks");
      storage.sql.exec("UPDATE job SET attempts = ?", attempt);
    });
    await storage.setAlarm(Math.min(Date.now() + RETRY_DELAY, job.expiresAt));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      checkActive();
      if (attempt > MAX_ATTEMPTS) throw new ArchiveUnavailable();
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new ArchiveUnavailable()),
          job.deadline - Date.now(),
        );
      });
      const build = writeExportArchive(
        this.env,
        (bytes) => {
          for (let i = 0; i < bytes.length; i += CHUNK) {
            storage.sql.exec(
              "INSERT INTO chunks (data) VALUES (?)",
              bytes.slice(i, i + CHUNK).buffer,
            );
          }
        },
        checkActive,
      );
      const size = await Promise.race([build, timeout]);
      checkActive();
      storage.sql.exec("UPDATE job SET state = 'ready', size = ?", size);
    } catch (error) {
      if (!ownsAttempt()) return;
      const failed =
        error instanceof ArchiveUnavailable ||
        attempt >= MAX_ATTEMPTS ||
        Date.now() >= job.deadline;
      storage.transactionSync(() => {
        storage.sql.exec("DELETE FROM chunks");
        if (failed) storage.sql.exec("UPDATE job SET state = 'failed'");
      });
      if (!failed) return; // The retry alarm is already durable.
    } finally {
      clearTimeout(timer);
    }
    await storage.setAlarm(job.expiresAt);
  }
}
