import * as THREE from "three/webgpu";
import {
  float,
  positionWorld,
  screenCoordinate,
  smoothstep,
  step,
  uv,
} from "three/tsl";
import { bayer16 } from "three/addons/tsl/math/Bayer.js";

export function wallMaterial(color: number, map: THREE.Texture | null = null) {
  const material = new THREE.MeshStandardNodeMaterial({
    color,
    map,
    roughness: 0.92,
  });
  material.opacityNode = step(
    bayer16(screenCoordinate.div(2)).r,
    float(1).sub(smoothstep(6, 16, positionWorld.y)),
  );
  material.alphaTest = 0.5;
  return material;
}

export function viewportVignette() {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new THREE.MeshBasicNodeMaterial({
    color: 0x100c08,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const edge = smoothstep(0.42, 0.72, uv().sub(0.5).length()).mul(0.72);
  material.opacityNode = edge.mul(0.48);
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  return { scene, camera };
}
