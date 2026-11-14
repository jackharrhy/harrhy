import { createHash } from "node:crypto";
import { existsSync, constants, watch as watchDirectory } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "yaml";
import { spacePath } from "../spaces.ts";
import { renderMarkdown } from "./markdown.ts";

/** Explicit trusted registry entry. directory is relative to the external root. */
interface CatalogAuthor {
  readonly id: string;
  readonly directory: string;
  readonly name?: string;
  readonly optional?: boolean;
  readonly legacyRoutes?: boolean;
}
export interface CatalogOptions {
  readonly root: string;
  readonly authors: readonly CatalogAuthor[];
}
interface CatalogPage {
  readonly title: string;
  readonly path: string;
  readonly parent?: string;
  readonly description?: string;
  readonly kind?: string;
  readonly date?: string;
  readonly updated?: string;
  readonly sources: readonly Readonly<{ label: string; url: string }>[];
  readonly aliases: readonly string[];
  readonly contributors: readonly string[];
  readonly author: string;
  readonly source: string;
  readonly html: string;
  readonly text: string;
  readonly links: readonly string[];
}
interface CatalogSearchEntry {
  readonly path: string;
  readonly title: string;
  readonly author: string;
  readonly text: string;
}
/** All indexes belong to the same deeply frozen, atomically published generation. */
interface CatalogGeneration {
  readonly id: number;
  /** Index keys and route targets omit trailing slash; page/parent URLs include it. */
  readonly pages: Readonly<Record<string, CatalogPage>>;
  readonly routes: Readonly<Record<string, string>>;
  readonly backlinks: Readonly<Record<string, readonly string[]>>;
  readonly search: readonly CatalogSearchEntry[];
}
interface CatalogRead {
  readonly generation: CatalogGeneration | null;
  readonly status: "empty" | "ready" | "stale";
  readonly error: string | null;
}
export interface Catalog {
  /** Capture once per request; do not mix snapshots during rendering. */
  read(): CatalogRead;
  /** A failed refresh retains the entire previous generation and reports stale. */
  refresh(): Promise<CatalogRead>;
  /** Explicit opt-in watcher; handles change and rename by rebuilding all indexes. */
  watch(): () => void;
}

