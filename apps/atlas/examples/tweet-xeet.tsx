import { css, on, ref, type Handle } from "remix/component";
import { Button } from "@harrhy/ui/native";
import { createRenderer, paintPng, type Snapshot, type RenderOptions } from "@atlas/xeet";

interface Data extends Snapshot {
  url: string;
  provenance: string;
}
const panel = css({
  border: "1px solid var(--hui-border)",
  padding: "1rem",
  "& canvas": { display: "block", width: "100%", height: "auto", marginBlock: "1rem" },
  "& footer": { display: "flex", flexWrap: "wrap", gap: ".5rem", alignItems: "center" },
  "& p": { whiteSpace: "pre-wrap" },
});

export function Widget(handle: Handle<{ data: Data }>) {
  const data = handle.props.data;
  const canonical = /^https:\/\/x\.com\/([a-zA-Z0-9_]{1,15})\/status\/[0-9]{1,25}$/.exec(data.url);
  if (!canonical || canonical[1] !== data.author.handle)
    throw new Error("Invalid tweet attribution");
  const renderer = createRenderer(handle.signal);
  let canvas: HTMLCanvasElement | undefined;
  let busy = false;
  let started = false;
  let status = "Ready to render with Xeet Rust/WebAssembly.";
  let count = 0;
  let report = "";
  let options: RenderOptions = { theme: "light", surface: "web-detail", width: 600, dpr: 1 };
  async function render() {
    if (!canvas || busy || handle.signal.aborted) return;
    busy = true;
    status = "Rendering with Xeet Rust/WebAssembly…";
    handle.update();
    try {
      const result = await renderer.render(data, options);
      if (handle.signal.aborted || !canvas) return;
      const dimensions = await paintPng(canvas, result.png);
      count++;
      report = JSON.stringify(result.report, null, 2);
      status = `Xeet WASM render ${count}: decoded PNG ${dimensions.width} × ${dimensions.height}, ${result.png.byteLength} bytes.`;
    } catch (error) {
      status = `Xeet could not render: ${error instanceof Error ? error.message : "unknown error"}. The verified transcript remains below.`;
    } finally {
      busy = false;
      if (!handle.signal.aborted) handle.update();
    }
  }
  return () => (
    <section aria-label={`Xeet rendering of @${data.author.handle}'s post`} mix={panel}>
      <strong>Xeet · Rust → WebAssembly → PNG</strong>
      <canvas
        aria-label={`${data.author.name} (@${data.author.handle}): ${data.text}`}
        mix={ref((node) => {
          canvas = node;
          if (!started) {
            started = true;
            void render();
          }
        })}
      />
      <p role="status" data-xeet-render-count={count}>
        {status}
      </p>
      <footer>
        <Button
          disabled={busy}
          mix={on("click", () => {
            options = { ...options, theme: options.theme === "light" ? "dark" : "light" };
            void render();
          })}
        >
          {options.theme === "light" ? "Render dark" : "Render light"}
        </Button>
        <Button
          disabled={busy}
          mix={on("click", () => {
            options = {
              ...options,
              surface: options.surface === "web-detail" ? "web-timeline" : "web-detail",
            };
            void render();
          })}
        >
          {options.surface === "web-detail" ? "Render timeline" : "Render detail"}
        </Button>
        <a href={data.url}>Original post on X</a>
      </footer>
      <details>
        <summary>Xeet renderer report</summary>
        <pre data-xeet-report>{report}</pre>
      </details>
      <details>
        <summary>Verified transcript and provenance</summary>
        <p>
          {data.author.name} · @{data.author.handle} ·{" "}
          <time dateTime={data.publishedAt}>{data.publishedAt}</time>
        </p>
        <p>{data.text}</p>
        <p>{data.provenance}</p>
        <p>
          Curated snapshot captured {data.capturedAt}. Local licensed font substitution; not a claim
          of X pixel parity. No live counts or account actions.
        </p>
      </details>
    </section>
  );
}
