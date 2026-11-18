import type { Handle } from "remix/component";
import { renderToStream } from "remix/component/server";
import { cleanTheme, themeStyles } from "@harrhy/ui/theme";

import { reviewStyles } from "./review-styles.ts";

const theme = themeStyles(cleanTheme);

function Document(handle: Handle<{ detail: boolean }>) {
  return () => (
    <html lang="en" mix={[theme, reviewStyles]}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Harrhy Review</title>
        <script type="module" src="/browser.js"></script>
      </head>
      <body>
        <header class="masthead">
          <a class="brand" href="/">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path d="M6 4v16m0-8h5a5 5 0 0 0 5-5V4m0 16v-4" />
              <circle cx="16" cy="16" r="2" fill="currentColor" />
            </svg>
            Harrhy Review
          </a>
          <span class="muted">Local workspace</span>
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
