import type { BallStage, PoolSound } from "@harrhy/pool";

export type PoolTable = {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  houseBot?: boolean;
};
export type PoolBall = {
  id: number;
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  stage?: BallStage;
  /** Table-local orientation in x, y, z, w order. */
  q: [number, number, number, number];
};
export type PoolState = {
  type: "pool";
  /** Worker monotonic clock, in milliseconds. */
  sampledAt: number;
  /** Completed physics steps since strike; present while rolling. */
  shotTick?: number;
  table: PoolTable;
  balls: PoolBall[];
  /** One-shot physics events since the last broadcast, in table-local metres. */
  sounds?: PoolSound[];
  groups: ["solid" | "stripe" | null, "solid" | "stripe" | null];
  remaining: { solid: number; stripe: number };
  cue?: { id: string; yaw: number; power: number };
  strike?: { id: string; yaw: number; power: number; turnToken: number };
  seats: string[];
  turn: string | null;
  turnToken: number;
  phase: "waiting" | "aiming" | "rolling" | "ball-in-hand" | "finished";
  winner: string | null;
  message?: string;
  bot?: { id: string; x: number; y: number; z: number; yaw: number };
};
export type PoolCommand =
  | { type: "pool-rematch"; tableId: string; turnToken: number }
  | {
      type: "pool-cue";
      tableId: string;
      turnToken: number;
      yaw: number;
      power: number;
    }
  | { type: "pool-join"; tableId: string; withBot?: boolean }
  | { type: "pool-leave"; tableId: string }
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
  const { type, tableId, x, z, yaw, power, turnToken, withBot } =
    value as Record<string, unknown>;
  if (typeof tableId !== "string" || !/^[a-z0-9-]{1,48}$/.test(tableId))
    return null;
  if (type === "pool-leave") return { type, tableId };
  if (
    type === "pool-join" &&
    (withBot === undefined || typeof withBot === "boolean")
  )
    return { type, tableId, withBot };
  if (
    typeof turnToken !== "number" ||
    !Number.isSafeInteger(turnToken) ||
    turnToken < 0
  )
    return null;
  if (type === "pool-rematch") return { type, tableId, turnToken };
  if (
    type === "pool-place" &&
    typeof x === "number" &&
    Math.abs(x) <= 4 &&
    typeof z === "number" &&
    Math.abs(z) <= 4
  )
    return { type, tableId, turnToken, x, z };
  if (
    (type === "pool-shot" || type === "pool-cue") &&
    typeof yaw === "number" &&
    Math.abs(yaw) <= 2 * Math.PI &&
    typeof power === "number" &&
    (power > 0 || (type === "pool-cue" && power === 0)) &&
    power <= 1
  )
    return { type, tableId, turnToken, yaw, power };
  return null;
}
