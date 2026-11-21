// Text splitting/wrapping adapted from Hypothesis client 72526e9c, highlighter.ts.
// Copyright 2013–2019 Hypothes.is Project and contributors; see LICENSES/Hypothesis.txt.
import type { QuoteEvidence } from "./contract.ts";
import { projectArticle, restoreQuote } from "./projection.ts";

export interface CommentMark {
  readonly id: string;
  readonly quote: QuoteEvidence["quote"];
  readonly active?: boolean;
}

export function clearCommentFragments(root: HTMLElement) {
  for (const fragment of root.querySelectorAll("[data-atlas-comment-fragment]"))
    fragment.replaceWith(...fragment.childNodes);
}

/** Split text at range boundaries, never extract/recreate article elements or their children. */
export function renderCommentFragments(
  root: HTMLElement,
  marks: readonly CommentMark[],
) {
  clearCommentFragments(root);
  const valid = marks.filter((mark) => restoreQuote(root, mark.quote));
  const { nodes } = projectArticle(root);
  let offset = 0;
  for (const node of nodes) {
    const start = offset;
    offset += node.length;
    const hits = valid.filter(
      (mark) => mark.quote.start < offset && mark.quote.end > start,
    );
    if (
      !hits.length ||
      (!node.data.trim() &&
        /^(TABLE|THEAD|TBODY|TFOOT|TR|UL|OL|DL)$/.test(
          node.parentElement?.tagName ?? "",
        ))
    )
      continue;
    const boundaries = [
      ...new Set([
        0,
        node.length,
        ...hits.flatMap((mark) => [
          Math.max(0, mark.quote.start - start),
          Math.min(node.length, mark.quote.end - start),
        ]),
      ]),
    ].toSorted((a, b) => a - b);
    let text = node;
    for (let i = 1; i < boundaries.length; i++) {
      const from = boundaries[i - 1],
        to = boundaries[i];
      // text is the unprocessed suffix; split only inside it, preserving all text verbatim.
      const remainder =
        to - from < text.length ? text.splitText(to - from) : undefined;
      const covering = hits.filter(
        (mark) =>
          mark.quote.start < start + to && mark.quote.end > start + from,
      );
      if (covering.length) {
        const fragment = root.ownerDocument.createElement("mark");
        fragment.dataset.atlasCommentFragment = "";
        fragment.dataset.atlasCommentIds = JSON.stringify([
          ...new Set(covering.map((mark) => mark.id)),
        ]);
        if (covering.some((mark) => mark.active))
          fragment.dataset.atlasActiveComment = "";
        text.replaceWith(fragment);
        fragment.append(text);
      }
      if (remainder) text = remainder;
    }
  }
}

export function commentIdsAtTarget(
  root: HTMLElement,
  target: EventTarget | null,
): string[] {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
  if (
    !element ||
    !root.contains(element) ||
    element.closest(
      "a,button,input,textarea,select,summary,[data-atlas-widget],[data-atlas-diagram]",
    )
  )
    return [];
  const fragment = element.closest<HTMLElement>(
    "[data-atlas-comment-fragment]",
  );
  return fragment
    ? (JSON.parse(fragment.dataset.atlasCommentIds ?? "[]") as string[])
    : [];
}
