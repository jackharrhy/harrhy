import { Worker } from "node:worker_threads";
import type { Element, Root } from "hast";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { unified } from "unified";
import { visit } from "unist-util-visit";

// This schema handles only renderer output, never ordinary author HTML.
const svgProcessor = unified()
  .use(rehypeRaw)
  .use(rehypeSanitize, {
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
        "fill",
        "stroke",
      ],
    },
    strip: ["script", "style", "foreignObject", "image", "a", "use", "iframe"],
  });
const cache = new Map<string, Element | null>();
let rendering = false;

async function renderSvg(source: string, budget: number): Promise<string | null> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./diagram-worker.mjs", import.meta.url), {
      workerData: source,
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 2 },
    });
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
      console.warn("Atlas diagram render timed out; using source fallback");
      finish(null);
    }, budget);
    // Node --watch also sends dependency notifications through worker messages.
    worker.on("message", (value: unknown) => {
      if (
        !value ||
        typeof value !== "object" ||
        !("atlasDiagram" in value) ||
        value.atlasDiagram !== true ||
        !("svg" in value)
      )
        return;
      finish(typeof value.svg === "string" && value.svg.length <= 250000 ? value.svg : null);
    });
    worker.once("error", (error) => {
      console.warn(
        "Atlas diagram worker unavailable; using source fallback",
        error instanceof Error ? error.name : "UnknownError",
        error instanceof Error && "code" in error ? error.code : "",
      );
      finish(null);
    });
    worker.once("exit", (code) => {
      if (!finished)
        console.warn("Atlas diagram worker exited before result; using source fallback", code);
      finish(null);
    });
  });
}

async function diagram(source: string, budget: number): Promise<Element | null> {
  if (source.length > 10000) return null;
  if (cache.has(source)) return structuredClone(cache.get(source)!);
  const svg = await renderSvg(source, budget);
  let result: Element | null = null;
  if (svg) {
    const tree = await svgProcessor.run({
      type: "root",
      children: [{ type: "raw", value: svg }],
    } as Root);
    const root = tree.children.find(
      (node): node is Element => node.type === "element" && node.tagName === "svg",
    );
    if (root) {
      visit(root, "element", (node) => {
        for (const name of ["fill", "stroke"]) {
          const value = node.properties[name];
          if (
            typeof value === "string" &&
            !/^(?:none|currentColor|transparent|#[a-fA-F0-9]{3,8}|var\(--_[a-z]+\))$/.test(value)
          )
            delete node.properties[name];
        }
      });
      root.properties.role = "img";
      root.properties.ariaLabel = "Mermaid diagram; source follows";
      result = root;
    }
  }
  if (cache.size >= 64) cache.delete(cache.keys().next().value!);
  cache.set(source, result);
  return structuredClone(result);
}

export async function prepareDiagrams(tree: Root): Promise<void> {
  const fences: { node: Element; source: string }[] = [];
  visit(tree, "element", (node) => {
    const code =
      node.tagName === "pre" && node.children.length === 1 ? node.children[0] : undefined;
    if (
      code &&
      code.type === "element" &&
      code.tagName === "code" &&
      Array.isArray(code.properties.className) &&
      code.properties.className.includes("language-mermaid") &&
      code.children.every((child) => child.type === "text")
    ) {
      node.properties.dataAtlasDiagram = true;
      fences.push({
        node,
        source: code.children.map((child) => (child.type === "text" ? child.value : "")).join(""),
      });
    }
  });
  const deadline = performance.now() + 2000;
  for (const { node, source } of fences.slice(0, 8)) {
    const budget = Math.min(1500, deadline - performance.now());
    if (rendering || budget < 100) break;
    let svg: Element | null = null;
    rendering = true;
    try {
      svg = await diagram(source, budget);
    } catch (error) {
      console.warn(
        "Atlas diagram preparation failed; using source fallback",
        error instanceof Error ? error.name : "UnknownError",
        error instanceof Error && "code" in error ? error.code : "",
      );
    } finally {
      rendering = false;
    }
    if (!svg) continue;
    const original: Element = { ...node, properties: { ...node.properties } };
    delete original.properties.dataAtlasDiagram;
    node.tagName = "div";
    node.properties = { className: ["atlas-diagram"], dataAtlasDiagram: true };
    node.children = [
      svg,
      {
        type: "element",
        tagName: "details",
        properties: {},
        children: [
          {
            type: "element",
            tagName: "summary",
            properties: {},
            children: [{ type: "text", value: "Diagram source" }],
          },
          original,
        ],
      },
    ];
  }
}
