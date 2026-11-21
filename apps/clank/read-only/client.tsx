import { createRoot, css, type Handle } from "remix/component";
import { Heading, Stack } from "@harrhy/ui/native";
import { cleanTheme, themeRoot, themeStyles } from "@harrhy/ui/theme";
import { layoutOverview, type OverviewRow } from "../app/overview-layout.ts";
import { OverviewCanvas } from "../app/overview-canvas.tsx";
function ReadOnlyOverview(handle: Handle) {
  let graph: ReturnType<typeof layoutOverview> | undefined;
  const events = new EventSource("/catalog");
  events.addEventListener("message", (e) => {
    graph = layoutOverview(JSON.parse(e.data) as OverviewRow[]);
    handle.update();
  });
  events.addEventListener("error", () => {
    graph = undefined;
    handle.update();
  });
  handle.signal.addEventListener("abort", () => events.close(), { once: true });
  return () => (
    <section
      mix={[
        themeStyles(cleanTheme),
        themeRoot,
        css({ maxWidth: "56rem", margin: "auto", padding: "1rem" }),
      ]}
    >
      <Stack>
        <Heading level={1}>Clank Overview</Heading>
        <p role="status">
          {graph ? "Live · Read only" : "Catalog disconnected"}
        </p>
        {graph &&
          (graph.nodes.length ? (
            <OverviewCanvas graph={graph} />
          ) : (
            <p>No active sessions.</p>
          ))}
      </Stack>
    </section>
  );
}
const root = createRoot(document.querySelector("main")!);
root.render(<ReadOnlyOverview />);
window.addEventListener("pagehide", () => root.dispose(), { once: true });
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
