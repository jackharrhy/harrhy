import { expect, test } from "bun:test";
import {
  createGoldSrcMovementState,
  DEFAULT_GOLDSRC_MOVEMENT,
  moveGoldSrcPlayerWithSweep,
  type GoldSrcHullSweep,
} from "../src/index.js";

const floor: GoldSrcHullSweep = (start, end) => {
  const hit = end[2] < 0 && start[2] >= 0;
  const fraction = hit ? start[2] / (start[2] - end[2]) : 1;
  return {
    fraction,
    endPosition: hit
      ? [start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction, 0]
      : end,
    planeNormal: hit ? [0, 0, 1] : [0, 0, 0],
    startSolid: false,
    allSolid: false,
  };
};

test("default jump requires release; auto-bhop repeats on landing", () => {
  for (const autoBhop of [false, true]) {
    let state = createGoldSrcMovementState([0, 0, 0]);
    let jumps = 0;
    for (let tick = 0; tick < 120; tick++) {
      const step = moveGoldSrcPlayerWithSweep(
        floor,
        state,
        { forward: 0, side: 0, yaw: 0, jump: true },
        1 / 60,
        { ...DEFAULT_GOLDSRC_MOVEMENT, autoBhop },
      );
      state = step.state;
      if (step.jumped) jumps++;
    }
    if (autoBhop) expect(jumps).toBeGreaterThan(1);
    else expect(jumps).toBe(1);
  }
});
