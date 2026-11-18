import type { GoldSrcHullSweep } from "@harrhy/schmovement";
import {
  entityValue,
  type ParsedWorld,
  type Vec3Tuple,
} from "@harrhy/worldview-renderer/core";
import type { PoolTable } from "./pool-wire.ts";

export function readPoolTable(
  entities: ParsedWorld["entities"],
  scale: number,
): PoolTable | undefined {
  const tables = entities.filter(
    (entity) => entityValue(entity, "classname") === "world_pool_table",
  );
  if (!tables.length) return;
  if (tables.length !== 1)
    throw Error("World currently supports one pool table");
  const [entity] = tables;
  const id = entityValue(entity, "id") ?? "";
  const origin = entityValue(entity, "origin")?.trim().split(/\s+/).map(Number);
  const angle = Number(entityValue(entity, "angle") ?? 0);
  if (
    !/^[a-z0-9-]{1,48}$/.test(id) ||
    origin?.length !== 3 ||
    !origin.every(Number.isFinite) ||
    !Number.isFinite(angle)
  )
    throw Error("Invalid authored pool table");
  return {
    id,
    x: -origin[1] / scale,
    y: origin[2] / scale,
    z: -origin[0] / scale,
    yaw: ((angle % 360) * Math.PI) / 180,
  };
}

export function withPoolCabinet(
  sweep: GoldSrcHullSweep,
  table: PoolTable,
  scale: number,
): GoldSrcHullSweep {
  const c = Math.cos(table.yaw),
    s = Math.sin(table.yaw);
  const radius = 16 / scale;
  const horizontalPadding = radius * (Math.abs(s) + Math.abs(c));
  const axes: Vec3Tuple[] = [
    [s, -c, 0],
    [-c, -s, 0],
    [0, 0, 1],
  ];
  const lower = [-0.78 - horizontalPadding, -1.4 - horizontalPadding, -0.6];
  const upper = [0.78 + horizontalPadding, 1.4 + horizontalPadding, 0.86 + 0.6];
  function local(p: Vec3Tuple) {
    const x = -p[1] / scale - table.x,
      z = -p[0] / scale - table.z;
    return [x * c - z * s, x * s + z * c, p[2] / scale - table.y];
  }
  return (from, to) => {
    const hit = sweep(from, to);
    if (hit.allSolid) return hit;
    const a = local(from),
      b = local(to);
    let enter = -Infinity,
      exit = Infinity,
      normal: Vec3Tuple = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const d = b[i] - a[i];
      if (Math.abs(d) < 1e-9) {
        if (a[i] <= lower[i] || a[i] >= upper[i]) return hit;
        continue;
      }
      const low = (lower[i] - a[i]) / d,
        high = (upper[i] - a[i]) / d;
      const near = Math.min(low, high);
      if (near > enter) {
        enter = near;
        const n = axes[i];
        normal = d > 0 ? [-n[0], -n[1], -n[2]] : n;
      }
      exit = Math.min(exit, Math.max(low, high));
    }
    if (exit <= Math.max(0, enter) || enter >= hit.fraction) return hit;
    if (enter < -1e-8) return { ...hit, startSolid: true, allSolid: exit >= 1 };
    const f = Math.max(0, enter);
    return {
      fraction: f,
      endPosition: [
        from[0] + (to[0] - from[0]) * f,
        from[1] + (to[1] - from[1]) * f,
        from[2] + (to[2] - from[2]) * f,
      ],
      planeNormal: normal,
      startSolid: hit.startSolid,
      allSolid: false,
    };
  };
}
