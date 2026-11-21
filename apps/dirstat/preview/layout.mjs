// Fix split membership and axes from the complete recording. Discovery changes only weights.
export function planTreemap(root, width, height) {
  function place(node, w, h) {
    const children = node.children
      .filter((child) => child.bytes)
      .toSorted((a, b) => b.bytes - a.bytes || a.id - b.id);
    return { id: node.id, children: split(children, w, h, node.bytes) };
  }
  function split(nodes, w, h, bytes) {
    if (!nodes.length) return null;
    if (nodes.length === 1) return place(nodes[0], w, h);
    let left = nodes[0].bytes;
    let cut = 1;
    while (cut < nodes.length - 1 && left + nodes[cut].bytes / 2 < bytes / 2)
      left += nodes[cut++].bytes;
    const horizontal = w >= h;
    const ratio = left / bytes;
    return {
      horizontal,
      first: split(
        nodes.slice(0, cut),
        horizontal ? w * ratio : w,
        horizontal ? h : h * ratio,
        left,
      ),
      second: split(
        nodes.slice(cut),
        horizontal ? w * (1 - ratio) : w,
        horizontal ? h : h * (1 - ratio),
        bytes - left,
      ),
    };
  }
  return place(root, width, height);
}

export function treemap(plan, width, height, bytesFor) {
  const boxes = new Map();
  if (!plan) return boxes;
  const weights = new Map();
  function weigh(part) {
    const bytes =
      part.id === undefined
        ? weigh(part.first) + weigh(part.second)
        : bytesFor(part.id);
    weights.set(part, bytes);
    if (part.children) weigh(part.children);
    return bytes;
  }
  function place(part, x, y, w, h) {
    if (!weights.get(part)) return;
    if (part.id !== undefined) {
      boxes.set(part.id, { x, y, w, h });
      if (part.children) place(part.children, x, y, w, h);
      return;
    }
    const ratio = weights.get(part.first) / weights.get(part);
    if (part.horizontal) {
      const a = w * ratio;
      place(part.first, x, y, a, h);
      place(part.second, x + a, y, w - a, h);
    } else {
      const a = h * ratio;
      place(part.first, x, y, w, a);
      place(part.second, x, y + a, w, h - a);
    }
  }
  weigh(plan);
  place(plan, 0, 0, width, height);
  return boxes;
}

// Fixed slots keep split membership and axis stable as newly found tiles append.
function liveTreemap(nodes, width, height) {
  const boxes = new Map();
  function place(start, end, x, y, w, h, horizontal) {
    if (start >= nodes.length || w <= 0 || h <= 0) return;
    if (end - start === 1) {
      if (nodes[start]?.bytes > 0) boxes.set(nodes[start].id, { x, y, w, h });
      return;
    }
    const mid = (start + end) / 2;
    const weight = (a, b) =>
      nodes.slice(a, b).reduce((sum, node) => sum + node.bytes, 0);
    const first = weight(start, mid),
      second = weight(mid, end);
    if (!first && !second) return;
    const fraction = first / (first + second);
    if (horizontal) {
      const a = w * fraction;
      place(start, mid, x, y, a, h, false);
      place(mid, end, x + a, y, w - a, h, false);
    } else {
      const a = h * fraction;
      place(start, mid, x, y, w, a, true);
      place(mid, end, x, y + a, w, h - a, true);
    }
  }
  place(0, 128, 0, 0, width, height, width >= height);
  return boxes;
}

export function nestedTreemap(root, width, height, active, snapshot = false) {
  const tiles = [];
  const boxes = new Map();
  const compact = width < 500;
  const budget = snapshot ? (compact ? 150 : 320) : compact ? 100 : 180;
  function place(folder, rect, level) {
    if (level > 10 || tiles.length >= budget) return;
    const limit = snapshot
      ? Math.max(
          4,
          Math.min(64, Math.floor((rect.w * rect.h) / (compact ? 1200 : 900))),
        )
      : level === 0
        ? compact
          ? 24
          : 64
        : 8;
    const children = folder.children.slice(0, limit);
    const next = active.get(folder.id);
    if (next?.index >= limit) children[limit - 1] = next;
    const remaining =
      folder.bytes - children.reduce((sum, child) => sum + child.bytes, 0);
    const shown = children.reduce((sum, child) => sum + (child.files ?? 0), 0);
    const unnamed = folder.directFiles ?? 0;
    const offMap = Math.max(0, (folder.files ?? 0) - shown - unnamed);
    if (remaining > 0)
      children[64] = {
        id: -1 - folder.id,
        name: "Grouped files",
        detail: snapshot
          ? "More entries in the named inventory"
          : `${offMap.toLocaleString()} outside shown tiles · ${unnamed.toLocaleString()} in inventory only`,
        bytes: remaining,
        depth: folder.depth + 1,
      };
    const local = liveTreemap(children, rect.w, rect.h);
    const nested = [];
    for (const child of children) {
      if (!child || tiles.length >= budget) continue;
      const box = local.get(child.id);
      if (!box || box.w < 2 || box.h < 2) continue;
      const absolute = { ...box, x: box.x + rect.x, y: box.y + rect.y };
      tiles.push(child);
      boxes.set(child.id, absolute);
      if (
        child.children?.length &&
        (level < 1 || snapshot || child === next) &&
        box.w >= 24 &&
        box.h >= 22
      ) {
        const heading =
          box.w >= 126 && box.h >= 70
            ? 42
            : box.w >= 85 && box.h >= 38
              ? 19
              : 2;
        nested.push({
          child,
          rect: {
            x: absolute.x + 2,
            y: absolute.y + heading,
            w: box.w - 4,
            h: box.h - heading - 2,
          },
        });
      }
    }
    nested.sort((a, b) => Number(b.child === next) - Number(a.child === next));
    for (const branch of nested) place(branch.child, branch.rect, level + 1);
  }
  place(root, { x: 0, y: 0, w: width, h: height }, 0);
  return { boxes, tiles };
}
