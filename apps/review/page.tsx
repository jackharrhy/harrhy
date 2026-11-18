import type { Handle } from "remix/component";
import { renderToStream } from "remix/component/server";
import { ButtonLink } from "@harrhy/ui/native";
import { cleanTheme, themeStyles } from "@harrhy/ui/theme";
import type { ReviewCell } from "./cell.ts";
import { reviewStyles } from "./review-styles.ts";

const theme = themeStyles(cleanTheme);
type Summary = ReturnType<ReviewCell["list"]>[number];
type Detail = NonNullable<ReturnType<ReviewCell["get"]>>;
type Page = { reviews: Summary[] } | { review: Detail };

function Inbox(handle: Handle<{ reviews: Summary[] }>) {
  return () => (
    <>
      <div class="review-header">
        <h1>Review inbox</h1>
        <p class="muted">Saved comparisons on this device.</p>
      </div>
      {handle.props.reviews.length ? (
        <ul class="panel review-list">
          {handle.props.reviews.map((review) => {
            const created = new Date(review.created).toISOString();
            return (
              <li>
                <a href={`/reviews/${review.id}`} data-testid="review-link">
                  <span class="review-entry">
                    <strong>{review.title}</strong>
                    <span class="row muted">
                      {review.fileCount}{" "}
                      {review.fileCount === 1 ? "file" : "files"} changed · Base
                      <code>{review.base.slice(0, 7)}</code> → Head
                      <code>{review.head.slice(0, 7)}</code>
                    </span>
                  </span>
                  <time dateTime={created}>
                    {created.slice(0, 16).replace("T", " ")} UTC
                  </time>
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <p class="panel inset">
          No reviews yet. Create a review from your terminal to see it here.
        </p>
      )}
    </>
  );
}

function Document(handle: Handle<Page>) {
  return () => {
    const data = handle.props;
    const detail = "review" in data;
    return (
      <html lang="en" mix={[theme, reviewStyles]}>
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>review</title>
          {detail ? <script type="module" src="/browser.js"></script> : null}
        </head>
        <body>
          <header class="masthead">
            {detail ? (
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
            class={detail ? "workspace" : "workspace inbox"}
          >
            {detail ? (
              <div class="review-header">
                <h1>{data.review.title}</h1>
                <p class="muted">
                  {data.review.fileCount}{" "}
                  {data.review.fileCount === 1 ? "file" : "files"} changed
                </p>
                <noscript>
                  Enable JavaScript to view the diff and leave comments.
                </noscript>
              </div>
            ) : (
              <Inbox reviews={data.reviews} />
            )}
          </main>
          {detail ? (
            <div id="review-data" hidden>
              {JSON.stringify(data.review)}
            </div>
          ) : null}
        </body>
      </html>
    );
  };
}

export function page(data: Page): Response {
  return new Response(renderToStream(<Document {...data} />), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
