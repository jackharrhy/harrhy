import {
  addComponent,
  addEntity,
  aos,
  createWorld,
  deleteWorld,
  query,
  removeEntity,
} from "bitecs";
import type { BspCollision } from "./bsp-collision.ts";
import {
  motionPose,
  motionState,
  stepMotion,
  type MotionState,
} from "./motion.ts";
import {
  validateInput,
  type InputCommand,
  type Pose,
  type Snapshot,
} from "./protocol.ts";

export async function createRoom(collision: BspCollision) {
  const { halfHeight, spawn, sweep } = collision;
  const ecs = createWorld();
  const Player = aos<
    (MotionState & { pending?: InputCommand[] }) | undefined
  >();
  const ids = new Map<string, number>();
  let tick = 0;
  let disposed = false;

  return {
    join(id: string): Pose {
      if (disposed) throw new Error("Room is disposed");
      const existing = ids.get(id);
      if (existing !== undefined)
        return motionPose(Player[existing]!, halfHeight);
      const eid = addEntity(ecs);
      addComponent(ecs, eid, Player);
      Player[eid] = motionState(
        {
          id,
          ...spawn,
          yaw: 0,
          pitch: 0,
          ack: 0,
          velocityX: 0,
          velocityZ: 0,
          verticalVelocity: 0,
          jumpHeld: false,
          stepCooldown: 0,
        },
        halfHeight,
      );
      ids.set(id, eid);
      return motionPose(Player[eid]!, halfHeight);
    },
    leave(id: string): boolean {
      const eid = ids.get(id);
      if (eid === undefined) return false;
      ids.delete(id);
      removeEntity(ecs, eid);
      Player[eid] = undefined;
      return true;
    },
    input(id: string, value: unknown): boolean {
      const eid = ids.get(id);
      if (eid === undefined) return false;
      const cmd = validateInput(value);
      const player = Player[eid]!;
      if (!cmd || cmd.seq <= (player.pending?.at(-1)?.seq ?? player.ack))
        return false;
      const queue = (player.pending ??= []);
      if (queue.length >= 8) queue.shift();
      queue.push(cmd);
      return true;
    },
    step() {
      if (disposed) throw new Error("Room is disposed");
      for (const eid of query(ecs, [Player])) {
        const player = Player[eid]!;
        stepMotion(player, player.pending?.shift(), sweep);
      }
      tick++;
    },
    snapshot(): Snapshot {
      return {
        tick,
        players: disposed
          ? []
          : Array.from(query(ecs, [Player]), (eid) =>
              motionPose(Player[eid]!, halfHeight),
            ),
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
