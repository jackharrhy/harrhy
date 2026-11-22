import { csp, getCspNonce } from "remix/middleware/csp";
import { render } from "remix/middleware/render";
import { createRouter, type MiddlewareContext } from "remix/router";
import { HomePage } from "./actions/home-page";
import { routes } from "./routes";

type Context = MiddlewareContext<
  [ReturnType<typeof csp>, ReturnType<typeof render>]
>;
const router = createRouter<Context>({
  middleware: [
    csp({
      policy: ({ nonce, context }) => {
        const { host, protocol } = new URL(context.request.url);
        return {
          defaultSrc: ["'none'"],
          scriptSrc: [
            "'self'",
            "'nonce-" + nonce + "'",
            "'wasm-unsafe-eval'",
            "'unsafe-eval'",
          ],
          styleSrc: ["'self'", "'nonce-" + nonce + "'"],
          styleSrcAttr: ["'unsafe-inline'"],
          connectSrc: [
            "data:",
            "'self'",
            (protocol === "https:" ? "wss://" : "ws://") + host,
          ],
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
          if (id !== "file:///app/canvas.tsx")
            throw Error("Unknown World entry");
          return {
            href: "/assets/world.js",
            preloads: [],
            importMap: { imports: {} },
          };
        },
      },
    }),
  ],
});
router.map(routes.home, (context) =>
  context.render(<HomePage nonce={getCspNonce(context)} />),
);
export { router };
