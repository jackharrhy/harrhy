import type { Box } from "@harrhy/board/geometry";
import type { OverviewRow } from "./session-state.ts";

interface Node extends Box {
  id: string;
  title: string;
  detail: string;
}
export function layoutOverview(rows: readonly OverviewRow[]) {
  const nodes: Node[] = [],
    edges: { from: Node; to: Node }[] = [];
  let y = 0;
  // Activity changes reorder the list, not the map.
  for (const row of rows.toSorted(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  )) {
    const session = {
      id: row.id,
      title: row.title || "Unnamed session",
      detail: "Session",
      x: 0,
      y,
      width: 200,
      height: 66,
    };
    nodes.push(session);
    const branches = row.branches.toSorted(
      (a, b) => a.conversation - b.conversation,
    );
    const byConversation = new Map(branches.map((b) => [b.conversation, b]));
    const boxes = new Map<number, Node>();
    for (const b of branches) {
      const ancestors = new Set([b.conversation]);
      let parent = b.parent;
      while (
        parent !== undefined &&
        byConversation.has(parent) &&
        !ancestors.has(parent)
      ) {
        ancestors.add(parent);
        parent = byConversation.get(parent)?.parent;
      }
      const node = {
        ...session,
        id: `${row.id}:${b.conversation}`,
        title: b.label ?? session.title,
        detail: `${row.main === b.conversation ? "Main · " : ""}Conversation ${b.conversation}`,
        x: ancestors.size * 250,
        y,
      };
      boxes.set(b.conversation, node);
      nodes.push(node);
      y += 82;
    }
    for (const b of branches) {
      const to = boxes.get(b.conversation)!;
      if (b.parent === undefined) edges.push({ from: session, to });
      else {
        const from = boxes.get(b.parent);
        if (from && from !== to) edges.push({ from, to });
      }
    }
    y += branches.length ? 26 : 108;
  }
  return { nodes, edges };
}
