export interface Point {
  x: number;
  y: number;
}
export interface Box extends Point {
  width: number;
  height: number;
}
export interface Camera {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export function nodeStyle(box: Box) {
  return {
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  };
}

export function fitCamera(
  boxes: Iterable<Box>,
  viewport: Pick<Box, "width" | "height">,
  inset: number,
): Camera {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const b of boxes) {
    left = Math.min(left, b.x);
    top = Math.min(top, b.y);
    right = Math.max(right, b.x + b.width);
    bottom = Math.max(bottom, b.y + b.height);
  }
  const { width, height } = viewport;
  if (left === Infinity)
    return { scale: 1, offsetX: width / 2, offsetY: height / 2 };
  const scale = Math.max(
    0.1,
    Math.min(
      1.5,
      (width - 2 * inset) / Math.max(1, right - left),
      (height - 2 * inset) / Math.max(1, bottom - top),
    ),
  );
  return {
    scale,
    offsetX: width / 2 - ((left + right) / 2) * scale,
    offsetY: height / 2 - ((top + bottom) / 2) * scale,
  };
}

export function connectorPath(from: Point, to: Point) {
  const mid = (from.x + to.x) / 2;
  return `M${from.x},${from.y} C${mid},${from.y} ${mid},${to.y} ${to.x},${to.y}`;
}
