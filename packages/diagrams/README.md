# @harrhy/diagrams

Static Mermaid diagrams for Node Markdown hosts. No browser renderer, remote resources or API for injecting authored SVG.

## Server

`@harrhy/diagrams/server` accepts Mermaid **source**, not HTML. `renderDiagram(source, budgetMs?)` returns a promise of a sanitized HAST SVG element (a caller-owned copy). `renderDiagramSvg(source)` serializes that same tree with `hast-util-to-html` for string-based consumers. Both return `null` on fallback; keep the original code block.

One render at a time, no waiting queue. The worker has a maximum 1,500 ms budget, 64 MiB old generation, 10,000 input characters, 200 edges and 250,000 output characters. A smaller budget limits the worker further. Up to 64 successful trees are cached in memory. Links and images are disabled; only allowlisted SVG geometry, text and paint survive. Application policies (such as [Atlas’s eight fences per page, two-second budget and comment exclusions](../../apps/atlas/README.md#mermaid-diagrams)) stay with the host.

The worker is **`./diagram-worker.mjs` relative to the server module’s `import.meta.url`**. Source-based hosts install the workspace normally. Bundled hosts, including Docker builds, must ship the worker beside the emitted ESM module and make `pele@1.13.0` resolvable from there, or bundle the worker separately at that filename. Retain the [Pele MIT and Lucide ISC notices](LICENSES/Pele.txt) on redistribution.

## Presentation

Apply the browser-safe Remix `diagramStyles` mixin from `@harrhy/diagrams/presentation` to the prose **parent**. Give each diagram wrapper the exported `diagramClass` (`harrhy-diagram`). Its first child is the server-rendered SVG, followed by `diagramSource(source)` (HAST). A DOM host can use the exported `sourceLabel` on a native summary and move its existing code block, including any copy controls, into the disclosure. Put a prose explanation near complex diagrams; the SVG label identifies the image, not its meaning.

Run `pnpm --filter @harrhy/diagrams check` for typechecking and synthetic render checks.
