import { attachViewport } from "@harrhy/board/viewport";
import { connectorPath, nodeStyle, type Box } from "@harrhy/board/geometry";
import { Button, Heading, Inline, Stack } from "@harrhy/ui/native";
import { css, on, ref, type Handle } from "remix/component";
import { ClankProvider } from "./clank-provider.tsx";
import { layoutOverview } from "./overview-layout.ts";

function Canvas(handle: Handle<{ graph: ReturnType<typeof layoutOverview> }>) {
  let view: ReturnType<typeof attachViewport> | undefined;
  let selected: string | null = null;
  function fit() {
    view?.fit(handle.props.graph.nodes, 24);
  }
  function mount(el: HTMLElement, signal: AbortSignal) {
    const world = el.firstElementChild as HTMLElement;
    const camera = attachViewport(el, world, {
      wheelMode: () => "pan",
      signal,
    });
    view = camera;
    fit();
    if (camera.camera.scale < 0.8)
      camera.set({ scale: 0.8, offsetX: 24, offsetY: 24 });
    let pan: ReturnType<typeof camera.startPan> | undefined;
    el.addEventListener(
      "pointerdown",
      (e) => {
        if (
          !e.isPrimary ||
          (e.button !== 0 && e.button !== 1) ||
          (e.target instanceof Element && e.target.closest("button"))
        )
          return;
        el.focus({ preventScroll: true });
        el.setPointerCapture(e.pointerId);
        pan = camera.startPan(e);
        e.preventDefault();
      },
      { signal },
    );
    el.addEventListener(
      "pointermove",
      (e) => {
        if (el.hasPointerCapture(e.pointerId)) pan?.(e);
      },
      { signal },
    );
    el.addEventListener(
      "lostpointercapture",
      () => {
        pan = undefined;
      },
      { signal },
    );
    el.addEventListener(
      "keydown",
      (e) => {
        if (e.target !== el) return;
        const dir: Record<string, [number, number]> = {
          ArrowUp: [0, 48],
          ArrowDown: [0, -48],
          ArrowLeft: [48, 0],
          ArrowRight: [-48, 0],
        };
        const delta = dir[e.key];
        if (delta) {
          e.preventDefault();
          const c = camera.camera;
          camera.set({
            ...c,
            offsetX: c.offsetX + delta[0],
            offsetY: c.offsetY + delta[1],
          });
        }
      },
      { signal },
    );
  }
  function revealFocused(button: HTMLButtonElement, box: Box) {
    if (button.matches(":focus-visible") && view) {
      const host = button.closest("[role=region]")!.getBoundingClientRect();
      const b = button.getBoundingClientRect();
      if (
        b.left < host.left ||
        b.right > host.right ||
        b.top < host.top ||
        b.bottom > host.bottom
      ) {
        const c = view.camera;
        view.set({
          ...c,
          offsetX: host.width / 2 - (box.x + box.width / 2) * c.scale,
          offsetY: host.height / 2 - (box.y + box.height / 2) * c.scale,
        });
      }
    }
  }
  return () => {
    const { nodes, edges } = handle.props.graph;
    const current = nodes.find((n) => n.id === selected);
    return (
      <Stack>
        <Inline>
          <Button mix={on("click", fit)}>Fit map</Button>
          <Button
            aria-label="Zoom out"
            mix={on("click", () => view?.zoomAt(1 / 1.2))}
          >
            −
          </Button>
          <Button
            aria-label="Zoom in"
            mix={on("click", () => view?.zoomAt(1.2))}
          >
            +
          </Button>
        </Inline>
        <div
          role="region"
          aria-label="Session map"
          tabIndex={0}
          mix={[
            css({
              position: "relative",
              height: "clamp(17rem, 50vh, 30rem)",
              overflow: "clip",
              touchAction: "none",
              background: "var(--hui-canvas)",
              border: "1px solid var(--hui-border)",
              cursor: "grab",
            }),
            ref(mount),
          ]}
        >
          <div
            mix={css({
              position: "absolute",
              inset: 0,
              transformOrigin: "0 0",
            })}
          >
            <svg
              aria-hidden="true"
              width="1"
              height="1"
              mix={css({
                position: "absolute",
                overflow: "visible",
                pointerEvents: "none",
                color: "var(--hui-muted)",
              })}
            >
              {edges.map(({ from, to }) => (
                <path
                  key={to.id}
                  d={connectorPath(
                    { x: from.x + from.width, y: from.y + from.height / 2 },
                    { x: to.x, y: to.y + to.height / 2 },
                  )}
                  stroke="currentColor"
                  strokeWidth={2}
                  fill="none"
                />
              ))}
            </svg>
            {nodes.map((n) => (
              <button
                type="button"
                key={n.id}
                style={nodeStyle(n)}
                aria-pressed={n.id === current?.id}
                title={n.title}
                mix={[
                  css({
                    position: "absolute",
                    boxSizing: "border-box",
                    padding: "0.5rem 0.75rem",
                    textAlign: "left",
                    border: "1px solid var(--hui-border)",
                    borderRadius: "4px",
                    background: "var(--hui-surface)",
                    color: "var(--hui-ink)",
                    font: "inherit",
                    cursor: "pointer",
                    "&[aria-pressed=true]": {
                      borderColor: "var(--hui-accent)",
                    },
                    "&:focus-visible": {
                      outline: "2px solid var(--hui-focus)",
                    },
                  }),
                  on("click", () => {
                    selected = n.id;
                    handle.update();
                  }),
                  on("focus", (e) => {
                    revealFocused(e.currentTarget, n);
                  }),
                ]}
              >
                <small>{n.detail}</small>
                <strong
                  mix={css({
                    display: "block",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  })}
                >
                  {n.title}
                </strong>
              </button>
            ))}
          </div>
        </div>
        <span role="status">
          {current
            ? `${current.detail}: ${current.title}`
            : "Drag the map or focus it and use the arrow keys."}
        </span>
      </Stack>
    );
  };
}
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
          <Canvas graph={layoutOverview(rows.current)} />
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
