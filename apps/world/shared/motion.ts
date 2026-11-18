import {
  DEFAULT_GOLDSRC_MOVEMENT,
  moveGoldSrcPlayerWithSweep,
  type GoldSrcMovementState,
} from "@harrhy/worldview-renderer/movement";
import { HALF_HEIGHT, sweepHall, UNITS_PER_METRE as SCALE } from "./hall-collision";
import { TICK_SECONDS, type InputCommand, type Pose } from "./protocol";

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

export function motionState(pose: Pose): MotionState {
  return {
    id: pose.id,
    movement: {
      origin: [-pose.z * SCALE, -pose.x * SCALE, (pose.y + HALF_HEIGHT) * SCALE],
      velocity: [-pose.velocityZ * SCALE, -pose.velocityX * SCALE, pose.verticalVelocity * SCALE],
      onGround: pose.grounded,
      jumpHeld: pose.jumpHeld,
    },
    yaw: pose.yaw,
    pitch: pose.pitch,
    ack: pose.ack,
  };
}

export function motionPose(state: MotionState): Pose {
  const { origin, velocity, onGround, jumpHeld } = state.movement;
  return {
    id: state.id,
    x: -origin[1] / SCALE,
    y: origin[2] / SCALE - HALF_HEIGHT,
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

export function stepMotion(state: MotionState, cmd?: InputCommand) {
  state.movement = moveGoldSrcPlayerWithSweep(
    sweepHall,
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

export async function createMotion(initial: Pose) {
  let state = motionState(initial);
  return {
    step(cmd: InputCommand): Pose {
      stepMotion(state, cmd);
      return motionPose(state);
    },
    reset(pose: Pose) {
      state = motionState(pose);
    },
    reconcile(authoritative: Pose, pending: readonly InputCommand[]): Pose {
      state = motionState(authoritative);
      for (const cmd of pending) {
        if (cmd.seq > state.ack) stepMotion(state, cmd);
      }
      return motionPose(state);
    },
    pose: () => motionPose(state),
    dispose() {},
  };
}
