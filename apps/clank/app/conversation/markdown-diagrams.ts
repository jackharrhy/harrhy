import { diagramClass, sourceLabel } from "@harrhy/diagrams/presentation";
import { openMermaidFence } from "./markdown-renderer.ts";

async function fetchDiagram(source: string, signal: AbortSignal) {
  const response = await fetch("/owner/diagram", {
    method: "POST",
    mode: "same-origin",
    credentials: "same-origin",
    redirect: "error",
    cache: "no-store",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: source,
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  });
  if (!response.ok) return null;
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== "object" ||
    !("svg" in result) ||
    typeof result.svg !== "string" ||
    result.svg.length > 250_000
  )
    return null;
  // Only the fixed owner endpoint can supply markup; its renderer sanitizes
  // the SVG. Never interpolate the Markdown or parse it as author HTML.
  const template = document.createElement("template");
  template.innerHTML = result.svg;
  const svg = template.content.firstElementChild;
  return template.content.childElementCount === 1 &&
    svg instanceof SVGSVGElement
    ? svg
    : null;
}

export async function enhanceDiagrams(
  host: HTMLElement,
  text: string,
  signal: AbortSignal,
) {
  const blocks = host.querySelectorAll<HTMLElement>(
    '[data-markdown="code-block"][data-language="mermaid" i]',
  );
  if (!blocks.length) return;
  // Settled Words output also has usable copy controls for an EOF-closed
  // fence. Leave that final, unfinished diagram alone.
  const count = Math.min(8, blocks.length - Number(openMermaidFence(text)));
  for (let i = 0; i < count; i++) {
    const block = blocks[i]!;
    if (signal.aborted || !host.isConnected) return;
    const source = block.querySelector("pre > code")?.textContent;
    if (!source || source.length > 10_000) continue;
    try {
      // Give sibling Markdown hosts (and other tabs) turns at the bounded
      // renderer. The lock name never contains message data.
      const draw = () => fetchDiagram(source, signal);
      const svg = navigator.locks
        ? await navigator.locks.request("clank-owner-diagram", { signal }, draw)
        : await draw();
      if (!svg || signal.aborted || !block.isConnected || !host.contains(block))
        continue;
      // Don't collapse the source out from under a keyboard user.
      if (block.contains(document.activeElement)) continue;
      const wrapper = document.createElement("div");
      wrapper.className = diagramClass;
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.setAttribute("aria-label", sourceLabel);
      summary.title = sourceLabel;
      summary.textContent = "</>";
      details.appendChild(summary);
      wrapper.appendChild(svg);
      wrapper.appendChild(details);
      block.replaceWith(wrapper);
      details.appendChild(block);
      // Words keeps references to its actual nodes across updates. Restore
      // the precise tree synchronously before it sees the next revision.
      signal.addEventListener("abort", () => wrapper.replaceWith(block), {
        once: true,
      });
    } catch {
      // Offline, timed out, signed out or unmounted: source is already there.
    }
  }
}
