import { renderDiagram } from "@harrhy/diagrams/server";
import { diagramClass, diagramSource } from "@harrhy/diagrams/presentation";
import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

export async function prepareDiagrams(tree: Root): Promise<void> {
  const fences: { node: Element; source: string }[] = [];
  visit(tree, "element", (node) => {
    const code =
      node.tagName === "pre" && node.children.length === 1
        ? node.children[0]
        : undefined;
    if (
      code &&
      code.type === "element" &&
      code.tagName === "code" &&
      Array.isArray(code.properties.className) &&
      code.properties.className.includes("language-mermaid") &&
      code.children.every((child) => child.type === "text")
    ) {
      node.properties.dataAtlasDiagram = true;
      if (fences.length === 8) return;
      fences.push({
        node,
        source: code.children
          .map((child) => (child.type === "text" ? child.value : ""))
          .join(""),
      });
    }
  });
  const deadline = performance.now() + 2000;
  for (const { node, source } of fences) {
    const budget = deadline - performance.now();
    if (budget < 100) break;
    const svg = await renderDiagram(source, budget);
    if (!svg) continue;
    node.tagName = "div";
    node.properties = { className: [diagramClass], dataAtlasDiagram: true };
    node.children = [svg, diagramSource(source)];
  }
}