function route(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]*$/.test(value)
  ) {
    throw new Error(`Invalid catalog route: ${String(value)}`);
  }
  const normalized = value.length > 1 ? value.replace(/\/$/, "") : value;
  if (
    normalized === "/search" ||
    normalized === "/authors" ||
    normalized.startsWith("/authors/") ||
    normalized === "/healthz" ||
    normalized === "/spaces" ||
    normalized.startsWith("/spaces/")
  )
    throw new Error(`Reserved catalog route: ${value}`);
  return normalized;
}
function key(value: string): string {
  return value.replace(/\/$/, "") || "/";
}
function displayRoute(value: string): string {
  return value === "/" ? value : `${value}/`;
}
function strings(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  ) {
    throw new Error(`${field} must be an array of nonempty strings`);
  }
  return [...new Set(value as string[])];
}
function inside(root: string, relative: string): string {
  const target = path.resolve(root, relative);
  const remainder = path.relative(root, target);
  if (
    !remainder ||
    remainder.startsWith(`..${path.sep}`) ||
    remainder === ".." ||
    path.isAbsolute(remainder)
  ) {
    throw new Error(`Directory escapes external root: ${relative}`);
  }
  return target;
}
async function noSymlink(directory: string): Promise<void> {
  const absolute = path.resolve(directory);
  let current = path.parse(absolute).root;
  for (const part of absolute
    .slice(current.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error(`Not a real directory: ${current}`);
  }
}

/** Only recursively reads registered author directories, never adjacent inventories. */
export function createCatalog(options: CatalogOptions): Catalog {
  const root = path.resolve(options.root);
  const authors = options.authors.map((author) => ({ ...author }));
  let state: CatalogRead = Object.freeze({
    generation: null,
    status: "empty",
    error: null,
  });
  let pending: Promise<CatalogRead> = Promise.resolve(state);
  let fingerprint: string | null = null;
  let renderedCache = new Map<
    string,
    Awaited<ReturnType<typeof renderMarkdown>>
  >();

  async function build(): Promise<CatalogRead> {
    try {
      await noSymlink(root);
      const sourceDigests: string[] = [];
      const nextCache = new Map<
        string,
        Awaited<ReturnType<typeof renderMarkdown>>
      >();
      const pages: Record<string, CatalogPage> = Object.create(null);
      const routes: Record<string, string> = Object.create(null);
      const backlinks: Record<string, string[]> = Object.create(null);
      const ids = new Set<string>();
      const directories = new Set<string>();
      for (const author of authors) {
        if (!/^[a-z][a-z0-9-]*$/.test(author.id) || ids.has(author.id))
          throw new Error(`Duplicate or empty author: ${author.id}`);
        ids.add(author.id);
        const directory = inside(root, author.directory);
        if (
          [...directories].some(
            (other) =>
              directory === other ||
              directory.startsWith(`${other}${path.sep}`) ||
              other.startsWith(`${directory}${path.sep}`),
          )
        ) {
          throw new Error(`Overlapping author directory: ${author.directory}`);
        }
        directories.add(directory);
        try {
          await noSymlink(directory);
        } catch (error) {
          if (
            author.optional &&
            (error as NodeJS.ErrnoException).code === "ENOENT"
          )
            continue;
          throw error;
        }
        const scoped = (address: string) =>
          spacePath(author.id) + (address === "/" ? "" : address);
        async function scan(folder: string): Promise<void> {
          await noSymlink(folder);
          for (const entry of (
            await readdir(folder, { withFileTypes: true })
          ).toSorted((a, b) => a.name.localeCompare(b.name))) {
            const filename = path.join(folder, entry.name);
            if (entry.isSymbolicLink())
              throw new Error(`Symlink forbidden: ${filename}`);
            if (entry.isDirectory()) {
              await scan(filename);
              continue;
            }
            if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue;
            const file = await open(
              filename,
              constants.O_RDONLY | constants.O_NOFOLLOW,
            );
            let source: string;
            try {
              source = await file.readFile("utf8");
            } finally {
              await file.close();
            }
            sourceDigests.push(
              `${filename}:${createHash("sha256").update(source).digest("hex")}`,
            );
            const match =
              /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(source);
            if (!match) throw new Error(`Missing frontmatter: ${filename}`);
            const document = parseDocument(match[1], { uniqueKeys: true });
            if (document.errors.length)
              throw new Error(
                `Invalid YAML: ${filename}: ${document.errors[0]?.message}`,
              );
            const metadata: unknown = document.toJS({ maxAliasCount: 0 });
            if (
              !metadata ||
              typeof metadata !== "object" ||
              Array.isArray(metadata)
            )
              throw new Error(`Invalid metadata: ${filename}`);
            const data = metadata as Record<string, unknown>;
            if (typeof data.title !== "string" || !data.title.trim())
              throw new Error(`Missing title: ${filename}`);
            const localPath = route(data.path);
            const canonical = scoped(localPath);
            const localAliases = strings(data.aliases, "aliases").map(route);
            const aliases = localAliases.map(scoped);
            if (author.legacyRoutes)
              aliases.push(
                ...[localPath, ...localAliases].filter(
                  (address) => address !== "/",
                ),
              );
            const contributors = strings(data.contributors, "contributors");
            const optional: Record<string, string> = {};
            for (const field of [
              "parent",
              "description",
              "kind",
              "date",
              "updated",
            ]) {
              if (data[field] === undefined) continue;
              if (typeof data[field] !== "string")
                throw new Error(`${field} must be a string: ${filename}`);
              optional[field] =
                field === "parent"
                  ? displayRoute(scoped(route(data[field])))
                  : data[field];
            }
            const sources: Readonly<{ label: string; url: string }>[] = [];
            if (data.sources !== undefined) {
              if (!Array.isArray(data.sources))
                throw new Error(`sources must be an array: ${filename}`);
              for (const item of data.sources) {
                if (
                  !item ||
                  typeof item !== "object" ||
                  typeof item.label !== "string" ||
                  typeof item.url !== "string"
                )
                  throw new Error(`Invalid source: ${filename}`);
                const url = new URL(item.url);
                if (url.protocol !== "https:" && url.protocol !== "http:")
                  throw new Error(`Unsafe source URL: ${filename}`);
                sources.push(
                  Object.freeze({ label: item.label, url: item.url }),
                );
              }
            }
            const digest =
              author.id +
              ":" +
              localPath +
              ":" +
              createHash("sha256").update(match[2]!).digest("hex");
            const rendered =
              nextCache.get(digest) ??
              renderedCache.get(digest) ??
              (await renderMarkdown(match[2]!, (href) => {
                if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)) return href;
                let url: URL;
                try {
                  url = new URL(
                    href,
                    `http://atlas.local${displayRoute(localPath)}`,
                  );
                } catch {
                  return href;
                }
                if (url.origin !== "http://atlas.local") return href;
                if (url.pathname.startsWith("/spaces/"))
                  return url.pathname + url.search + url.hash;
                return (
                  spacePath(author.id) + url.pathname + url.search + url.hash
                );
              }));
            nextCache.set(digest, rendered);
            for (const address of [canonical, ...aliases]) {
              if (Object.hasOwn(routes, address))
                throw new Error(`Duplicate catalog route: ${address}`);
              routes[address] = canonical;
            }
            pages[canonical] = Object.freeze({
              ...optional,
              sources: Object.freeze(sources),
              title: data.title,
              path: displayRoute(canonical),
              aliases: Object.freeze(aliases),
              contributors: Object.freeze(contributors),
              author: author.id,
              source: path.relative(root, filename),
              html: rendered.html,
              text: rendered.text,
              links: Object.freeze([...rendered.links]),
            });
            backlinks[canonical] = [];
          }
        }
        await scan(directory);
      }
      for (const page of Object.values(pages)) {
        const ancestors = new Set([key(page.path)]);
        let parent = page.parent;
        while (parent) {
          const canonical = routes[key(parent)];
          if (!canonical) throw new Error(`Unknown parent: ${parent}`);
          if (ancestors.has(canonical))
            throw new Error(`Cyclic parent: ${page.path}`);
          ancestors.add(canonical);
          parent = pages[canonical]!.parent;
        }
        if (page.parent) {
          pages[key(page.path)] = Object.freeze({
            ...page,
            parent: displayRoute(routes[key(page.parent)]!),
          });
        }
        for (const link of page.links) {
          let address: string;
          try {
            const url = new URL(link, `http://atlas.local${page.path}`);
            if (url.origin !== "http://atlas.local") continue;
            address = decodeURIComponent(url.pathname);
          } catch {
            continue;
          }
          const target =
            routes[address.length > 1 ? address.replace(/\/$/, "") : address];
          if (target && !backlinks[target]!.includes(page.path))
            backlinks[target]!.push(page.path);
        }
      }
      const nextFingerprint = JSON.stringify(sourceDigests);
      renderedCache = nextCache;
      if (state.generation && nextFingerprint === fingerprint) {
        state = Object.freeze({
          generation: state.generation,
          status: "ready",
          error: null,
        });
        return state;
      }
      fingerprint = nextFingerprint;
      for (const [address, list] of Object.entries(backlinks)) {
        backlinks[address] = list.toSorted();
        Object.freeze(backlinks[address]);
      }
      const generation: CatalogGeneration = Object.freeze({
        id: (state.generation?.id ?? 0) + 1,
        pages: Object.freeze(pages),
        routes: Object.freeze(routes),
        backlinks: Object.freeze(backlinks),
        search: Object.freeze(
          Object.values(pages).map(({ path: notePath, title, text, author }) =>
            Object.freeze({ path: notePath, title, text, author }),
          ),
        ),
      });
      state = Object.freeze({ generation, status: "ready", error: null });
    } catch (error) {
      state = Object.freeze({
        generation: state.generation,
        status: state.generation ? "stale" : "empty",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return state;
  }
  function refresh(): Promise<CatalogRead> {
    pending = pending.then(build);
    return pending;
  }
  function watch(): () => void {
    // Watching the curated roots' parent catches replacement of an author directory.
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = (event: string, filename: string | Buffer | null) => {
      if (closed || (event !== "rename" && event !== "change")) return;
      const relative = filename?.toString();
      if (
        relative &&
        !authors.some((author) => {
          const directory = path.relative(root, inside(root, author.directory));
          return (
            relative === directory ||
            relative.startsWith(`${directory}${path.sep}`) ||
            directory.startsWith(`${relative}${path.sep}`)
          );
        })
      )
        return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!closed) void refresh();
      }, 30);
    };
    const watchers = [watchDirectory(root, changed)];
    try {
      for (const author of authors) {
        const directory = inside(root, author.directory);
        if (author.optional && !existsSync(directory)) continue;
        watchers.push(
          watchDirectory(directory, { recursive: true }, (event, filename) => {
            changed(
              event,
              filename ? path.join(author.directory, filename) : null,
            );
          }),
        );
      }
    } catch (error) {
      for (const watcher of watchers) watcher.close();
      throw error;
    }
    for (const watcher of watchers)
      watcher.on("error", (error) => {
        state = Object.freeze({
          generation: state.generation,
          status: state.generation ? "stale" : "empty",
          error: error.message,
        });
      });
    // Directory replacement can detach native inode watches; rescans restore freshness.
    const rescan = setInterval(() => {
      if (!closed) void refresh();
    }, 5000);
    rescan.unref();
    for (const watcher of watchers) watcher.unref();
    return () => {
      closed = true;
      clearTimeout(timer);
      clearInterval(rescan);
      for (const watcher of watchers) watcher.close();
    };
  }
  return { read: () => state, refresh, watch };
}
