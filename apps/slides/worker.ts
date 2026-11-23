import { newHttpBatchRpcResponse, RpcTarget } from "capnweb";
import { createRouter } from "remix/router";
import { get, post, route } from "remix/routes";
import { readRequestBody } from "@harrhy/request-body";
import { createSlidesAuth, type SlidesAuthEnv } from "./auth.ts";
import { renderDeck } from "./render.ts";
import { allo, css, player } from "./dist/assets.ts";
import { editorPage } from "./editor.tsx";
import type { DraftView, Position, Slide } from "./deck.ts";
import { MAX_FORM } from "./deck-cell.ts";
export { DeckCell } from "./deck-cell.ts";
export { PresentationCell } from "./presentation-cell.ts";

const routes = route({
  home: get("/"),
  font: get("/allo.woff2"),
  position: get("/position"),
  watch: get("/watch"),
  change: post("/position"),
  editor: get("/edit"),
  edit: post("/edit"),
  media: get("/media/:id"),
  draftMedia: get("/edit/media/:id"),
  login: get("/auth/login"),
  callback: get("/auth/callback"),
  logout: post("/auth/logout"),
});

interface Navigation {
  position: number;
  action?: string;
  alternate?: boolean;
  revision: number;
}
class Presenter extends RpcTarget {
  #apply;
  constructor(apply: (command: Navigation) => Promise<unknown>) {
    super();
    this.#apply = apply;
  }
  goTo(position: number, revision: number) {
    return this.#apply({ position, revision });
  }
  runAction(
    position: number,
    action: string,
    alternate: boolean | undefined,
    revision: number,
  ) {
    return this.#apply({ position, action, alternate, revision });
  }
}
const endpoint = (path: string) => "https://deck.internal" + path;

const denied = () =>
  new Response("Forbidden", {
    status: 403,
    headers: { "Cache-Control": "no-store" },
  });

export default {
  fetch(
    request: Request,
    env: Env & SlidesAuthEnv & { HARRHY_SLIDES_DECK_ID?: string },
  ) {
    const auth = createSlidesAuth(env);
    const deck = env.DECKS.getByName(env.HARRHY_SLIDES_DECK_ID ?? "default");
    const canEdit = async () =>
      env.HARRHY_SLIDES_PRESENTER_WRITES === "1" &&
      (await auth.isPresenter(request));
    const sameOrigin =
      request.headers.get("Origin") === env.HARRHY_SLIDES_ORIGIN;
    const apply = (command: Navigation) =>
      deck.fetch(endpoint("/position"), {
        method: "POST",
        body: JSON.stringify(command),
      });
    const router = createRouter();
    router.map(routes, {
      actions: {
        async home() {
          const [page, signedIn] = await Promise.all([
            deck.fetch(endpoint("/page")),
            auth.isPresenter(request),
          ]);
          if (!page.ok)
            return new Response("Presentation unavailable", { status: 503 });
          return document(
            await renderDeck({
              ...(await page.json<Position & { slides: Slide[] }>()),
              css,
              player,
              signedIn,
              presenter: signedIn && env.HARRHY_SLIDES_PRESENTER_WRITES === "1",
              signIn: auth.enabled,
            }),
          );
        },
        async editor() {
          if (!(await canEdit())) return denied();
          const view = await deck.fetch(endpoint("/draft"));
          return document(
            await editorPage(
              await view.json<DraftView>(),
              new URL(request.url).searchParams.get("slide"),
            ),
          );
        },
        async edit() {
          if (!sameOrigin || !(await canEdit())) return denied();
          const type = request.headers.get("Content-Type") ?? "";
          if (
            !/^(?:multipart\/form-data;|application\/x-www-form-urlencoded(?:;|$))/i.test(
              type,
            )
          )
            return new Response(null, { status: 415 });
          const body = await readRequestBody(request, {
            maxBytes: type.startsWith("multipart/") ? MAX_FORM : 64 * 1024,
            timeoutMs: 15000,
          });
          if (!body.ok)
            return new Response("Invalid edit body", {
              status: body.error === "too_large" ? 413 : 400,
            });
          return deck.fetch(endpoint("/draft"), {
            method: "POST",
            headers: { "Content-Type": type },
            body: Uint8Array.from(body.bytes),
          });
        },
        media({ params }) {
          return deck.fetch(
            endpoint("/media?id=" + encodeURIComponent(params.id)),
          );
        },
        async draftMedia({ params }) {
          return (await canEdit())
            ? deck.fetch(
                endpoint("/draft-media?id=" + encodeURIComponent(params.id)),
              )
            : denied();
        },
        font: () =>
          new Response(Uint8Array.fromBase64(allo), {
            headers: {
              "Content-Type": "font/woff2",
              "Cache-Control": "public, max-age=86400",
            },
          }),
        position() {
          return deck.fetch(endpoint("/position"));
        },
        watch() {
          if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
            return new Response(null, { status: 426 });
          if (
            request.headers.get("Origin") !==
            (env.HARRHY_SLIDES_ORIGIN ?? new URL(request.url).origin)
          )
            return denied();
          return deck.fetch(endpoint("/watch" + new URL(request.url).search), {
            headers: { Upgrade: "websocket" },
          });
        },
        async change() {
          if (!sameOrigin || !(await canEdit())) return denied();
          const type = request.headers
            .get("Content-Type")
            ?.split(";")[0]
            ?.trim();
          if (type !== "application/json" && type !== "text/plain") {
            return new Response("Unsupported content type", { status: 415 });
          }
          const body = await readRequestBody(request, {
            maxBytes: type === "text/plain" ? 4096 : 128,
            timeoutMs: 3000,
          });
          if (!body.ok) {
            return new Response("Invalid request body", {
              status: body.error === "too_large" ? 413 : 400,
            });
          }
          if (type === "text/plain") {
            const bounded = new Request(request.url, {
              method: "POST",
              body: Uint8Array.from(body.bytes),
            });
            let used = false;
            return newHttpBatchRpcResponse(
              bounded,
              new Presenter(async (command) => {
                if (used) throw new Error("One presenter command per request");
                used = true;
                const result = await apply(command);
                if (!result.ok) throw new Error("Presenter command rejected");
                return result.json();
              }),
            );
          }
          try {
            return await apply(
              JSON.parse(new TextDecoder().decode(body.bytes)),
            );
          } catch {
            return new Response("Invalid JSON", { status: 400 });
          }
        },
        login: () => auth.login(request),
        callback: () => auth.callback(request),
        logout: () => auth.logout(request),
      },
    });
    return router.fetch(request);
  },
};

function document(body: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
    },
  });
}
