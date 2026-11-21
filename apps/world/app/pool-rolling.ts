import type { PoolTable, PoolState } from "../shared/pool-wire.ts";

type Point = { x: number; y: number; z: number };
function poolWorldPoint(table: PoolTable, point: Point): Point {
  const c = Math.cos(table.yaw),
    s = Math.sin(table.yaw);
  return {
    x: table.x + point.x * c + point.z * s,
    y: table.y + point.y,
    z: table.z - point.x * s + point.z * c,
  };
}

/** Feed snapshots (not repeated render frames) to the audio watchdog. */
export function observePoolRolling(state: PoolState) {
  return state.balls.flatMap((ball) => {
    if (ball.vx === undefined || ball.vy === undefined || ball.vz === undefined)
      return [];
    return [
      {
        key: `${state.table.id}:${ball.id}`,
        point: poolWorldPoint(state.table, ball),
        ball: {
          vx: ball.vx,
          vy: ball.vy,
          vz: ball.vz,
          stage: ball.stage ?? "table",
        },
      },
    ];
  });
}
