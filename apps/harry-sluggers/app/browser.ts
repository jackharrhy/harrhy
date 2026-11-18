import { mountGraph } from "./force-graph.ts";
import type { GraphData } from "./graph-data.ts";
import { run } from "remix/component";
const app = run({
  async loadModule() {
    throw new Error("No client component modules are registered");
  },
});
await app.ready();

document.addEventListener("change", (event) => {
  const select = event.target;
  if (
    select instanceof HTMLSelectElement &&
    select.matches("[data-theme-picker]")
  ) {
    select.form?.requestSubmit();
  }
});

const cardSelector = "[data-player-card]";
function cardAt(target: EventTarget | null) {
  return target instanceof Element
    ? target.closest<HTMLElement>(cardSelector)
    : null;
}
function showChemistry(source: HTMLElement | null, grid: Element | null) {
  if (!grid) return;
  const positive = new Set<string>(
    source?.dataset.positive
      ? (JSON.parse(source.dataset.positive) as string[])
      : [],
  );
  const negative = new Set<string>(
    source?.dataset.negative
      ? (JSON.parse(source.dataset.negative) as string[])
      : [],
  );
  for (const card of grid.querySelectorAll<HTMLElement>(cardSelector)) {
    const character = card.dataset.character;
    const note = card.querySelector<HTMLElement>("[data-chemistry-note]");
    const relation =
      character && card !== source
        ? negative.has(character)
          ? "negative"
          : positive.has(character)
            ? "positive"
            : undefined
        : undefined;
    if (relation) card.dataset.chemistry = relation;
    else delete card.dataset.chemistry;
    if (note) note.hidden = !relation;
  }
}
for (const type of ["pointerover", "focusin"] as const) {
  document.addEventListener(type, (event) => {
    const card = cardAt(event.target);
    if (card && card !== cardAt(event.relatedTarget))
      showChemistry(card, card.parentElement);
  });
}
for (const type of ["pointerout", "focusout"] as const) {
  document.addEventListener(type, (event) => {
    const card = cardAt(event.target);
    if (card && card !== cardAt(event.relatedTarget))
      showChemistry(null, card.parentElement);
  });
}

let graphHost: HTMLElement | null = null;
let disposeGraph: (() => void) | undefined;
function syncGraph() {
  const host = document.querySelector<HTMLElement>("[data-force-graph]");
  if (host === graphHost) return;
  disposeGraph?.();
  graphHost = host;
  if (!host) return;
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.style.position = "absolute";
  svg.style.inset = "0";
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("aria-label", "Chemistry graph");
  shadow.replaceChildren(svg);
  disposeGraph = mountGraph(
    svg,
    JSON.parse(host.dataset.forceGraph ?? "{}") as GraphData,
  );
}
new MutationObserver(syncGraph).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
syncGraph();
