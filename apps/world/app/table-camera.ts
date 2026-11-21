import * as THREE from "three/webgpu";
import type { ViewCamera } from "@harrhy/pool/presentation";
import { FELT_Y } from "@harrhy/pool/table";
import type { PoolTable } from "../shared/pool-wire";
import { CHESS_BOARD_Y, CHESS_HALF_WIDTH } from "../shared/table-placement";

const up = new THREE.Vector3(0, 1, 0);

export function updateTableCamera(
  camera: THREE.PerspectiveCamera,
  rig: ViewCamera,
  table: PoolTable,
  {
    aspect,
    entering,
    elapsed,
    compact,
    isChess,
    blackSide,
  }: {
    aspect: number;
    entering: boolean;
    elapsed: number;
    compact: boolean;
    isChess: boolean;
    blackSide: boolean | undefined;
  },
) {
  camera.aspect = aspect;
  if (entering) rig.recenter();
  const anchor = new THREE.Vector3();
  rig.update(
    elapsed,
    anchor,
    "table",
    compact,
    isChess
      ? {
          halfWidth: CHESS_HALF_WIDTH,
          halfLength: CHESS_HALF_WIDTH,
          height: 0.19,
        }
      : undefined,
  );
  // The break cue ball starts on negative local Z.
  const yaw = table.yaw + (isChess && !blackSide ? 0 : Math.PI);
  camera.position
    .applyAxisAngle(up, yaw)
    .add(
      anchor.set(
        table.x,
        table.y + (isChess ? CHESS_BOARD_Y : FELT_Y),
        table.z,
      ),
    );
  camera.rotateOnWorldAxis(up, yaw);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
