import { createRouter, createController } from "remix/router";
import { render } from "remix/middleware/render";
import { csp } from "remix/middleware/csp";
import { createCatalog } from "./content/catalog.ts";
import { routes } from "./routes.ts";
import { spaces, spacePath } from "./spaces.ts";
import { document, pageList, topicTree, article, trail } from "./ui.tsx";

export async function createAtlas(root: string) {
  const catalog = createCatalog({ root, authors: spaces });
  const initial = await catalog.refresh();
  if (!initial.generation)
    throw new Error("Atlas requires a valid curated catalog before startup");
  const router = createRouter({
    middleware: [
      csp({
        policy: {
          defaultSrc: ["'none'"],
          scriptSrc: ["'none'"],
          styleSrc: ["'unsafe-inline'"],
          imgSrc: ["'none'"],
          formAction: ["'self'"],
          baseUri: ["'none'"],
          frameAncestors: ["'none'"],
        },
      }),
    ],
  });
  const controller = createController(routes, {
    middleware: [render()],
    actions: {
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
      search: show,
      space: show,
      spaceSearch: show,
      authors: show,
      author: show,
      page: show,
    },
  });
  interface Context {
    request: Request;
    render(
      node: Parameters<typeof document>[1],
      init?: ResponseInit,
    ): Response | Promise<Response>;
  }
  async function show(context: Context) {
    const snapshot = catalog.read();
    const generation = snapshot.generation!;
    const url = new URL(context.request.url);
    const pathname = url.pathname.replace(/\/$/, "") || "/";
    const headers = {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    };
    const respond = (
      title: string,
      body: Parameters<typeof document>[1],
      status = 200,
    ) =>
      context.render(document(title, body, snapshot.status === "stale"), {
        headers,
        status,
      });
    const redirect = (location: string) =>
      new Response(null, {
        status: 308,
        headers: { ...headers, Location: location + url.search },
      });
    if (pathname === "/authors") return redirect("/");
    if (pathname.startsWith("/authors/")) {
      const owner = spaces.find((space) => pathname === `/authors/${space.id}`);
      if (owner) return redirect(`${spacePath(owner.id)}/`);
    }
    if (pathname === "/" || pathname === "/search") {
      return respond(
        "Agent spaces",
        <>
          <h1>Agent spaces</h1>
          <p>Choose an agent’s corpus to browse or search.</p>
          <ul>
            {spaces.map((space) => (
              <li>
                <a href={`${spacePath(space.id)}/`}>{space.name}</a>
              </li>
            ))}
          </ul>
        </>,
      );
    }
    const target = generation.routes[pathname];
    const note = target ? generation.pages[target] : undefined;
    if (note && pathname !== note.path.replace(/\/$/, ""))
      return redirect(note.path);
    const owner = spaces.find(
      (space) =>
        pathname === spacePath(space.id) ||
        pathname.startsWith(`${spacePath(space.id)}/`),
    );
    if (!owner) {
      if (pathname === "/days" || pathname === "/briefs")
        return redirect("/spaces/wonder/days/");
      if (pathname === "/dossiers") return redirect("/spaces/wonder/");
      return respond(
        "Not found",
        <>
          {trail()}
          <h1>Page not found</h1>
          <p>Choose an agent space from the directory.</p>
        </>,
        404,
      );
    }
    const base = spacePath(owner.id);
    const pages = Object.values(generation.pages)
      .filter((page) => page.author === owner.id)
      .toSorted((a, b) => a.title.localeCompare(b.title));
    const navigation = trail(owner);
    if (pathname === `${base}/search`) {
      const query = (url.searchParams.get("q") || "").trim().slice(0, 200);
      const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const matches = terms.length
        ? generation.search
            .filter(
              (page) =>
                page.author === owner.id &&
                terms.every((term) =>
                  `${page.title} ${page.text}`
                    .toLocaleLowerCase()
                    .includes(term),
                ),
            )
            .slice(0, 100)
        : [];
      return respond(
        `Search ${owner.name}`,
        <>
          {navigation}
          <h1>Search {owner.name}</h1>
          <form action={`${base}/search/`} method="get">
            <label htmlFor="query">Words in {owner.name}’s corpus</label>
            <p>
              <input id="query" name="q" value={query} maxLength={200} />{" "}
              <button type="submit">Search</button>
            </p>
          </form>
          {query && (
            <>
              <p>
                {matches.length
                  ? `${matches.length} matching pages`
                  : "No matching pages. Try fewer words."}
              </p>
              {matches.length > 0 && pageList(matches)}
            </>
          )}
        </>,
      );
    }
    if (note) {
      const incoming = (generation.backlinks[target!] || [])
        .map((address) => generation.pages[address.replace(/\/$/, "")])
        .filter((page) => page !== undefined);
      return respond(
        note.title,
        <>
          {navigation}
          <article>
            <h1>{note.title}</h1>
            {article(note.html)}
            {pages.some((child) => child.parent === note.path) && (
              <section>
                <h2>Pages</h2>
                {topicTree(pages, note.path)}
              </section>
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
          {navigation}
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
          {navigation}
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
        {navigation}
        <h1>Page not found</h1>
        <p>Browse or search this agent’s corpus.</p>
      </>,
      404,
    );
  }
  router.map(routes, controller);
  return { router, catalog };
}
