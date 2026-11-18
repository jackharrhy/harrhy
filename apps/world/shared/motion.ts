import {
  DEFAULT_GOLDSRC_MOVEMENT,
  moveGoldSrcPlayerWithSweep,
  type GoldSrcMovementState,
} from "@harrhy/schmovement";
import {
  UNITS_PER_METRE as SCALE,
  type BspCollision,
} from "./bsp-collision.ts";
import { TICK_SECONDS, type InputCommand, type Pose } from "./protocol.ts";

const WORLD_MOVEMENT = {
  ...DEFAULT_GOLDSRC_MOVEMENT,
  autoBhop: true,
  limitBunnySpeed: false,
  jumpHeight: 72,
};

export type MotionState = {
  id: string;
  movement: GoldSrcMovementState;
  yaw: number;
  pitch: number;
  ack: number;
};

export function motionState(pose: Pose, halfHeight: number): MotionState {
  return {
    id: pose.id,
    movement: {
      origin: [-pose.z * SCALE, -pose.x * SCALE, (pose.y + halfHeight) * SCALE],
      velocity: [
        -pose.velocityZ * SCALE,
        -pose.velocityX * SCALE,
        pose.verticalVelocity * SCALE,
      ],
      onGround: pose.grounded,
      jumpHeld: pose.jumpHeld,
    },
    yaw: pose.yaw,
    pitch: pose.pitch,
    ack: pose.ack,
  };
}

export function motionPose(state: MotionState, halfHeight: number): Pose {
  const { origin, velocity, onGround, jumpHeld } = state.movement;
  return {
    id: state.id,
    x: -origin[1] / SCALE,
    y: origin[2] / SCALE - halfHeight,
    z: -origin[0] / SCALE,
    yaw: state.yaw,
    pitch: state.pitch,
    ack: state.ack,
    velocityX: -velocity[1] / SCALE,
    velocityZ: -velocity[0] / SCALE,
    verticalVelocity: velocity[2] / SCALE,
    grounded: onGround,
    jumpHeld,
    stepCooldown: 0,
  };
}

export function stepMotion(
  state: MotionState,
  cmd: InputCommand | undefined,
  sweep: BspCollision["sweep"],
) {
  state.movement = moveGoldSrcPlayerWithSweep(
    sweep,
    state.movement,
    {
      forward: cmd?.forward ?? 0,
      side: cmd?.strafe ?? 0,
      yaw: cmd?.yaw ?? state.yaw,
      jump: cmd?.jump ?? false,
    },
    TICK_SECONDS,
    WORLD_MOVEMENT,
  ).state;
  if (cmd) {
    state.yaw = cmd.yaw;
    state.pitch = cmd.pitch;
    state.ack = cmd.seq;
  }
}

export async function createMotion(initial: Pose, collision: BspCollision) {
  const { halfHeight, sweep } = collision;
  let state = motionState(initial, halfHeight);
  return {
    step(cmd: InputCommand): Pose {
      stepMotion(state, cmd, sweep);
      return motionPose(state, halfHeight);
    },
    reset(pose: Pose) {
      state = motionState(pose, halfHeight);
    },
    reconcile(authoritative: Pose, pending: readonly InputCommand[]): Pose {
      state = motionState(authoritative, halfHeight);
      for (const cmd of pending) {
        if (cmd.seq > state.ack) stepMotion(state, cmd, sweep);
      }
      return motionPose(state, halfHeight);
    },
    pose: () => motionPose(state, halfHeight),
    dispose() {},
  };
}
