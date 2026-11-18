export const TICK_HZ = 60;
export const TICK_SECONDS = 1 / TICK_HZ;
export const TICK_MS = TICK_SECONDS * 1000;

export const LEGACY_MAP_REVISION = "legacy-v1";
export const BSP_MAP_PATH = "/maps/hall.bsp";

export type MapReady = {
  status: "ready";
  map: "legacy" | "bsp";
  revision: string;
};

export type InputCommand = {
  seq: number;
  forward: number;
  strafe: number;
  jump: boolean;
  yaw: number;
  pitch: number;
};

/** Three coordinates in metres (y at the feet), angles in radians. Yaw zero faces -Z. */
export type Pose = {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  ack: number;
  velocityX: number;
  velocityZ: number;
  verticalVelocity: number;
  grounded: boolean;
  jumpHeld: boolean;
  stepCooldown: number;
};

export type Snapshot = { tick: number; players: Pose[] };

export type ServerMessage =
  | { type: "welcome"; id: string; revision: string }
  | { type: "joined"; id: string }
  | { type: "left"; id: string }
  | { type: "roster"; ids: string[] }
  | ({ type: "motion" } & Snapshot);

export function parseInput(raw: string): InputCommand | null {
  try {
    return validateInput(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function validateInput(value: unknown): InputCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { seq, forward, strafe, jump, yaw, pitch } = value as Record<
    string,
    unknown
  >;
  if (
    typeof seq !== "number" ||
    !Number.isSafeInteger(seq) ||
    seq < 1 ||
    typeof forward !== "number" ||
    !Number.isFinite(forward) ||
    Math.abs(forward) > 1 ||
    typeof strafe !== "number" ||
    !Number.isFinite(strafe) ||
    Math.abs(strafe) > 1 ||
    typeof jump !== "boolean" ||
    typeof yaw !== "number" ||
    !Number.isFinite(yaw) ||
    typeof pitch !== "number" ||
    !Number.isFinite(pitch) ||
    Math.abs(pitch) > Math.PI / 2
  )
    return null;

  const turn = Math.PI * 2;
  let wrappedYaw = yaw % turn;
  if (wrappedYaw > Math.PI) wrappedYaw -= turn;
  if (wrappedYaw < -Math.PI) wrappedYaw += turn;
  return { seq, forward, strafe, jump, yaw: wrappedYaw, pitch };
}
