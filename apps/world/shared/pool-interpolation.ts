import { Quaternion } from "three";
import type { PoolBall, PoolState } from "./pool-wire.ts";

const delayMs = 100;
const maxSnapshots = 16;

/** Buffer render poses only. Gameplay should use the latest authoritative state. */
export function createPoolInterpolation() {
  const snapshots: PoolState[] = [];
  let clockOffset = Infinity;
  let renderedAt = -Infinity;

  function reset() {
    snapshots.length = 0;
    clockOffset = Infinity;
    renderedAt = -Infinity;
  }

  return {
    reset,
    push(state: PoolState, receivedAt: number) {
      const previous = snapshots.at(-1);
      if (previous?.table.id !== state.table.id) reset();
      else if (state.sampledAt < previous.sampledAt) return;
      else {
        const sameShot =
          previous.phase === "rolling" &&
          state.phase === "rolling" &&
          state.turnToken === previous.turnToken;
        const settled =
          previous.phase === "rolling" &&
          state.phase !== "rolling" &&
          state.phase !== "waiting" &&
          state.turnToken === previous.turnToken + 1;
        if (!sameShot && !settled) reset();
      }
      // Estimate the clock offset using the least-delayed packet in the shot.
      clockOffset = Math.min(clockOffset, receivedAt - state.sampledAt);
      if (snapshots.at(-1)?.sampledAt === state.sampledAt) snapshots.pop();
      snapshots.push(state);
      if (snapshots.length > maxSnapshots) snapshots.shift();
    },
    sample(now: number): PoolBall[] | undefined {
      const newest = snapshots.at(-1);
      if (!newest) return;
      if (snapshots.length === 1) return newest.balls;
      const target = Math.min(
        newest.sampledAt,
        Math.max(renderedAt, now - clockOffset - delayMs),
      );
      renderedAt = target;
      while (snapshots.length > 1 && snapshots[1].sampledAt <= target)
        snapshots.shift();
      const [before, after] = snapshots;
      if (!after || target <= before.sampledAt) return before.balls;
      const fraction =
        (target - before.sampledAt) / (after.sampledAt - before.sampledAt);
      const nextById = new Map(after.balls.map((ball) => [ball.id, ball]));
      return before.balls.map((ball) => {
        const next = nextById.get(ball.id);
        // Change visibility at the newer snapshot, not at the start of the interval.
        if (!next) return ball;
        const q: PoolBall["q"] = [0, 0, 0, 1];
        Quaternion.slerpFlat(q, 0, ball.q, 0, next.q, 0, fraction);
        return {
          id: ball.id,
          x: ball.x + (next.x - ball.x) * fraction,
          y: ball.y + (next.y - ball.y) * fraction,
          z: ball.z + (next.z - ball.z) * fraction,
          q,
        };
      });
    },
  };
}
