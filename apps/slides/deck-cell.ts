import { DurableObject } from "cloudflare:workers";
import {
  actions,
  freshSlide,
  kinds,
  seed,
  type Slide,
  type Kind,
  type Position,
} from "./deck.ts";

import { viewerSession } from "./viewer-session.ts";

const MAX_BYTES = 8 * 1024 * 1024;
export const MAX_FORM = MAX_BYTES + 32 * 1024;
const reply = (message: string, status: number) =>
  new Response(message, { status, headers: { "Cache-Control": "no-store" } });
const stale = () =>
  reply(
    "This draft changed. Go back, copy any unsaved text and reload the editor.",
    409,
  );
const json = (value: unknown) =>
  Response.json(value, { headers: { "Cache-Control": "no-store" } });

function mediaType(b: Uint8Array) {
  const has = (offset: number, ...bytes: number[]) =>
    bytes.every((v, i) => b[offset + i] === v);
  if (has(0, 137, 80, 78, 71, 13, 10, 26, 10)) return "image/png";
  if (has(0, 255, 216, 255)) return "image/jpeg";
  if (has(0, 82, 73, 70, 70) && has(8, 87, 69, 66, 80)) return "image/webp";
  if (has(4, 102, 116, 121, 112)) return "video/mp4";
}

export class DeckCell extends DurableObject<Env> {
  #latest: Position;
  #viewers = 0;
  get sql() {
    return this.ctx.storage.sql;
  }
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const doc = JSON.stringify(seed);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS documents (
      name TEXT PRIMARY KEY, revision INTEGER NOT NULL, content TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS viewer_clock (singleton INTEGER PRIMARY KEY, scope TEXT NOT NULL, cursor INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS playback (singleton INTEGER PRIMARY KEY, slide TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS modes (slide TEXT PRIMARY KEY, alternate INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, type TEXT NOT NULL, size INTEGER NOT NULL);`);
    this.sql.exec(
      "INSERT OR IGNORE INTO documents VALUES ('draft',1,?), ('published',1,?)",
      doc,
      doc,
    );
    this.sql.exec("INSERT OR IGNORE INTO playback VALUES (1,?)", seed[0].id);
    this.sql.exec(
      "INSERT OR IGNORE INTO viewer_clock VALUES (1,?,0)",
      crypto.randomUUID(),
    );
    this.#latest = this.#position();
  }

  #document(name: "draft" | "published") {
    const row = this.sql
      .exec<{ revision: number; content: string }>(
        "SELECT revision, content FROM documents WHERE name=?",
        name,
      )
      .one();
    return {
      revision: row.revision,
      slides: JSON.parse(row.content) as Slide[],
    };
  }

  #position(doc = this.#document("published")): Position {
    const current = this.sql
      .exec<{ slide: string }>("SELECT slide FROM playback")
      .one().slide;
    const position = Math.max(
      0,
      doc.slides.findIndex((s) => s.id === current),
    );
    const slideId = doc.slides[position].id;
    return {
      ...this.sql
        .exec<{ scope: string; cursor: number }>(
          "SELECT scope,cursor FROM viewer_clock WHERE singleton=1",
        )
        .one(),
      position,
      slideId,
      revision: doc.revision,
      alternate: Boolean(
        this.sql
          .exec("SELECT alternate FROM modes WHERE slide=?", slideId)
          .toArray()[0]?.alternate,
      ),
    };
  }
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === "/draft") {
      if (request.method === "POST") {
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return reply("Invalid form", 400);
        }
        return this.#edit(form);
      }
      const draft = this.#document("draft"),
        live = this.#document("published");
      return json({
        ...draft,
        publishedRevision: live.revision,
        dirty: JSON.stringify(draft.slides) !== JSON.stringify(live.slides),
      });
    }
    if (url.pathname === "/watch") {
      if (
        request.headers.get("Upgrade")?.toLowerCase() !== "websocket" ||
        url.searchParams.get("scope") !== this.#latest.scope
      )
        return reply("Refresh presentation", 409);
      if (this.#viewers >= 128) return reply("Too many viewers", 503);
      this.#viewers++;
      return viewerSession(
        () => this.#latest,
        () => this.#viewers--,
        this.ctx,
      );
    }
    if (url.pathname === "/position" && request.method === "GET")
      return json(this.#latest);
    const published = this.#document("published");
    if (url.pathname === "/page")
      return json({ slides: published.slides, ...this.#position(published) });
    if (url.pathname === "/media" || url.pathname === "/draft-media") {
      const id = url.searchParams.get("id");
      const doc =
        url.pathname === "/media" ? published : this.#document("draft");
      if (!id || !doc.slides.some((s) => s.media === id))
        return reply("Not found", 404);
      const object = await this.env.MEDIA.get(
        this.ctx.id.toString() + "/" + id,
      );
      if (!object) return reply("Media unavailable", 503);
      return new Response(object.body, {
        headers: {
          "Content-Type":
            object.httpMetadata?.contentType ?? "application/octet-stream",
          "Content-Length": String(object.size),
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      });
    }
    if (url.pathname !== "/position") return reply("Not found", 404);
    if (request.method === "POST") {
      const { position, action, alternate, revision } = await request.json<{
        position: number;
        action?: string;
        alternate?: boolean;
        revision?: number;
      }>();
      if (revision !== published.revision)
        return reply("Published deck changed; refresh", 409);
      if (!Number.isSafeInteger(position) || !published.slides[position])
        return reply("Invalid position", 400);
      // Body reading yields. Recheck before touching playback.
      if (this.#document("published").revision !== revision)
        return reply("Published deck changed; refresh", 409);
      const target = published.slides[position],
        prior = this.#position(published);
      if (action !== undefined) {
        if (
          action !== actions[target.kind] ||
          (alternate !== undefined && typeof alternate !== "boolean")
        )
          return reply("Invalid action", 400);
        if (target.id !== prior.slideId) return reply("Slide changed", 409);
      }
      this.ctx.storage.transactionSync(() => {
        if (action === undefined) {
          if (target.kind === "video" && prior.slideId !== target.id)
            this.sql.exec("DELETE FROM modes WHERE slide=?", target.id);
          this.sql.exec(
            "UPDATE playback SET slide=? WHERE singleton=1",
            target.id,
          );
        } else {
          this.sql.exec(
            "INSERT OR REPLACE INTO modes VALUES (?,?)",
            target.id,
            Number(alternate ?? !prior.alternate),
          );
        }
        this.sql.exec(
          "UPDATE viewer_clock SET cursor=cursor+1 WHERE singleton=1",
        );
      });
      this.#latest = this.#position(published);
      return json(this.#latest);
    }
    return reply("Method not allowed", 405);
  }

  async #edit(form: FormData) {
    const { slides, revision } = this.#document("draft");
    if (form.get("revision") !== String(revision)) return stale();
    const id = form.get("id"),
      intent = form.get("intent");
    const index = slides.findIndex((s) => s.id === id);
    const slide = slides[index];
    let selected = slide?.id ?? slides[0].id;
    if (intent === "publish") {
      const live = this.#document("published");
      if (JSON.stringify(live.slides) === JSON.stringify(slides))
        return this.#back(selected);
      this.ctx.storage.transactionSync(() => {
        this.sql.exec(
          "UPDATE documents SET revision=?, content=? WHERE name='published'",
          revision,
          JSON.stringify(slides),
        );
        const current = this.#position();
        this.sql.exec(
          "UPDATE playback SET slide=? WHERE singleton=1",
          current.slideId,
        );
        this.sql.exec("DELETE FROM modes");
        this.sql.exec(
          "UPDATE viewer_clock SET cursor=cursor+1 WHERE singleton=1",
        );
      });
      this.#latest = this.#position();
    } else {
      if (intent === "discard") {
        slides.splice(0, slides.length, ...this.#document("published").slides);
        selected = slides[0].id;
      } else if (intent === "add") {
        if (slides.length >= 100) return reply("Maximum 100 slides", 400);
        const kind = form.get("kind");
        if (!kinds.includes(kind as Kind)) return reply("Invalid kind", 400);
        const added = freshSlide(
          crypto.randomUUID(),
          kind as Kind,
          "Untitled slide",
        );
        slides.splice(index < 0 ? slides.length : index + 1, 0, added);
        selected = added.id;
      } else if (!slide) return reply("Slide not found", 404);
      else if (intent === "remove" && slides.length > 1) {
        slides.splice(index, 1);
        selected = slides[Math.min(index, slides.length - 1)].id;
      } else if (
        (intent === "up" && index > 0) ||
        (intent === "down" && index < slides.length - 1)
      ) {
        slides.splice(index, 1);
        slides.splice(index + (intent === "up" ? -1 : 1), 0, slide);
      } else if (intent === "clear-media") delete slide.media;
      else if (intent === "save") {
        const title = form.get("title"),
          body = form.get("body");
        if (
          typeof title !== "string" ||
          !title.trim() ||
          title.length > 240 ||
          typeof body !== "string" ||
          body.length > 8000
        )
          return reply(
            "Expected a title (1–240 characters) and body (up to 8000).",
            400,
          );
        slide.title = title.trim();
        slide.body = body;
        if (slide.kind === "image") {
          for (const key of ["x", "y", "width"] as const) {
            const raw = form.get(key),
              n = Number(raw);
            if (
              typeof raw !== "string" ||
              !raw.trim() ||
              !Number.isFinite(n) ||
              n < (key === "width" ? 1 : 0) ||
              n > 100
            )
              return reply("Invalid image placement", 400);
            slide[key] = n;
          }
        }
        const file = form.get("media");
        if (file instanceof File && file.size) {
          if (file.size > MAX_BYTES)
            return reply("Maximum attachment is 8 MiB", 413);
          const bytes = new Uint8Array(await file.arrayBuffer()),
            type = mediaType(bytes);
          if (
            !type ||
            type !== file.type ||
            !(slide.kind === "video"
              ? type === "video/mp4"
              : (slide.kind === "image" || slide.kind === "windows") &&
                type.startsWith("image/"))
          )
            return reply("Unsupported media for this slide", 415);
          const digest = new Uint8Array(
            await crypto.subtle.digest("SHA-256", bytes),
          ).toHex();
          // Immutable, bounded, per-deck object pool. Reserve before external I/O,
          // including uncertain puts. A retry of identical bytes uses the same slot.
          if (this.#document("draft").revision !== revision) return stale();
          if (
            !this.sql.exec("SELECT 1 FROM media WHERE id=?", digest).toArray()
              .length
          ) {
            const pool = this.sql
              .exec<{ n: number; bytes: number }>(
                "SELECT count(*) AS n, coalesce(sum(size),0) AS bytes FROM media",
              )
              .one();
            if (pool.n >= 256 || pool.bytes + file.size > 128 * 1024 * 1024)
              return reply("Deck media pool is full", 413);
            this.sql.exec(
              "INSERT INTO media VALUES (?,?,?)",
              digest,
              type,
              file.size,
            );
          }
          await this.env.MEDIA.put(
            this.ctx.id.toString() + "/" + digest,
            bytes,
            {
              httpMetadata: { contentType: type },
            },
          );
          slide.media = digest;
        }
      } else return reply("Invalid edit", 400);
      const content = JSON.stringify(slides);
      if (new TextEncoder().encode(content).length > 256 * 1024)
        return reply("Deck exceeds 256 KiB text limit", 413);
      const changed = this.sql
        .exec(
          "UPDATE documents SET revision=revision+1,content=? WHERE name='draft' AND revision=? RETURNING revision",
          content,
          revision,
        )
        .toArray();
      if (!changed.length) return stale();
    }
    return this.#back(selected);
  }
  #back(selected: string) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/edit?slide=" + selected,
        "Cache-Control": "no-store",
      },
    });
  }
}
