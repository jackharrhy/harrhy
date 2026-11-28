import { Worker } from "node:worker_threads";
import type { Element } from "hast";
import { toHtml } from "hast-util-to-html";
import { fromHtml } from "hast-util-from-html";
import { sanitize, type Schema } from "hast-util-sanitize";

const paint =
  /^(?:none|currentColor|transparent|#[a-fA-F0-9]{3,8}|var\(--_(?:bg|fg|m|l|s|a|b|c)\))$/;
// This schema handles only renderer output, never ordinary author HTML.
const schema: Schema = {
  tagNames: [
    "svg",
    "g",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "text",
    "tspan",
    "title",
    "desc",
  ],
  attributes: {
    "*": [
      "x",
      "y",
      "x1",
      "x2",
      "y1",
      "y2",
      "dx",
      "dy",
      "width",
      "height",
      "rx",
      "ry",
      "r",
      "cx",
      "cy",
      "d",
      "points",
      "transform",
      "textAnchor",
      "dominantBaseline",
      "fontSize",
      "fontWeight",
      "fontStyle",
      "opacity",
      "fillOpacity",
      "strokeOpacity",
      "strokeWidth",
      "strokeDasharray",
      "strokeLinecap",
      "strokeLinejoin",
      "viewBox",
      "xmlns",
      ["fill", paint],
      ["stroke", paint],
    ],
  },
  strip: ["script", "style", "foreignObject", "image", "a", "use", "iframe"],
};
const cache = new Map<string, Element>();
let rendering = false;

async function renderSvg(
  source: string,
  budget: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    const worker = new Worker(
      new URL("./diagram-worker.mjs", import.meta.url),
      {
        workerData: source,
        execArgv: [],
        resourceLimits: {
          maxOldGenerationSizeMb: 64,
          maxYoungGenerationSizeMb: 16,
          stackSizeMb: 2,
        },
      },
    );
    let finished = false;
    const finish = (svg: string | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      void worker.terminate().then(
        () => resolve(svg),
        () => resolve(svg),
      );
    };
    const timer = setTimeout(() => {
      console.warn("Diagram render timed out; using source fallback");
      finish(null);
    }, budget);
    // Node --watch also sends dependency notifications through worker messages.
    worker.on("message", (value: unknown) => {
      if (
        !value ||
        typeof value !== "object" ||
        !("harrhyDiagram" in value) ||
        value.harrhyDiagram !== true ||
        !("svg" in value)
      )
        return;
      finish(
        typeof value.svg === "string" && value.svg.length <= 250000
          ? value.svg
          : null,
      );
    });
    worker.once("error", (error) => {
      console.warn(
        "Diagram worker unavailable; using source fallback",
        error instanceof Error ? error.name : "UnknownError",
        error instanceof Error && "code" in error ? error.code : "",
      );
      finish(null);
    });
    worker.once("exit", (code) => {
      if (!finished)
        console.warn(
          "Diagram worker exited before result; using source fallback",
          code,
        );
      finish(null);
    });
  });
}

function sanitizeDiagram(svg: string): Element | null {
  const tree = sanitize(fromHtml(svg, { fragment: true }), schema);
  if (tree.type !== "root") return null;
  const root = tree.children.find(
    (node): node is Element =>
      node.type === "element" && node.tagName === "svg",
  );
  if (!root) return null;
  root.properties.role = "img";
  root.properties.ariaLabel = "Mermaid diagram; source follows";
  return root;
}

export async function renderDiagram(
  source: string,
  budgetMs = 1500,
): Promise<Element | null> {
  if (
    typeof source !== "string" ||
    source.length > 10000 ||
    !Number.isFinite(budgetMs) ||
    budgetMs <= 0 ||
    rendering
  )
    return null;
  const cached = cache.get(source);
  if (cached) return structuredClone(cached);
  rendering = true;
  const budget = Math.min(1500, budgetMs);
  const deadline = performance.now() + budget;
  try {
    const svg = await renderSvg(source, budget);
    if (!svg || performance.now() >= deadline) return null;
    const result = sanitizeDiagram(svg);
    if (!result || performance.now() >= deadline) return null;
    if (cache.size >= 64) cache.delete(cache.keys().next().value!);
    cache.set(source, result);
    return structuredClone(result);
  } catch (error) {
    console.warn(
      "Diagram preparation failed; using source fallback",
      error instanceof Error ? error.name : "UnknownError",
    );
    return null;
  } finally {
    rendering = false;
  }
}

export async function renderDiagramSvg(source: string): Promise<string | null> {
  const svg = await renderDiagram(source);
  if (!svg) return null;
  const html = toHtml(svg, { space: "svg" });
  return html.length <= 250000 ? html : null;
}
