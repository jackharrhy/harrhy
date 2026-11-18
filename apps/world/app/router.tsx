import { csp, getCspNonce } from "remix/middleware/csp";
import { render } from "remix/middleware/render";
import { createRouter, type MiddlewareContext } from "remix/router";
import { Canvas } from "./canvas";
import { routes } from "./routes";

type Context = MiddlewareContext<[ReturnType<typeof csp>, ReturnType<typeof render>]>;
const router = createRouter<Context>({
  middleware: [
    csp({
      policy: ({ nonce, context }) => {
        const { host, protocol } = new URL(context.request.url);
        return {
          defaultSrc: ["'none'"],
          scriptSrc: ["'self'", "'nonce-" + nonce + "'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'nonce-" + nonce + "'"],
          styleSrcAttr: ["'unsafe-inline'"],
          connectSrc: ["'self'", (protocol === "https:" ? "wss://" : "ws://") + host],
          imgSrc: ["'self'", "data:"],
          baseUri: ["'none'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        };
      },
    }),
    render({
      assets: {
        async getScriptEntry(id) {
          if (id !== "file:///app/canvas.tsx") throw Error("Unknown World entry");
          return { href: "/assets/world.js", preloads: [], importMap: { imports: {} } };
        },
      },
    }),
  ],
});
router.map(routes.home, (context) =>
  context.render(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <script type="module" nonce={getCspNonce(context)} src="/assets/boot.js" />
        <title>World | Empty Hall</title>
        <link rel="stylesheet" href="/world.css" />
      </head>
      <body>
        <main id="hall">
          <Canvas />
          <header>
            <h1>World</h1>
            <p>The empty hall</p>
            <p id="status" role="status">
              Loading the hall…
            </p>
            <button type="button" id="enter" disabled>
              Click to look
            </button>
            <p id="controls">WASD walk · Space jump · Arrow keys turn · Esc releases mouse</p>
          </header>
          <span class="reticle" aria-hidden="true">
            ·
          </span>
        </main>
      </body>
    </html>,
  ),
);
export { router };
