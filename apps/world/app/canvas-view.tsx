import { clientEntry, ref } from "remix/component";
export function createCanvas(
  loadClient?: () => Promise<{
    mount(canvas: HTMLCanvasElement, signal: AbortSignal): void;
  }>,
) {
  return clientEntry("file:///app/canvas.tsx#Canvas", function Canvas() {
    return () => (
      <canvas
        aria-label="Pool hall"
        aria-describedby="controls"
        tabIndex={0}
        mix={ref((canvas, signal) => {
          void loadClient?.()
            .then(({ mount }) => {
              if (!signal.aborted) mount(canvas, signal);
            })
            .catch(() => {
              if (!signal.aborted)
                canvas.parentElement
                  ?.querySelector("#status")
                  ?.replaceChildren("Could not load the hall.");
            });
        })}
      />
    );
  });
}
