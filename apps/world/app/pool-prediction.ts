import {
  copyPredictedBalls,
  createShotResult,
  predictionDiffers,
  type PhysicalBall,
} from "@harrhy/pool";
import { PoolPhysics } from "@harrhy/pool/engine";
import type { PoolState, PoolBall } from "../shared/pool-wire.ts";
import { TICK_MS, TICK_SECONDS } from "../shared/protocol.ts";

type Command = { turnToken: number; yaw: number; power: number };

/** Render-only speculation. Rules, sounds and visibility remain authoritative. */
export function createWorldShotPrediction() {
  let shot: {
    engine: PoolPhysics;
    tableId: string;
    token: number;
    started: number;
    heard: number;
    latest: number;
    result: ReturnType<typeof createShotResult>;
    history: Map<number, PhysicalBall[]>;
    tick: number;
  } | null = null;
  function cancel() {
    shot?.engine.dispose();
    shot = null;
  }
  function advance(now: number) {
    if (!shot) return;
    const target = Math.floor((now - shot.started) / TICK_MS + 1e-7);
    if (
      !Number.isFinite(target) ||
      target - shot.tick > 60 ||
      now - shot.heard > 3000
    ) {
      cancel();
      return;
    }
    while (shot.tick < target) {
      shot.engine.step(TICK_SECONDS, shot.result);
      shot.history.set(++shot.tick, copyPredictedBalls(shot.engine.balls));
      shot.history.delete(shot.tick - 120);
    }
    return shot;
  }
  return {
    cancel,
    start(state: PoolState, command: Command, now: number) {
      cancel();
      if (
        state.phase !== "aiming" ||
        state.turnToken !== command.turnToken ||
        !state.balls.some((b) => b.id === 0) ||
        ![now, command.yaw, command.power].every(Number.isFinite) ||
        command.power <= 0 ||
        command.power > 1
      )
        return false;
      const engine = new PoolPhysics(
        state.balls.map((b) => ({
          ...b,
          vx: b.vx ?? 0,
          vy: b.vy ?? 0,
          vz: b.vz ?? 0,
          w: [0, 0, 0],
          stage: b.stage ?? "table",
          revision: 0,
          pocketed: false,
        })),
      );
      engine.strike(command.yaw, command.power);
      shot = {
        engine,
        tableId: state.table.id,
        token: command.turnToken,
        started: now,
        heard: now,
        latest: state.sampledAt,
        result: createShotResult(),
        history: new Map([[0, copyPredictedBalls(engine.balls)]]),
        tick: 0,
      };
      return true;
    },
    acknowledge(ack: {
      tableId: string;
      turnToken: number;
      accepted: boolean;
    }) {
      if (
        shot &&
        shot.tableId === ack.tableId &&
        shot.token === ack.turnToken &&
        !ack.accepted
      )
        cancel();
    },
    ingest(state: PoolState, now: number) {
      if (
        !shot ||
        state.table.id !== shot.tableId ||
        state.sampledAt <= shot.latest
      )
        return;
      shot.latest = state.sampledAt;
      if (state.phase === "aiming" && state.turnToken === shot.token) return;
      if (state.phase !== "rolling" || state.turnToken !== shot.token + 1) {
        cancel();
        return;
      }
      shot.heard = now;
      const current = advance(now);
      const frame = current?.history.get(state.shotTick ?? -1);
      // Partial snapshots cannot restore angular velocity or hidden bodies reliably.
      // On divergence, hand back to the authoritative interpolation buffer.
      if (
        !frame ||
        frame.filter((b) => !b.pocketed).length !== state.balls.length ||
        state.balls.some((b) => {
          const p = frame.find(
            (candidate) => candidate.id === b.id && !candidate.pocketed,
          );
          return !p || predictionDiffers(p, b);
        })
      )
        cancel();
    },
    sample(now: number): PoolBall[] | null {
      const current = advance(now);
      return (
        current?.history.get(current.tick)?.filter((b) => !b.pocketed) ?? null
      );
    },
  };
}
