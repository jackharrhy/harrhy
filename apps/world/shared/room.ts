import {
  addComponent,
  addEntity,
  aos,
  createWorld,
  deleteWorld,
  query,
  removeEntity,
} from "bitecs";
import type { BspCollision } from "./bsp-collision";
import { HALL_SPAWN } from "@harrhy/pool-simulation/geometry";
import { motionPose, motionState, stepMotion, type MotionState } from "./motion";
import { validateInput, type InputCommand, type Pose, type Snapshot } from "./protocol";

function spawn(id: string, index: number): Pose {
  const slot = index % 48;
  return {
    id,
    x: HALL_SPAWN.x + ((((slot % 9) + 4) % 9) - 4),
    y: 0,
    z: HALL_SPAWN.z - 2.5 - Math.floor(slot / 9),
    yaw: 0,
    pitch: 0,
    ack: 0,
    velocityX: 0,
    velocityZ: 0,
    verticalVelocity: 0,
    grounded: true,
    jumpHeld: false,
    stepCooldown: 0,
  };
}

export async function createRoom(collision?: BspCollision) {
  const { halfHeight, sweep } = collision ?? {};
  const ecs = createWorld();
  const Player = aos<MotionState & { pending?: InputCommand[] }>();
  const ids = new Map<string, number>();
  let tick = 0;
  let nextSpawn = 0;
  let disposed = false;

  return {
    join(id: string): Pose {
      if (disposed) throw new Error("Room is disposed");
      const existing = ids.get(id);
      if (existing !== undefined) return motionPose(Player[existing], halfHeight);
      const eid = addEntity(ecs);
      addComponent(ecs, eid, Player);
      Player[eid] = motionState({ ...spawn(id, nextSpawn++), ...collision?.spawn }, halfHeight);
      ids.set(id, eid);
      return motionPose(Player[eid], halfHeight);
    },
    leave(id: string): boolean {
      const eid = ids.get(id);
      if (eid === undefined) return false;
      ids.delete(id);
      removeEntity(ecs, eid);
      delete Player[eid];
      return true;
    },
    input(id: string, value: unknown): boolean {
      const eid = ids.get(id);
      if (eid === undefined) return false;
      const cmd = validateInput(value);
      const player = Player[eid];
      if (!cmd || cmd.seq <= (player.pending?.at(-1)?.seq ?? player.ack)) return false;
      const queue = (player.pending ??= []);
      if (queue.length >= 8) queue.shift();
      queue.push(cmd);
      return true;
    },
    step() {
      if (disposed) throw new Error("Room is disposed");
      for (const eid of query(ecs, [Player])) {
        const player = Player[eid];
        stepMotion(player, player.pending?.shift(), sweep);
      }
      tick++;
    },
    snapshot(): Snapshot {
      return {
        tick,
        players: disposed
          ? []
          : Array.from(query(ecs, [Player]), (eid) => motionPose(Player[eid], halfHeight)),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ids.clear();
      Player.length = 0;
      deleteWorld(ecs);
    },
  };
}
