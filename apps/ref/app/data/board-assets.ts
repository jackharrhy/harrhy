import { currentLog } from "@harrhy/logger";
import { logger, errorContext } from "../logging.ts";
import type { LinkPreview } from "./protocol.ts";

interface LinkRow extends Record<string, SqlStorageValue> {
  asset_id: string;
  url: string;
  title: string;
  description: string;
  image_url: string | null;
  video_url: string | null;
  site_name: string;
}

interface AssetRow extends Record<string, SqlStorageValue> {
  id: string;
  object_key: string;
  filename: string;
  content_type: string;
  size: number;
}

export interface SavedLink {
  assetId: string;
  preview: LinkPreview;
  existingItemId: string | null;
}

export interface AssetInput {
  id: string;
  objectKey: string;
  filename: string;
  contentType: string;
  size: number;
}

const LINK_ASSET_TYPE = "application/x-ref-link";
const STAGING_TTL_MS = 15 * 60_000;
const DELETE_RETRY_MS = 60_000;
const ABANDONED_SWEEP_MS = 24 * 60 * 60_000;

export class BoardAssets {
  constructor(
    private ctx: DurableObjectState,
    private media: R2Bucket,
  ) {}

  private activeWrites = new Set<string>();
  private draining: Promise<void> | null = null;
  private alarmScheduling: Promise<void> = Promise.resolve();

  async storeAsset(asset: AssetInput, bytes: ArrayBuffer): Promise<void> {
    await this.stageMedia(asset.objectKey, bytes, asset.contentType);
    this.ctx.storage.transactionSync(() => {
      this.requireReady(asset.objectKey);
      this.recordAsset(asset);
      this.ctx.storage.sql.exec(
        "DELETE FROM pending_media_writes WHERE object_key = ?",
        asset.objectKey,
      );
    });
  }

