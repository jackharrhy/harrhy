import type { Snapshot } from "../pi/catalog.ts";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { themeRoot, themeStyles } from "@harrhy/ui/theme";
import { css, unsafeHTML } from "remix/component";
import { renderToString } from "remix/component/server";
import { createRouter } from "remix/router";
import { OwnerSessions } from "../shell.tsx";
import {
  SESSION_LIST_PATH,
  sessionKey,
  canonicalSessionRedirect,
} from "../routes.ts";
import { localizeMessageTime } from "../conversation/message-time.ts";
import { ownerScheme, ownerTheme } from "../settings/appearance.ts";
import type { Mode, Tint } from "../settings/theme-cookie.ts";
declare const OWNER_BROWSER_MODULE: string;
// Run after the transcript markup, independently of the deferred browser bundle.
const positionTranscript = `(()=>{document.querySelectorAll('time[data-message-time]').forEach(${localizeMessageTime.toString()});const node=document.querySelector('[aria-label="Transcript"]');if(node){node.scrollTop=node.scrollHeight;node.dataset.ssrPositioned='true'}})();`;
const positionHash = createHash("sha256")
  .update(positionTranscript)
  .digest("base64");
const headersFor = (ownerHost: string) => ({
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval' 'sha256-${positionHash}'; connect-src 'self' wss://${ownerHost}; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
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
  mode?: Mode,
  tint?: Tint,
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
  const brand = snapshot?.branding;
  const html = await renderToString(
    <html
      lang="en"
      data-pi-tint={brand?.tint != null ? "custom" : undefined}
      style={
        brand?.tint != null
          ? { "--pi-base-hue": String(brand.tint) }
          : undefined
      }
      data-clank-tint={tint === "pi" ? undefined : tint}
      data-theme={mode === "system" ? undefined : mode}
      mix={[themeStyles(ownerTheme), ownerScheme]}
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{brand?.name ?? "Clank"}</title>
        {brand?.logo && <link rel="icon" type="image/png" href={brand.logo} />}
        <script type="module" src="/owner-sessions.js" />
      </head>
      <body
        mix={[
          themeRoot,
          css({
            margin: 0,
            minHeight: "100dvh",
            backgroundColor: "var(--hui-surface)",
          }),
        ]}
      >
        <OwnerSessions
          initialTint={tint}
          initialMode={mode}
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
  return (request: Request, snapshot?: Snapshot, mode?: Mode, tint?: Tint) => {
    const path = new URL(request.url).pathname;
    return path === "/" || path === SESSION_LIST_PATH || sessionKey(path)
      ? document(
          headers,
          snapshot,
          path === SESSION_LIST_PATH,
          sessionKey(path),
          mode,
          tint,
        )
      : router.fetch(request);
  };
}
