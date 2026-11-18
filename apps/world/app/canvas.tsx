import { clientEntry, ref } from "remix/component";
export const Canvas = clientEntry("file:///app/canvas.tsx#Canvas", function Canvas() {
  return () => (
    <canvas
      aria-label="Empty pool hall"
      aria-describedby="controls"
      tabIndex={0}
      mix={ref((canvas, signal) => {
        void import("./client")
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
