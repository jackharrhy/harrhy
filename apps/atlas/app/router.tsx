import { createRouter, createController, createContextKey } from "remix/router";
import { render } from "remix/middleware/render";
import { csp, getCspNonce } from "remix/middleware/csp";
import { staticFiles } from "remix/middleware/static";
import { fileURLToPath } from "node:url";
import { requestTheme } from "./theme.ts";
import { createCatalog } from "./content/catalog.ts";
import { createWidgetLoader } from "./widgets.ts";
import { loadCommentConfiguration } from "./comments/config.ts";
import { openCommentStore } from "./comments/store.ts";
import { createCommentService } from "./comments/service.ts";
import { createCommentHttp } from "./comments/http.ts";
import { compileComments } from "./comments/asset.ts";
import { compileXeetWorker, xeetWorkerPolicy } from "./xeet/asset.ts";
import { serveImage } from "./images.ts";
import { navigationScript } from "./navigation.ts";
import { routes } from "./routes.ts";
import { loadSpaces, spacePath } from "./spaces.ts";
import { document, pageList, topicTree, article } from "./ui.tsx";

export async function createAtlas(
  root: string,
  manifestPath: string,
  widgetManifest?: string,
  commentConfiguration?: string,
) {
  const catalog = createCatalog({
    root,
    widgets: widgetManifest ? createWidgetLoader(widgetManifest) : undefined,
    authors: () => loadSpaces(manifestPath),
  });
  const xeetWorker = await compileXeetWorker();
  const initial = await catalog.refresh();
  if (!initial.generation) throw new Error("Atlas requires a valid curated catalog before startup");
  const comments = commentConfiguration
    ? await loadCommentConfiguration(commentConfiguration)
    : undefined;
  const commentAsset = comments ? await compileComments() : undefined;
  const commentStore = comments
    ? await openCommentStore(comments.config.stateDirectory)
    : undefined;
  const commentHttp =
    comments && commentStore
      ? createCommentHttp(
          createCommentService({
            store: commentStore,
            bridge: comments.bridge,
            snapshot(articleUrl) {
              const state = catalog.read();
              if (state.status !== "ready") return;
              const url = new URL(articleUrl);
              if (url.origin !== comments.config.articleOrigin) return;
              return state.generation?.pages[url.pathname.replace(/\/$/, "") || "/"];
            },
          }),
          comments.config.articleOrigin,
          comments.config.defaultTargetKey,
          comments.csrfSecret,
        )
      : undefined;
  const snapshotKey = createContextKey<ReturnType<typeof catalog.read>>();
  const router = createRouter({
    middleware: [
      csp({
        policy: ({ nonce, context }) => {
          const snapshot = catalog.read();
          context.set(snapshotKey, snapshot);
          const pathname = new URL(context.request.url).pathname.replace(/\/$/, "") || "/";
          const generation = snapshot.generation;
          const target = generation?.routes[pathname];
          const canonical = target ? generation?.pages[target]?.path : undefined;
          const xeet =
            canonical &&
            generation?.widgets.some(
              (widget) => widget.page === canonical && widget.capabilities.includes("xeet"),
            );
          if (pathname === "/_atlas/xeet-worker.js")
            return {
              defaultSrc: ["'none'"],
              scriptSrc: ["'wasm-unsafe-eval'"],
              connectSrc: ["'self'"],
              workerSrc: ["'none'"],
              baseUri: ["'none'"],
            };
          return {
            ...(xeet ? { workerSrc: ["'self'"] } : {}),
            defaultSrc: ["'none'"],
            scriptSrc: [`'nonce-${nonce}'`],
            ...(comments ? { connectSrc: ["'self'"] } : {}),
            styleSrc: ["'self'", "'unsafe-inline'"],
            fontSrc: ["'self'"],
            imgSrc: ["'self'"],
            formAction: ["'self'"],
            baseUri: ["'none'"],
            frameAncestors: ["'none'"],
          };
        },
      }),
      staticFiles(fileURLToPath(new URL("../public/", import.meta.url)), {
        cacheControl: "private, max-age=86400",
      }),
    ],
  });
  const controller = createController(routes, {
    middleware: [render()],
    actions: {
      xeetWorker() {
        return new Response(xeetWorker, {
          headers: {
            "Content-Type": "text/javascript; charset=utf-8",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": xeetWorkerPolicy,
          },
        });
      },
      image(context) {
        return serveImage(context.request, root, context.get(snapshotKey)!.generation!.spaces);
      },
      navigation() {
        return new Response(navigationScript, {
          headers: {
            "Content-Type": "text/javascript; charset=utf-8",
            "Cache-Control": "private, no-cache",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
      commentAsset(context) {
        return commentAsset && context.params.digest === commentAsset.digest
          ? new Response(commentAsset.script, {
              headers: {
                "Content-Type": "text/javascript; charset=utf-8",
                "Cache-Control": "private, max-age=31536000, immutable",
                "X-Content-Type-Options": "nosniff",
              },
            })
          : new Response("Not Found", { status: 404 });
      },
      comments(context) {
        return commentHttp
          ? commentHttp(context.request)
          : new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
      },
      widget(context) {
        const script = catalog.widgetScript(context.params.digest);
        return script === undefined
          ? new Response("Not Found", { status: 404 })
          : new Response(script, {
              headers: {
                "Content-Type": "text/javascript; charset=utf-8",
                "Cache-Control": "private, max-age=31536000, immutable",
                "X-Content-Type-Options": "nosniff",
              },
            });
      },
      health() {
        const state = catalog.read();
        return Response.json(
          { status: state.status, generation: state.generation?.id },
          {
            status: state.status === "ready" ? 200 : 503,
            headers: { "Cache-Control": "no-store" },
          },
        );
      },
      home: show,
      space: show,
      authors: show,
      author: show,
      page: show,
    },
  });
  type Context = Parameters<typeof getCspNonce>[0] & {
    render(node: Parameters<typeof document>[1], init?: ResponseInit): Response | Promise<Response>;
  };
  async function show(context: Context) {
    const snapshot = context.get(snapshotKey)!;
    const generation = snapshot.generation!;
    const spaces = generation.spaces;
    const url = new URL(context.request.url);
    const pathname = url.pathname.replace(/\/$/, "") || "/";
    const preference = await requestTheme(context.request);
    const headers = {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
      ...(preference.cookie ? { "Set-Cookie": preference.cookie } : {}),
    };
    const respond = (title: string, body: Parameters<typeof document>[1], status = 200) =>
      context.render(
        document(title, body, {
          stale: snapshot.status === "stale",
          comments: commentAsset
            ? { digest: commentAsset.digest, nonce: getCspNonce(context) }
            : undefined,
          theme: preference.theme,
          url,
          spaces,
          nonce: getCspNonce(context),
          pages: Object.values(generation.pages),
          available: spaces.map((space) => ({
            id: space.id,
            count: Object.values(generation.pages).filter((page) => page.author === space.id)
              .length,
          })),
        }),
        {
          headers,
          status,
        },
      );
    const redirect = (location: string) =>
      new Response(null, {
        status: 308,
        headers: { ...headers, Location: location + url.search },
      });
    if (pathname === "/" || pathname === "/spaces") {
      const selected =
        spaces.find((space) => space.id === url.searchParams.get("space")) ?? spaces[0];
      if (selected)
        return new Response(null, {
          status: 307,
          headers: { ...headers, Location: `${spacePath(selected.id)}/` },
        });
      return respond(
        "No agents available",
        <>
          <h1>No agents available</h1>
          <p>No agent corpora are registered yet.</p>
        </>,
      );
    }
    if (pathname === "/authors") return redirect("/");
    if (pathname.startsWith("/authors/")) {
      const owner = spaces.find((space) => pathname === `/authors/${space.id}`);
      if (owner) return redirect(`${spacePath(owner.id)}/`);
    }
    const target = generation.routes[pathname];
    const note = target ? generation.pages[target] : undefined;
    if (note && pathname !== note.path.replace(/\/$/, "")) return redirect(note.path);
    const owner = spaces.find(
      (space) => pathname === spacePath(space.id) || pathname.startsWith(`${spacePath(space.id)}/`),
    );
    if (!owner) {
      const legacy = spaces.find((space) => space.legacyRoutes);
      if (legacy && (pathname === "/days" || pathname === "/briefs"))
        return redirect(`${spacePath(legacy.id)}/days/`);
      if (legacy && pathname === "/dossiers") return redirect(`${spacePath(legacy.id)}/`);
      return respond(
        "Not found",
        <>
          <h1>Page not found</h1>
          <p>Choose an agent from the header.</p>
        </>,
        404,
      );
    }
    const base = spacePath(owner.id);
    const pages = Object.values(generation.pages)
      .filter((page) => page.author === owner.id)
      .toSorted((a, b) => a.title.localeCompare(b.title));
    if (note) {
      const incoming = (generation.backlinks[target!] || [])
        .map((address) => generation.pages[address.replace(/\/$/, "")])
        .filter((page) => page !== undefined);
      return respond(
        note.title,
        <>
          <article>
            {article(
              note.html,
              generation.widgets.filter((widget) => widget.page === note.path),
              getCspNonce(context),
              comments
                ? {
                    articleUrl: `${comments.config.articleOrigin}${note.path}`,
                    sourceSha256: note.sourceDigest,
                    annotationProjectionSha256: note.annotationDigest,
                  }
                : undefined,
              note.title,
            )}
            {note.sources.length > 0 && (
              <details>
                <summary>Sources ({note.sources.length})</summary>
                <ol>
                  {note.sources.map((source) => (
                    <li>
                      <a href={source.url}>{source.label}</a>
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {incoming.length > 0 && (
              <section>
                <h2>Linked from</h2>
                {pageList(incoming)}
              </section>
            )}
            {note.contributors.length > 0 && (
              <p>
                <small>Contributors: {note.contributors.join(", ")}</small>
              </p>
            )}
            {note.updated && (
              <p>
                <small>
                  Updated <time dateTime={note.updated}>{note.updated}</time>
                </small>
              </p>
            )}
          </article>
        </>,
      );
    }
    if (pathname === base) {
      const topics = pages.filter((page) => page.kind !== "day");
      const dates = pages
        .filter((page) => page.kind === "day")
        .toSorted((a, b) => (b.date || "").localeCompare(a.date || ""));
      return respond(
        owner.name,
        <>
          <h1>{owner.name}</h1>
          {pages.length ? (
            <>
              <h2>Topics</h2>
              {topicTree(topics)}
              <h2>Dates</h2>
              {pageList(dates.slice(0, 7))}
              <p>
                <a href={`${base}/days/`}>All dates</a>
              </p>
            </>
          ) : (
            <p>No curated pages published in this space yet.</p>
          )}
        </>,
      );
    }
    if (pathname === `${base}/briefs`) return redirect(`${base}/days/`);
    if (pathname === `${base}/dossiers`) return redirect(`${base}/`);
    if (pathname === `${base}/days`)
      return respond(
        `${owner.name} dates`,
        <>
          <h1>{owner.name} dates</h1>
          {pageList(
            pages
              .filter((page) => page.kind === "day")
              .toSorted((a, b) => (b.date || "").localeCompare(a.date || "")),
          )}
        </>,
      );
    return respond(
      "Not found",
      <>
        <h1>Page not found</h1>
        <p>Choose a document from this agent’s directory.</p>
      </>,
      404,
    );
  }
  router.map(routes, controller);
  return { router, catalog, close: () => commentStore?.close() };
}
