import type { Vec3Tuple } from "../core/index.js";

export type TextureFiltering = "nearest" | "linear";

export interface DistanceFog {
  readonly start: number;
  readonly end: number;
}

export interface CameraState {
  readonly position: Vec3Tuple;
  readonly yaw: number;
  readonly pitch: number;
  readonly fieldOfView: number;
}
