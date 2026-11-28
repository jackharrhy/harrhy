import type { Snapshot } from "./catalog.ts";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { themeRoot, themeStyles } from "@harrhy/ui/theme";
import { css, unsafeHTML } from "remix/component";
import { renderToString } from "remix/component/server";
import { createRouter } from "remix/router";
import { OwnerSessions } from "./sessions.tsx";
import {
  SESSION_LIST_PATH,
  sessionKey,
  canonicalSessionRedirect,
} from "./routes.ts";
import { localizeMessageTime } from "./message-time.ts";
import { ownerScheme, ownerTheme, themeBootstrap } from "./appearance.ts";
declare const OWNER_BROWSER_MODULE: string;
// Run after the transcript markup, independently of the deferred browser bundle.
const positionTranscript = `(()=>{document.querySelectorAll('time[data-message-time]').forEach(${localizeMessageTime.toString()});const node=document.querySelector('[aria-label="Transcript"]');if(node){node.scrollTop=node.scrollHeight;node.dataset.ssrPositioned='true'}})();`;
const positionHash = createHash("sha256")
  .update(positionTranscript)
  .digest("base64");
const themeHash = createHash("sha256").update(themeBootstrap).digest("base64");
const headersFor = (ownerHost: string) => ({
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'self' 'sha256-${positionHash}' 'sha256-${themeHash}'; connect-src 'self' wss://${ownerHost}; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
});
const localFamiliarId = (() => {
  try {
    return readFileSync(".celld/owner/familiar-session", "utf8").trim();
  } catch {
    return undefined;
  }
})();
export const familiarId =
  process.env.HARRHY_CLANK_FAMILIAR_SESSION_ID || localFamiliarId;
async function document(
  headers: Record<string, string>,
  snapshot?: Snapshot,
  listPage = false,
  target?: string,
) {
  const location = canonicalSessionRedirect(
    target,
    snapshot?.rows.find((row) => row.id === snapshot.selectedId),
  );
  if (location)
    return new Response(null, {
      status: 302,
      headers: { ...headers, Location: location },
    });
  const html = await renderToString(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Clank</title>
        <script innerHTML={unsafeHTML(themeBootstrap)} />
        <script type="module" src="/owner-sessions.js" />
      </head>
      <body
        mix={[
          themeStyles(ownerTheme),
          themeRoot,
          ownerScheme,
          css({
            margin: 0,
            minHeight: "100dvh",
            backgroundColor: "var(--hui-surface)",
          }),
        ]}
      >
        <OwnerSessions
          renderedAt={Date.now()}
          listPage={listPage}
          target={target}
          familiarId={familiarId}
          snapshot={snapshot ? JSON.stringify(snapshot) : undefined}
        />
        {!listPage && snapshot?.chat?.view && (
          <script innerHTML={unsafeHTML(positionTranscript)} />
        )}
      </body>
    </html>,
  );
  return new Response(`<!doctype html>${html}`, {
    status: target && snapshot && !snapshot.selectedId ? 404 : 200,
    headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
}
export function createDocumentServer(ownerHost: string) {
  const headers = headersFor(ownerHost);
  const router = createRouter();
  router.get(
    "/owner-sessions.js",
    () =>
      new Response(OWNER_BROWSER_MODULE, {
        headers: {
          ...headers,
          "Content-Type": "text/javascript; charset=utf-8",
        },
      }),
  );
  return (request: Request, snapshot?: Snapshot) => {
    const path = new URL(request.url).pathname;
    return path === "/" || path === SESSION_LIST_PATH || sessionKey(path)
      ? document(
          headers,
          snapshot,
          path === SESSION_LIST_PATH,
          sessionKey(path),
        )
      : router.fetch(request);
  };
}