  async stageMedia(
    objectKey: string,
    bytes: ArrayBuffer,
    contentType: string,
    restoring = false,
  ): Promise<void> {
    if (this.activeWrites.has(objectKey))
      throw new Error("Media write already in progress");
    this.activeWrites.add(objectKey);
    try {
      const restoreHash = restoring
        ? Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
            (value) => value.toString(16).padStart(2, "0"),
          ).join("")
        : null;
      await this.ensureCleanupAlarm();
      const deleting = this.ctx.storage.sql
        .exec(
          "SELECT object_key FROM pending_deletes WHERE object_key = ?",
          objectKey,
        )
        .toArray().length;
      const previous = this.ctx.storage.sql
        .exec<{
          restore_hash: string | null;
          state: string;
          uncertain: number;
        }>(
          "SELECT restore_hash, state, uncertain FROM pending_media_writes WHERE object_key = ?",
          objectKey,
        )
        .toArray()[0];
      if (deleting || (!restoring && this.queuedForDeletion(objectKey)))
        throw new Error("Media generation is being deleted");
      if (restoring && previous) {
        if (previous.restore_hash !== restoreHash)
          throw new Error("Restored preview conflicts with pending bytes");
        this.ctx.storage.sql.exec(
          "DELETE FROM pending_media_writes WHERE object_key = ?",
          objectKey,
        );
      }
      this.ctx.storage.sql.exec(
        "INSERT INTO pending_media_writes (object_key, expires_at, restore_hash, uncertain) VALUES (?, ?, ?, ?)",
        objectKey,
        Date.now() + STAGING_TTL_MS,
        restoreHash,
        restoring &&
          previous &&
          (previous.state !== "ready" || previous.uncertain)
          ? 1
          : 0,
      );
      if (!restoring || !(await this.media.head(objectKey)))
        await this.media.put(objectKey, bytes, {
          httpMetadata: { contentType },
        });
      this.ctx.storage.sql.exec(
        "UPDATE pending_media_writes SET state = 'ready' WHERE object_key = ? AND state = 'staged'",
        objectKey,
      );
      this.requireReady(objectKey);
    } finally {
      this.activeWrites.delete(objectKey);
    }
  }

  ensureCleanupAlarm(deadline = Date.now() + DELETE_RETRY_MS): Promise<void> {
    const scheduled = this.alarmScheduling.then(async () => {
      const existing = await this.ctx.storage.getAlarm();
      if (existing === null || existing <= Date.now() || existing > deadline)
        await this.ctx.storage.setAlarm(deadline);
    });
    this.alarmScheduling = scheduled.catch(() => {});
    return scheduled;
  }

  private requireReady(objectKey: string): void {
    if (
      !this.ctx.storage.sql
        .exec(
          "SELECT object_key FROM pending_media_writes WHERE object_key = ? AND state = 'ready'",
          objectKey,
        )
        .toArray().length
    )
      throw new Error("Media write has expired; retry with a new upload");
  }

  private previewKey(preview: LinkPreview): string | null {
    const match = /^\/previews\/([^/]+)\/([0-9a-f]{64})$/.exec(
      preview.imageUrl ?? "",
    );
    return match ? `boards/${match[1]}/previews/${match[2]}` : null;
  }

  private previewAvailable(preview: LinkPreview): boolean {
    const objectKey = this.previewKey(preview);
    if (!objectKey) return true;
    return (
      !this.queuedForDeletion(objectKey) &&
      !!this.ctx.storage.sql
        .exec(
          "SELECT asset_id FROM links WHERE image_url = ? UNION ALL SELECT object_key FROM pending_media_writes WHERE object_key = ? AND state = 'ready'",
          preview.imageUrl!,
          objectKey,
        )
        .toArray().length
    );
  }

  private attachPreview(preview: LinkPreview): void {
    if (!this.previewAvailable(preview))
      throw new Error("Preview generation is unavailable; retry the link");
    const objectKey = this.previewKey(preview);
    if (objectKey) {
      this.ctx.storage.sql.exec(
        "UPDATE pending_media_writes SET state = 'retained', expires_at = ? WHERE object_key = ? AND uncertain = 1",
        Date.now() + ABANDONED_SWEEP_MS,
        objectKey,
      );
      this.ctx.storage.sql.exec(
        "DELETE FROM pending_media_writes WHERE object_key = ? AND uncertain = 0",
        objectKey,
      );
    }
  }

  private queuedForDeletion(objectKey: string): boolean {
    return !!this.ctx.storage.sql
      .exec(
        "SELECT object_key FROM pending_deletes WHERE object_key = ? UNION ALL SELECT object_key FROM pending_media_writes WHERE object_key = ? AND state = 'abandoned'",
        objectKey,
        objectKey,
      )
      .toArray().length;
  }

  recordAsset(asset: AssetInput): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?)",
      asset.id,
      asset.objectKey,
      asset.filename,
      asset.contentType,
      asset.size,
      Date.now(),
    );
  }

  restoreAsset(asset: AssetInput): boolean {
    if (this.queuedForDeletion(asset.objectKey)) return false;
    const existing = this.ctx.storage.sql
      .exec<AssetRow>("SELECT * FROM assets WHERE id = ?", asset.id)
      .toArray()[0];
    if (existing) {
      return (
        existing.object_key === asset.objectKey &&
        existing.filename === asset.filename &&
        existing.content_type === asset.contentType &&
        existing.size === asset.size
      );
    }
    this.recordAsset(asset);
    return true;
  }

  recordLink(preview: LinkPreview): SavedLink {
    const existing = this.existingLink(preview.url);
    if (existing) return existing;
    const assetId = crypto.randomUUID();
    this.insertLink(assetId, preview);
    return { assetId, preview, existingItemId: null };
  }

  existingLink(url: string): SavedLink | null {
    const existing = this.ctx.storage.sql
      .exec<LinkRow>("SELECT * FROM links WHERE url = ?", url)
      .toArray()[0];
    if (!existing) return null;
    const item = this.ctx.storage.sql
      .exec<{ id: string }>(
        "SELECT id FROM items WHERE asset_id = ? LIMIT 1",
        existing.asset_id,
      )
      .toArray()[0];
    return {
      assetId: existing.asset_id,
      preview: toPreview(existing),
      existingItemId: item?.id ?? null,
    };
  }

  replaceLink(
    boardId: string,
    assetId: string,
    preview: LinkPreview,
  ): (SavedLink & { changed: boolean }) | null {
    const existing = this.existingLink(preview.url);
    if (!existing || existing.assetId !== assetId) return null;
    const changed =
      existing.preview.title !== preview.title ||
      existing.preview.description !== preview.description ||
      existing.preview.imageUrl !== preview.imageUrl ||
      existing.preview.videoUrl !== (preview.videoUrl ?? null) ||
      existing.preview.siteName !== preview.siteName;
    if (!changed) return { ...existing, changed: false };
    this.ctx.storage.transactionSync(() => {
      this.attachPreview(preview);
      this.ctx.storage.sql.exec(
        "UPDATE links SET title = ?, description = ?, image_url = ?, video_url = ?, site_name = ? WHERE asset_id = ?",
        preview.title,
        preview.description,
        preview.imageUrl,
        preview.videoUrl ?? null,
        preview.siteName,
        assetId,
      );
      this.ctx.storage.sql.exec(
        "UPDATE assets SET filename = ? WHERE id = ?",
        preview.title,
        assetId,
      );
      this.ctx.storage.sql.exec(
        "UPDATE items SET filename = ? WHERE asset_id = ?",
        preview.title,
        assetId,
      );
      if (existing.preview.imageUrl !== preview.imageUrl)
        this.queueUnusedPreview(boardId, existing.preview.imageUrl);
    });
    return { ...existing, preview, changed: true };
  }

  restoreLink(assetId: string, preview: LinkPreview): boolean {
    const existing = this.ctx.storage.sql
      .exec<LinkRow>(
        "SELECT * FROM links WHERE asset_id = ? OR url = ?",
        assetId,
        preview.url,
      )
      .toArray()[0];
    if (existing) {
      return (
        existing.asset_id === assetId &&
        existing.url === preview.url &&
        existing.title === preview.title &&
        existing.description === preview.description &&
        existing.image_url === preview.imageUrl &&
        existing.video_url === (preview.videoUrl ?? null) &&
        existing.site_name === preview.siteName
      );
    }
    if (!this.previewAvailable(preview)) return false;
    this.insertLink(assetId, preview);
    return true;
  }

  itemMetadata(
    assetId: string,
  ): { filename: string; link?: LinkPreview } | null {
    const asset = this.ctx.storage.sql
      .exec<AssetRow>("SELECT * FROM assets WHERE id = ?", assetId)
      .toArray()[0];
    if (!asset) return null;
    const link = this.ctx.storage.sql
      .exec<LinkRow>("SELECT * FROM links WHERE asset_id = ?", assetId)
      .toArray()[0];
    return {
      filename: asset.filename,
      ...(link ? { link: toPreview(link) } : {}),
    };
  }

  asset(
    assetId: string,
  ): { objectKey: string; contentType: string; size: number } | null {
    const row = this.ctx.storage.sql
      .exec<AssetRow>("SELECT * FROM assets WHERE id = ?", assetId)
      .toArray()[0];
    return row && row.content_type !== LINK_ASSET_TYPE
      ? {
          objectKey: row.object_key,
          contentType: row.content_type,
          size: row.size,
        }
      : null;
  }

  deleteUnusedAsset(boardId: string, assetId: string): void {
    if (
      this.ctx.storage.sql
        .exec("SELECT id FROM items WHERE asset_id = ? LIMIT 1", assetId)
        .toArray().length
    )
      return;
    const asset = this.ctx.storage.sql
      .exec<AssetRow>("SELECT * FROM assets WHERE id = ?", assetId)
      .toArray()[0];
    if (!asset) return;
    const link = this.ctx.storage.sql
      .exec<LinkRow>("SELECT * FROM links WHERE asset_id = ?", assetId)
      .toArray()[0];
    this.ctx.storage.sql.exec("DELETE FROM links WHERE asset_id = ?", assetId);
    this.ctx.storage.sql.exec("DELETE FROM assets WHERE id = ?", assetId);
    if (asset.object_key) this.queueDelete(asset.object_key);
    this.queueUnusedPreview(boardId, link?.image_url ?? null);
  }

  private queueUnusedPreview(boardId: string, imageUrl: string | null): void {
    const prefix = `/previews/${boardId}/`;
    if (!imageUrl?.startsWith(prefix)) return;
    const hash = imageUrl.slice(prefix.length);
    if (
      /^[0-9a-f]{64}$/.test(hash) &&
      !this.ctx.storage.sql
        .exec(
          "SELECT asset_id FROM links WHERE image_url = ? LIMIT 1",
          imageUrl,
        )
        .toArray().length
    ) {
      this.queueDelete(`boards/${boardId}/previews/${hash}`);
    }
  }

  drainPendingDeletes(): Promise<void> {
    if (this.draining) return this.draining;
    this.draining = this.drain().finally(() => {
      this.draining = null;
    });
    return this.draining;
  }

  private async drain(): Promise<void> {
    const drain = async () => {
      const log = currentLog()!;
      const staged = this.ctx.storage.sql
        .exec<{
          object_key: string;
          expires_at: number;
          state: string;
          uncertain: number;
        }>(
          "SELECT object_key, expires_at, state, uncertain FROM pending_media_writes",
        )
        .toArray();
      let nextSweep = Infinity;
      this.ctx.storage.transactionSync(() => {
        for (const row of staged) {
          if (
            row.expires_at > Date.now() ||
            this.activeWrites.has(row.object_key)
          ) {
            nextSweep = Math.min(
              nextSweep,
              Math.max(row.expires_at, Date.now() + DELETE_RETRY_MS),
            );
            continue;
          }
          this.queueDelete(row.object_key);
          if (row.state === "ready" && !row.uncertain) {
            this.ctx.storage.sql.exec(
              "DELETE FROM pending_media_writes WHERE object_key = ?",
              row.object_key,
            );
            continue;
          }
          // An interrupted put may finish after recovery has already deleted its key.
          const retryAt = Date.now() + ABANDONED_SWEEP_MS;
          this.ctx.storage.sql.exec(
            "UPDATE pending_media_writes SET state = CASE WHEN state = 'retained' THEN 'retained' ELSE 'abandoned' END, expires_at = ? WHERE object_key = ?",
            retryAt,
            row.object_key,
          );
          nextSweep = Math.min(nextSweep, retryAt);
        }
      });
      if (Number.isFinite(nextSweep)) await this.ensureCleanupAlarm(nextSweep);
      const pending = this.ctx.storage.sql
        .exec<{ object_key: string }>(
          "SELECT object_key FROM pending_deletes LIMIT 20",
        )
        .toArray();
      log.inc("cleanup.pending_count", pending.length);
      if (!pending.length) return;
      await this.ensureCleanupAlarm();
      log.set({ "retry.scheduled": true });
      for (const row of pending) {
        try {
          if (this.activeWrites.has(row.object_key)) continue;
          const preview = /^boards\/([^/]+)\/previews\/([0-9a-f]{64})$/.exec(
            row.object_key,
          );
          const referenced =
            this.ctx.storage.sql
              .exec(
                "SELECT id FROM assets WHERE object_key = ? LIMIT 1",
                row.object_key,
              )
              .toArray().length ||
            (preview &&
              this.ctx.storage.sql
                .exec(
                  "SELECT asset_id FROM links WHERE image_url = ? LIMIT 1",
                  `/previews/${preview[1]}/${preview[2]}`,
                )
                .toArray().length);
          if (!referenced) await this.media.delete(row.object_key);
          this.ctx.storage.sql.exec(
            "DELETE FROM pending_deletes WHERE object_key = ?",
            row.object_key,
          );
          log.inc("cleanup.deleted_count");
        } catch (error) {
          log.inc("cleanup.failed_count");
          log.warn("media.cleanup_failed").set(errorContext(error));
        }
      }
    };
    if (currentLog()) await drain();
    else
      await logger
        .open("job", {
          operation: "ref.assets.cleanup",
          job_id: crypto.randomUUID(),
        })
        .run(drain);
  }

  private insertLink(assetId: string, preview: LinkPreview): void {
    this.ctx.storage.transactionSync(() => {
      this.attachPreview(preview);
      this.ctx.storage.sql.exec(
        "INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?)",
        assetId,
        "",
        preview.title,
        LINK_ASSET_TYPE,
        0,
        Date.now(),
      );
      this.ctx.storage.sql.exec(
        "INSERT INTO links (asset_id, url, title, description, image_url, video_url, site_name) VALUES (?, ?, ?, ?, ?, ?, ?)",
        assetId,
        preview.url,
        preview.title,
        preview.description,
        preview.imageUrl,
        preview.videoUrl ?? null,
        preview.siteName,
      );
    });
  }

  private queueDelete(objectKey: string): void {
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO pending_deletes VALUES (?)",
      objectKey,
    );
  }
}

function toPreview(row: LinkRow): LinkPreview {
  return {
    url: row.url,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    videoUrl: row.video_url,
    siteName: row.site_name,
  };
}
