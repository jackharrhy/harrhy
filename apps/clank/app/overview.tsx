import { Heading, Stack } from "@harrhy/ui/native";
import type { Handle } from "remix/component";
import { OverviewCanvas } from "./overview-canvas.tsx";
import { ClankProvider } from "./clank-provider.tsx";
import { layoutOverview } from "./overview-layout.ts";
export function Overview(handle: Handle) {
  const rows = handle.context
    .get(ClankProvider)
    .sessions.select((s) => (s.status === "live" ? s.activeRows : null));
  rows.subscribe(() => handle.update(), handle);
  return () => (
    <section aria-label="Overview">
      <Stack>
        <Heading level={2}>Overview</Heading>
        {rows.current?.length ? (
          <OverviewCanvas graph={layoutOverview(rows.current)} />
        ) : (
          <p>
            {rows.current
              ? "No active sessions."
              : "Waiting for live sessions…"}
          </p>
        )}
      </Stack>
    </section>
  );
}
