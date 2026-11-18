import { tracePlayerHull, type PlayerHullTraceResult } from "./collision.js";
import type { ParsedWorld } from "./types.js";
import {
  moveGoldSrcPlayerWithSweep,
  type GoldSrcMovementConfig,
  type GoldSrcMovementInput,
  type GoldSrcMovementResult as SweepResult,
  type GoldSrcMovementState,
} from "../movement.js";

export {
  createGoldSrcMovementState,
  DEFAULT_GOLDSRC_MOVEMENT,
  type GoldSrcMovementConfig,
  type GoldSrcMovementInput,
  type GoldSrcMovementState,
} from "../movement.js";

export type GoldSrcMovementResult = SweepResult<PlayerHullTraceResult>;

/** Advances the standing BSP player by one short, fixed simulation command. */
export function moveGoldSrcPlayer(
  world: ParsedWorld,
  previous: GoldSrcMovementState,
  input: GoldSrcMovementInput,
  deltaSeconds: number,
  config?: GoldSrcMovementConfig,
): GoldSrcMovementResult {
  return moveGoldSrcPlayerWithSweep(
    (start, end) => tracePlayerHull(world, start, end),
    previous,
    input,
    deltaSeconds,
    config,
  );
}
