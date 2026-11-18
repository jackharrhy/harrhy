import type { Handle } from "remix/component";
import { renderToStream } from "remix/component/server";
import { ButtonLink } from "@harrhy/ui/native";
import { cleanTheme, themeStyles } from "@harrhy/ui/theme";

import { reviewStyles } from "./review-styles.ts";

const theme = themeStyles(cleanTheme);

function Document(handle: Handle<{ detail: boolean }>) {
  return () => (
    <html lang="en" mix={[theme, reviewStyles]}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>review</title>
        <script type="module" src="/browser.js"></script>
      </head>
      <body>
        <header class="masthead">
          {handle.props.detail ? (
            <ButtonLink href="/" class="back">
              ← Inbox
            </ButtonLink>
          ) : null}
          <a class="brand" href="/">
            <span aria-hidden="true">🔍</span>
            review
          </a>
          <div id="view-controls">
            <span class="muted">Local workspace</span>
          </div>
        </header>
        <main
          id="review-app"
          class={handle.props.detail ? "workspace" : "workspace inbox"}
        >
          <h1>{handle.props.detail ? "Review" : "Review inbox"}</h1>
          <p role="status">Loading…</p>
          <noscript>
            Enable JavaScript to open local reviews and leave comments.
          </noscript>
        </main>
      </body>
    </html>
  );
}

export function page(request: Request): Response {
  return new Response(
    renderToStream(<Document detail={new URL(request.url).pathname !== "/"} />),
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
