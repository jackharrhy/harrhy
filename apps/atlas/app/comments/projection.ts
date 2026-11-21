import type { QuoteEvidence } from "./contract.ts";

const excluded =
  "[data-atlas-widget],[data-atlas-diagram],script,style,button,input,textarea,select";
/** DOM text, not rendered selection whitespace: offsets are UTF-16 code units. */
export function projectArticle(root: Node): { text: string; nodes: Text[] } {
  const nodes: Text[] = [];
  const walker = root.ownerDocument!.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        return node.parentElement?.closest(excluded)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    },
  );
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return { text: nodes.map((node) => node.data).join(""), nodes };
}
export function captureQuote(
  root: HTMLElement,
  range: Range,
): QuoteEvidence["quote"] | undefined {
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer) ||
    range.collapsed
  )
    return;
  for (const element of root.querySelectorAll(excluded))
    if (range.intersectsNode(element)) return;
  const before = root.ownerDocument.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const start = projectArticle(before.cloneContents()).text.length;
  const exact = projectArticle(range.cloneContents()).text;
  const text = projectArticle(root).text;
  const end = start + exact.length;
  if (!exact.trim() || exact.length > 4096 || text.slice(start, end) !== exact)
    return;
  return {
    start,
    end,
    exact,
    prefix: text.slice(Math.max(0, start - 64), start),
    suffix: text.slice(end, end + 64),
  };
}
export function restoreQuote(
  root: HTMLElement,
  quote: QuoteEvidence["quote"],
): Range | undefined {
  const { text, nodes } = projectArticle(root);
  if (
    text.slice(quote.start, quote.end) !== quote.exact ||
    text.slice(Math.max(0, quote.start - quote.prefix.length), quote.start) !==
      quote.prefix ||
    text.slice(quote.end, quote.end + quote.suffix.length) !== quote.suffix
  )
    return;
  const range = root.ownerDocument.createRange();
  let offset = 0;
  let started = false;
  for (const node of nodes) {
    const next = offset + node.length;
    if (!started && quote.start <= next) {
      range.setStart(node, quote.start - offset);
      started = true;
    }
    if (started && quote.end <= next) {
      range.setEnd(node, quote.end - offset);
      return range;
    }
    offset = next;
  }
}
