import { Button, Heading, Inline, Panel, Text } from "@harrhy/ui/native";
import { themeRoot } from "@harrhy/ui/theme";
import { css } from "remix/component";
import { csp, getCspNonce } from "remix/middleware/csp";
import { render } from "remix/middleware/render";
import { createRouter, type MiddlewareContext } from "remix/router";
import { Canvas } from "./canvas";
import { routes } from "./routes";
import { woodTheme } from "./wood";

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
const documentStyles = css({ margin: 0 });
const hallStyles = css({
  position: "relative",
  height: "100dvh",
  overflow: "hidden",
  "& canvas": { width: "100%", height: "100%", display: "block", touchAction: "none" },
  "& canvas:focus-visible": { outline: "2px solid var(--hui-focus)", outlineOffset: "-3px" },
});
const hudStyles = css({
  position: "absolute",
  pointerEvents: "none",
  backgroundSize: "auto, 320px",
  left: "max(0.75rem, env(safe-area-inset-left))",
  right: "max(0.75rem, env(safe-area-inset-right))",
  width: "fit-content",
});
const identityStyles = css({ top: "max(0.75rem, env(safe-area-inset-top))" });
const inputStyles = css({
  bottom: "max(0.75rem, env(safe-area-inset-bottom))",
  marginInlineStart: "auto",
  "& button": { pointerEvents: "auto" },
});
const titleStyles = css({ fontSize: "1.25rem", fontWeight: 600 });
const hintStyles = css({ marginTop: "0.375rem", fontSize: "0.8125rem" });
const modeStyles = css({
  '&[aria-pressed="true"]': {
    backgroundColor: "var(--hui-accent)",
    color: "var(--hui-on-accent)",
  },
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
      <body mix={[documentStyles, woodTheme, themeRoot]}>
        <main id="hall" data-mode="walk" mix={hallStyles}>
          <Canvas />
          <Panel aria-labelledby="world-title" mix={[hudStyles, identityStyles]}>
            <Heading level={1} id="world-title" mix={titleStyles}>
              World
            </Heading>
            <Text id="status" role="status" tone="muted">
              Loading the hall…
            </Text>
          </Panel>
          <Panel aria-label="Movement controls" mix={[hudStyles, inputStyles]}>
            <Inline>
              <Button id="mode" aria-pressed={false} disabled mix={modeStyles}>
                FPS mode
              </Button>
              <Button id="enter" disabled>
                Click to look
              </Button>
            </Inline>
            <Text id="controls" mix={hintStyles}>
              Drag to look · Tap the floor to walk
            </Text>
          </Panel>
          <span class="reticle" aria-hidden="true" />
        </main>
      </body>
    </html>,
  ),
);
export { router };
