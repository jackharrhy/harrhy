import { PhysicsWorld } from "@harrhy/gurgur-engine";
import {
  PLAYER_HALF_HEIGHT,
  stepPlayerController,
  type PlayerControllerState,
} from "@harrhy/gurgur-game";
import { BAR, HALL, STOOLS } from "@harrhy/pool-simulation/geometry";
import { TICK_SECONDS, type InputCommand, type Pose } from "./protocol";

export type MotionOptions = Parameters<typeof PhysicsWorld.create>[0];

export async function createHallPhysics(options?: MotionOptions) {
  const world = await PhysicsWorld.create(options);
  const wall = 0.125;
  const wainscotInset = 0.4;
  const xWall = HALL.x - wainscotInset + wall;
  const zWall = HALL.z - wainscotInset + wall;
  world.createBox({
    type: "static",
    position: { x: 0, y: -0.5, z: 0 },
    halfExtents: { x: HALL.x + wall, y: 0.5, z: HALL.z + wall },
  });
  for (const side of [-1, 1]) {
    world.createBox({
      type: "static",
      position: { x: side * xWall, y: 11, z: 0 },
      halfExtents: { x: wall, y: 11, z: HALL.z + wall },
    });
    world.createBox({
      type: "static",
      position: { x: 0, y: 11, z: side * zWall },
      halfExtents: { x: HALL.x + wall, y: 11, z: wall },
    });
  }
  world.createBox({
    type: "static",
    position: { x: BAR.x, y: (BAR.height + 0.05) / 2, z: BAR.z },
    halfExtents: { x: BAR.width / 2 + 0.1, y: (BAR.height + 0.05) / 2, z: BAR.depth / 2 + 0.1 },
  });
  for (const { x, y, z } of STOOLS)
    world.createBox({
      type: "static",
      position: { x, y: y / 2, z },
      halfExtents: { x: 0.25, y: y / 2, z: 0.25 },
    });
  return world;
}

export type MotionState = {
  id: string;
  controller: PlayerControllerState;
  jumpHeld: boolean;
  pitch: number;
  ack: number;
};

export function motionState(pose: Pose): MotionState {
  return {
    id: pose.id,
    controller: {
      position: { x: pose.x, y: pose.y + PLAYER_HALF_HEIGHT, z: pose.z },
      verticalVelocity: pose.verticalVelocity,
      yaw: pose.yaw,
      grounded: pose.grounded,
      lastJumpCounter: 0,
      stepCooldown: pose.stepCooldown,
      crouched: false,
    },
    jumpHeld: pose.jumpHeld,
    pitch: pose.pitch,
    ack: pose.ack,
  };
}

export function motionPose(state: MotionState): Pose {
  const { position, yaw } = state.controller;
  return {
    id: state.id,
    x: position.x,
    y: position.y - PLAYER_HALF_HEIGHT,
    z: position.z,
    yaw,
    pitch: state.pitch,
    ack: state.ack,
    verticalVelocity: state.controller.verticalVelocity,
    grounded: state.controller.grounded,
    jumpHeld: state.jumpHeld,
    stepCooldown: state.controller.stepCooldown,
  };
}

export function stepMotion(world: PhysicsWorld, state: MotionState, cmd?: InputCommand) {
  const jump = cmd?.jump ?? false;
  const jumpCounter = state.controller.lastJumpCounter + Number(jump && !state.jumpHeld);
  state.controller = stepPlayerController(
    world,
    state.controller,
    {
      moveX: cmd?.strafe ?? 0,
      moveZ: cmd?.forward ?? 0,
      lookYaw: cmd?.yaw ?? state.controller.yaw,
      jumpCounter,
    },
    TICK_SECONDS,
  );
  if (cmd) {
    state.jumpHeld = jump;
    state.pitch = cmd.pitch;
    state.ack = cmd.seq;
  }
}

export async function createMotion(initial: Pose, options?: MotionOptions) {
  const world = await createHallPhysics(options);
  let state = motionState(initial);
  return {
    step(cmd: InputCommand): Pose {
      stepMotion(world, state, cmd);
      return motionPose(state);
    },
    reset(pose: Pose) {
      state = motionState(pose);
    },
    reconcile(authoritative: Pose, pending: readonly InputCommand[]): Pose {
      state = motionState(authoritative);
      for (const cmd of pending) {
        if (cmd.seq > state.ack) stepMotion(world, state, cmd);
      }
      return motionPose(state);
    },
    pose: () => motionPose(state),
    dispose: () => world.dispose(),
  };
}
