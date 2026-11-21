import { DEFAULT_GOLDSRC_MOVEMENT } from "@harrhy/schmovement";
import type { Vec3Tuple } from "@harrhy/worldview-renderer/core";
import {
  UNITS_PER_METRE as SCALE,
  type BspCollision,
} from "./bsp-collision.ts";

/** World metres at the player's feet. */
export type NavPoint = { x: number; y: number; z: number };
const GRID = 0.32;
const STEP = DEFAULT_GOLDSRC_MOVEMENT.stepSize / SCALE;
const SKIN = 0.001;
const MAX_SWEEPS = 6000;
const key = (i: number, j: number, y: number) =>
  `${i}:${j}:${Math.round(y / STEP)}`;

function distance(a: NavPoint, b: NavPoint) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

type Node = {
  point: NavPoint;
  parent?: Node;
  i: number;
  j: number;
  cost: number;
  score: number;
};

/** Search a local lattice on the standing hull, including runtime cabinets.
 * Each edge needs walkable support and clearance. No airborne links.
 */
export function createWorldNavigation({ sweep, halfHeight }: BspCollision) {
  function centre(p: NavPoint, lift: number): Vec3Tuple {
    return [-p.z * SCALE, -p.x * SCALE, (p.y + halfHeight + lift) * SCALE];
  }

  function findPath(from: NavPoint, to: NavPoint): NavPoint[] | null {
    if (
      ![from, to].every((p) =>
        [p.x, p.y, p.z].every((v) => Number.isFinite(v) && Math.abs(v) < 32768),
      ) ||
      distance(from, to) > 32
    )
      return null;
    let remaining = MAX_SWEEPS;
    function floor(p: NavPoint) {
      if (remaining <= 0) return null;
      remaining--;
      const hit = sweep(centre(p, STEP), centre(p, -STEP));
      if (
        hit.startSolid ||
        hit.allSolid ||
        hit.fraction === 1 ||
        hit.planeNormal[2] < 0.7
      )
        return null;
      return { x: p.x, y: hit.endPosition[2] / SCALE - halfHeight, z: p.z };
    }
    function clear(a: NavPoint, b: NavPoint, rise = SKIN, endRise = SKIN) {
      if (remaining <= 0) return false;
      remaining--;
      const hit = sweep(centre(a, rise), centre(b, endRise));
      return !hit.startSolid && !hit.allSolid && hit.fraction === 1;
    }
    function walk(a: NavPoint, x: number, z: number) {
      const n = Math.max(1, Math.ceil(Math.hypot(x - a.x, z - a.z) / 0.24));
      let prev = a;
      for (let i = 1; i <= n; i++) {
        const p = floor({
          x: a.x + ((x - a.x) * i) / n,
          y: prev.y,
          z: a.z + ((z - a.z) * i) / n,
        });
        if (!p) return null;
        if (!clear(prev, p)) {
          // A stair riser can block the diagonal centre sweep. Check the
          // up/forward/down hull traversal before accepting it.
          const top = prev.y + STEP;
          if (
            !clear(prev, prev, SKIN, STEP) ||
            !clear(prev, p, STEP, top - p.y) ||
            !clear(p, p, top - p.y, SKIN)
          )
            return null;
        }
        prev = p;
      }
      return prev;
    }
    const start = floor(from),
      goal = floor(to);
    if (!start || !goal) return null;
    function connects(a: NavPoint, b: NavPoint) {
      const end = walk(a, b.x, b.z);
      return end !== null && Math.abs(end.y - b.y) < SKIN * 2;
    }
    if (connects(start, goal)) return [goal];

    const open: Node[] = [{ i: 0, j: 0, point: start, cost: 0, score: 0 }];
    const seen = new Set([key(0, 0, start.y)]);
    while (open.length) {
      if (remaining <= 0) break;
      let best = 0;
      for (let i = 1; i < open.length; i++)
        if (open[i].score < open[best].score) best = i;
      const node = open[best];
      open[best] = open[open.length - 1];
      open.pop();
      if (
        distance(node.point, goal) <= GRID * 1.5 &&
        connects(node.point, goal)
      ) {
        const route = [goal];
        for (let n: Node | undefined = node; n?.parent; n = n.parent)
          route.push(n.point);
        route.reverse();
        // Shorten only by supported walks. Budget exhaustion just keeps
        // the remaining validated links intact.
        const corners: NavPoint[] = [];
        for (let i = 0; i < route.length; i++) {
          while (
            i + 1 < route.length &&
            connects(corners.at(-1) ?? start, route[i + 1])
          )
            i++;
          corners.push(route[i]);
        }
        return corners;
      }
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const i = node.i + di,
            j = node.j + dj;
          if (seen.has(key(i, j, node.point.y))) continue;
          const x = start.x + i * GRID,
            z = start.z + j * GRID;
          const p = walk(node.point, x, z);
          if (!p) continue;
          const id = key(i, j, p.y);
          if (seen.has(id)) continue;
          seen.add(id);
          const cost = node.cost + distance(node.point, p);
          open.push({
            i,
            j,
            point: p,
            parent: node,
            cost,
            score: cost + 1.6 * distance(p, goal),
          });
        }
    }
    return null;
  }
  return { findPath };
}
