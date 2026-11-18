interface ItemGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z: number;
}

export interface BoardItem extends ItemGeometry {
  id: string;
  assetId: string;
  filename: string;
  revision: number;
  link?: LinkPreview;
}

export interface LinkPreview {
  url: string;
  title: string;
  description: string;
  imageUrl: string | null;
  videoUrl?: string | null;
  siteName: string;
}

export interface BoardSnapshot {
  boardId: string;
  sequence: number;
  items: BoardItem[];
}

export type BoardOperation =
  | {
      kind: "create";
      operationId: string;
      item: ItemGeometry & Pick<BoardItem, "id" | "assetId">;
    }
  | ({
      kind: "transform";
      operationId: string;
      itemId: string;
      baseRevision: number;
    } & ItemGeometry)
  | {
      kind: "remove";
      operationId: string;
      itemId: string;
      baseRevision: number;
    };

export type BoardServerFrame =
  | { type: "ready"; snapshot: BoardSnapshot }
  | { type: "pong" }
  | {
      type: "applied";
      operationId: string;
      sequence: number;
      item: BoardItem | null;
      itemId: string;
    }
  | {
      type: "rejected";
      operationId: string;
      reason: string;
      snapshot: BoardSnapshot;
    }
  | { type: "error"; message: string };

export function parseOperation(value: unknown): BoardOperation | null {
  if (!isRecord(value) || !isUuid(value.operationId)) return null;
  const { kind, operationId } = value;
  if (kind === "create") {
    const { item } = value;
    if (
      !isRecord(item) ||
      !isUuid(item.id) ||
      !isUuid(item.assetId) ||
      !validGeometry(item)
    )
      return null;
    return {
      kind,
      operationId,
      item: { id: item.id, assetId: item.assetId, ...itemGeometry(item) },
    };
  }
  const { itemId, baseRevision } = value;
  if (!isUuid(itemId) || !validRevision(baseRevision)) return null;
  if (kind === "remove") return { kind, operationId, itemId, baseRevision };
  if (kind === "transform" && validGeometry(value))
    return { kind, operationId, itemId, baseRevision, ...itemGeometry(value) };
  return null;
}

export function itemGeometry(item: ItemGeometry): ItemGeometry {
  const { x, y, width, height, rotation, z } = item;
  return { x, y, width, height, rotation, z };
}

function bounded(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && value >= min && value <= max;
}

function validGeometry(
  value: Record<string, unknown>,
): value is Record<string, unknown> & ItemGeometry {
  return (
    bounded(value.x, -1_000_000, 1_000_000) &&
    bounded(value.y, -1_000_000, 1_000_000) &&
    bounded(value.width, 24, 20_000) &&
    bounded(value.height, 24, 20_000) &&
    bounded(value.rotation, -360_000, 360_000) &&
    bounded(value.z, -1_000_000, 1_000_000) &&
    Number.isInteger(value.z)
  );
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
  );
}
