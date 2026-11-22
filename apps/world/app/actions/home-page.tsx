import { Button, Inline, Panel, Text } from "@harrhy/ui/native";
import { themeRoot } from "@harrhy/ui/theme";
import { css, type Handle } from "remix/component";
import { createCanvas } from "../canvas-view";
import { woodTheme } from "../wood";

const Canvas = createCanvas();

const documentStyles = css({ margin: 0 });
const hallStyles = css({
  position: "relative",
  height: "100dvh",
  overflow: "hidden",
  "& canvas": {
    width: "100%",
    height: "100%",
    display: "block",
    touchAction: "none",
  },
  "& canvas:focus": { outline: "none" },
});
const hudStyles = css({
  position: "absolute",
  pointerEvents: "none",
  backgroundSize: "auto, 320px",
  left: "max(0.75rem, env(safe-area-inset-left))",
  right: "max(0.75rem, env(safe-area-inset-right))",
  width: "fit-content",
});
const inputStyles = css({
  bottom: "max(0.75rem, env(safe-area-inset-bottom))",
  marginInlineStart: "auto",
  "& button, & input": { pointerEvents: "auto" },
});
const hintStyles = css({ marginTop: "0.375rem", fontSize: "0.8125rem" });
export function HomePage(handle: Handle<{ nonce?: string }>) {
  return () => (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <script
          type="module"
          nonce={handle.props.nonce}
          src="/assets/boot.js"
        />
        <title>World | Pool Hall</title>
        <link rel="stylesheet" href="/world.css" />
      </head>
      <body mix={[documentStyles, woodTheme, themeRoot]}>
        <main id="hall" data-mode="walk" mix={hallStyles}>
          <Canvas />
          <Panel aria-label="Movement controls" mix={[hudStyles, inputStyles]}>
            <Inline>
              <Button id="enter" disabled>
                Click to look
              </Button>
            </Inline>
            <div id="chess-controls" hidden>
              <Text id="chess-status" aria-live="polite" />
              <Inline>
                <Button id="chess-rematch">Rematch</Button>
                <Button id="chess-leave">Leave table</Button>
              </Inline>
              <Inline
                id="chess-promotion"
                role="group"
                aria-label="Promote pawn"
                hidden
              >
                <Button data-promotion="q">Queen</Button>
                <Button data-promotion="r">Rook</Button>
                <Button data-promotion="b">Bishop</Button>
                <Button data-promotion="n">Knight</Button>
                <Button id="chess-promotion-cancel">Cancel</Button>
              </Inline>
            </div>
            <div id="pool-controls" hidden>
              <Text id="pool-status" aria-live="polite" />
              <Inline>
                <Button id="pool-join">Join table</Button>
                <Button id="pool-bot">Play Moss</Button>
                <Button id="pool-rematch" hidden>
                  Rematch
                </Button>
                <Button id="pool-leave" hidden>
                  Leave table
                </Button>
              </Inline>
              <div id="pool-shot-controls" hidden>
                <label for="pool-aim">Aim</label>
                <input
                  id="pool-aim"
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value="90"
                />
                <label for="pool-power">Power</label>
                <input
                  id="pool-power"
                  type="range"
                  min="0.08"
                  max="1"
                  step="0.01"
                  value="0.55"
                />
                <Button id="pool-shoot">Shoot</Button>
                <Button id="pool-place" hidden>
                  Place cue ball
                </Button>
              </div>
            </div>
            <Text id="status" role="status" tone="muted" mix={hintStyles}>
              Loading the hall…
            </Text>
            <Text id="controls" mix={hintStyles}>
              Right-drag to orbit · Click to walk · Scroll to zoom
            </Text>
          </Panel>
          <span class="reticle" aria-hidden="true" />
        </main>
      </body>
    </html>
  );
}
