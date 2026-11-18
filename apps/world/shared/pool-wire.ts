export type PoolTable = {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
};
export type PoolBall = { id: number; x: number; y: number; z: number };
export type PoolState = {
  type: "pool";
  table: PoolTable;
  balls: PoolBall[];
  seats: string[];
  turn: string | null;
  turnToken: number;
  phase: "waiting" | "aiming" | "rolling" | "ball-in-hand" | "finished";
  winner: string | null;
  message?: string;
};
export type PoolCommand =
  | { type: "pool-join" | "pool-leave"; tableId: string }
  | {
      type: "pool-place";
      tableId: string;
      turnToken: number;
      x: number;
      z: number;
    }
  | {
      type: "pool-shot";
      tableId: string;
      turnToken: number;
      yaw: number;
      power: number;
    };

export function parsePoolCommand(raw: string): PoolCommand | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const { type, tableId, x, z, yaw, power, turnToken } = value as Record<
    string,
    unknown
  >;
  if (typeof tableId !== "string" || !/^[a-z0-9-]{1,48}$/.test(tableId))
    return null;
  if (type === "pool-join" || type === "pool-leave") return { type, tableId };
  if (
    typeof turnToken !== "number" ||
    !Number.isSafeInteger(turnToken) ||
    turnToken < 0
  )
    return null;
  if (
    type === "pool-place" &&
    typeof x === "number" &&
    Math.abs(x) <= 4 &&
    typeof z === "number" &&
    Math.abs(z) <= 4
  )
    return { type, tableId, turnToken, x, z };
  if (
    type === "pool-shot" &&
    typeof yaw === "number" &&
    Math.abs(yaw) <= 2 * Math.PI &&
    typeof power === "number" &&
    power > 0 &&
    power <= 1
  )
    return { type, tableId, turnToken, yaw, power };
  return null;
}
