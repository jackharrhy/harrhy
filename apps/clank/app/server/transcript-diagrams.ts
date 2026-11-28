import { parse, type DefaultTreeAdapterTypes as Tree } from "parse5";
import { renderDiagramSvg } from "@harrhy/diagrams/server";
import { diagramHtml } from "../conversation/markdown-diagrams.ts";

function* descendants(root: Tree.ParentNode): Generator<Tree.ChildNode> {
  const stack = root.childNodes.toReversed();
  while (stack.length) {
    const node = stack.pop()!;
    yield node;
    if ("childNodes" in node)
      for (let i = node.childNodes.length - 1; i >= 0; i--)
        stack.push(node.childNodes[i]!);
  }
}
const attr = (node: Tree.Element, name: string) =>
  node.attrs.find((a) => a.name === name)?.value;

export async function renderTranscriptDiagrams(
  html: string,
  signal: AbortSignal,
) {
  if (
    signal.aborted ||
    html.length > 2_000_000 ||
    !html.includes("data-mermaid-fences=")
  )
    return html;
  const deadline = performance.now() + 1000;
  let candidatesLeft = 8;
  let svgBytesLeft = 256_000;
  let cursor = 0;
  let result = "";
  for (const root of descendants(
    parse(html, { sourceCodeLocationInfo: true }),
  )) {
    if (!("tagName" in root)) continue;
    const fences = attr(root, "data-mermaid-fences");
    if (!fences) continue;
    const blocks = [...descendants(root)].filter(
      (n): n is Tree.Element =>
        "tagName" in n &&
        attr(n, "data-markdown") === "code-block" &&
        attr(n, "data-language")?.toLowerCase() === "mermaid",
    );
    if (fences === "open-tail") blocks.pop();
    for (const block of blocks) {
      const budget = deadline - performance.now();
      if (
        signal.aborted ||
        candidatesLeft-- <= 0 ||
        budget < 50 ||
        svgBytesLeft <= 0
      )
        return result + html.slice(cursor);
      const code = [...descendants(block)].find(
        (n): n is Tree.Element => "tagName" in n && n.tagName === "code",
      );
      const loc = block.sourceCodeLocation;
      if (!code || !loc?.endTag) continue;
      const source = [...descendants(code)]
        .map((n) => ("value" in n ? n.value : ""))
        .join("");
      const svg = await renderDiagramSvg(source, budget);
      if (!svg || signal.aborted || performance.now() >= deadline) continue;
      const size = Buffer.byteLength(svg);
      if (size > svgBytesLeft) continue;
      svgBytesLeft -= size;
      // Splice only the generated block; Remix's hydration markers and CSP-hashed script stay byte-identical.
      result +=
        html.slice(cursor, loc.startOffset) +
        diagramHtml(svg, html.slice(loc.startOffset, loc.endOffset));
      cursor = loc.endOffset;
    }
  }
  return result + html.slice(cursor);
}
