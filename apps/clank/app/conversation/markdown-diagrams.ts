import { diagramClass, sourceLabel } from "@harrhy/diagrams/presentation";
import { openMermaidFence } from "./markdown-renderer.ts";

// Inputs are the sanitized worker result and, on the server, a Words-generated code block.
export function diagramHtml(svg: string, block = "") {
  return `<div class="${diagramClass}">${svg}<details><summary aria-label="${sourceLabel}" title="${sourceLabel}">&lt;/&gt;</summary>${block}</details></div>`;
}

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
  return result.svg;
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
  const count = Math.min(8, blocks.length - Number(openMermaidFence(text)));
  for (let i = 0; i < count; i++) {
    const block = blocks[i]!;
    if (signal.aborted || !host.isConnected) return;
    if (block.closest(`.${diagramClass}`)) continue;
    const source = block.querySelector("pre > code")?.textContent;
    if (!source || source.length > 10_000) continue;
    try {
      // The render worker has one slot and no queue.
      const draw = () => fetchDiagram(source, signal);
      const svg = navigator.locks
        ? await navigator.locks.request("clank-owner-diagram", { signal }, draw)
        : await draw();
      if (!svg || signal.aborted || !block.isConnected || !host.contains(block))
        continue;
      // Don't collapse the source out from under a keyboard user.
      if (block.contains(document.activeElement)) continue;
      const template = document.createElement("template");
      template.innerHTML = diagramHtml(svg);
      const wrapper = template.content.firstElementChild!;
      block.replaceWith(wrapper);
      wrapper.querySelector("details")!.appendChild(block);
      // Restore the nodes Words owns before it patches its committed prefix.
      signal.addEventListener("abort", () => wrapper.replaceWith(block), {
        once: true,
      });
    } catch {
      // Offline, timed out, signed out or unmounted: source is already there.
    }
  }
}
