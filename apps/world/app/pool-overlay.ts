import { BALL_RADIUS, TABLE_HALF_WIDTH, TABLE_HALF_LENGTH } from "@harrhy/pool";
import { FELT_Y } from "@harrhy/pool/table";
import * as THREE from "three/webgpu";
import {
  createBallMaterials,
  createCue,
  createTable,
  cuePose,
  walnutUrl,
} from "@harrhy/pool/presentation";
import type { PoolState } from "../shared/pool-wire";
import { UNITS_PER_METRE as scale } from "../shared/bsp-collision";
import { billboardAtlasPath } from "./player-billboard";

export async function createPoolLayer(
  canvas: HTMLCanvasElement,
  hallGeometry: THREE.BufferGeometry,
) {
  const layer = document.createElement("canvas");
  layer.className = "world-pool-layer";
  layer.setAttribute("aria-hidden", "true");
  layer.hidden = true;
  const renderer = new THREE.WebGPURenderer({
    canvas: layer,
    alpha: true,
    antialias: true,
  });
  renderer.setClearColor(0, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  try {
    await renderer.init();
  } catch (error) {
    renderer.dispose();
    throw error;
  }

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffce92, 0.38));
  scene.add(new THREE.HemisphereLight(0xffc98c, 0x523626, 1.25));
  const table = createTable(createBallMaterials(), { walnutUrl });
  const cue = createCue();
  const guide = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]),
    new THREE.LineDashedMaterial({
      color: 0xf6e2b5,
      dashSize: 0.035,
      gapSize: 0.027,
      depthWrite: false,
    }),
  );
  table.group.add(cue, guide);
  // Stand in for the standalone hall's warm fill at the cabinet sides.
  for (const side of [-1, 1]) {
    const fill = new THREE.PointLight(0xffb269, 11, 6, 2);
    fill.position.set(side * 2, 1.35, side * 1.75);
    table.group.add(fill);
  }
  scene.add(table.group);
  // World keeps its BSP color pass. Reuse that geometry as an invisible depth
  // prepass in the aligned Three layer, so walls still hide the shared meshes.
  const depthMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    colorWrite: false,
  });
  const depthHall = new THREE.Mesh(hallGeometry, depthMaterial);
  depthHall.renderOrder = -2;
  scene.add(depthHall);
  const atlas = new THREE.TextureLoader().load(billboardAtlasPath);
  atlas.minFilter = atlas.magFilter = THREE.NearestFilter;
  const depthSprites = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      colorWrite: false,
      map: atlas,
      alphaTest: 0.45,
    }),
  );
  depthSprites.renderOrder = -1;
  depthSprites.frustumCulled = false;
  scene.add(depthSprites);
  canvas.after(layer);

  let spriteCapacity = 0;
  const cueForward = new THREE.Vector3(1, 0, 0);
  const cueAxis = new THREE.Vector3();
  function syncSprites(vertices: readonly number[], length: number) {
    const count = length / 8;
    depthSprites.visible = count > 0;
    if (!count) return;
    if (count > spriteCapacity) {
      spriteCapacity = 2 ** Math.ceil(Math.log2(count));
      depthSprites.geometry.dispose();
      depthSprites.geometry = new THREE.BufferGeometry();
      depthSprites.geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(
          new Float32Array(spriteCapacity * 3),
          3,
        ).setUsage(THREE.DynamicDrawUsage),
      );
      depthSprites.geometry.setAttribute(
        "uv",
        new THREE.BufferAttribute(
          new Float32Array(spriteCapacity * 2),
          2,
        ).setUsage(THREE.DynamicDrawUsage),
      );
    }
    const positions = depthSprites.geometry.getAttribute("position");
    const uv = depthSprites.geometry.getAttribute("uv");
    for (let i = 0; i < count; i++) {
      const at = i * 8;
      positions.setXYZ(
        i,
        -vertices[at + 1]! / scale,
        vertices[at + 2]! / scale,
        -vertices[at]! / scale,
      );
      uv.setXY(i, vertices[at + 3]!, 1 - vertices[at + 4]!);
    }
    positions.needsUpdate = uv.needsUpdate = true;
    depthSprites.geometry.setDrawRange(0, count);
  }

  return {
    graphics: table.graphics,
    draw(
      camera: THREE.Camera,
      pool: PoolState | undefined,
      view: { aim?: number; power?: number } | undefined,
      vertices: readonly number[],
      spriteLength: number,
    ) {
      layer.hidden = !pool;
      if (!pool) return;
      const { x: tableX, y: tableY, z: tableZ, yaw } = pool.table;
      table.group.position.set(tableX, tableY, tableZ);
      table.group.rotation.y = yaw;
      for (const mesh of table.balls) mesh.visible = false;
      for (const ball of pool.balls) {
        const mesh = table.balls[ball.id];
        if (!mesh) continue;
        mesh.visible = true;
        mesh.position.set(ball.x, ball.y, ball.z);
        mesh.quaternion.fromArray(ball.q);
      }
      const ball = table.balls[0];
      const aim = view?.aim;
      cue.visible = aim !== undefined && ball.visible;
      guide.visible = cue.visible;
      if (aim !== undefined && cue.visible) {
        const dx = Math.cos(aim),
          dz = Math.sin(aim);
        let distance = 6;
        for (const mesh of table.balls.slice(1))
          if (mesh.visible && mesh.position.y > FELT_Y) {
            const x = mesh.position.x - ball.position.x,
              z = mesh.position.z - ball.position.z;
            const along = x * dx + z * dz,
              across = x * dz - z * dx;
            if (along > 0 && Math.abs(across) < BALL_RADIUS * 2)
              distance = Math.min(
                distance,
                along - Math.sqrt((BALL_RADIUS * 2) ** 2 - across ** 2),
              );
          }
        for (const [position, direction, edge] of [
          [ball.position.x, dx, TABLE_HALF_WIDTH - BALL_RADIUS],
          [ball.position.z, dz, TABLE_HALF_LENGTH - BALL_RADIUS],
        ]) {
          if (Math.abs(direction) > 0.00001)
            distance = Math.min(
              distance,
              (Math.sign(direction) * edge - position) / direction,
            );
        }
        distance = Math.max(0, distance);
        const positions = guide.geometry.getAttribute("position");
        positions.setXYZ(0, ball.position.x, FELT_Y + 0.012, ball.position.z);
        positions.setXYZ(
          1,
          ball.position.x + dx * distance,
          FELT_Y + 0.012,
          ball.position.z + dz * distance,
        );
        positions.needsUpdate = true;
        guide.computeLineDistances();
        guide.frustumCulled = false;

        const pose = cuePose(ball.position, aim, view?.power ?? 0);
        cue.position.fromArray(pose.position);
        cue.quaternion.setFromUnitVectors(
          cueForward,
          cueAxis.fromArray(pose.axis),
        );
      }
      table.light.shadow.needsUpdate = true;
      if (layer.width !== canvas.width || layer.height !== canvas.height)
        renderer.setSize(canvas.width, canvas.height, false);
      syncSprites(vertices, spriteLength);
      renderer.render(scene, camera);
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        if (object.geometry !== hallGeometry) geometries.add(object.geometry);
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          materials.add(material);
          for (const value of Object.values(material))
            if (value instanceof THREE.Texture) textures.add(value);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      guide.geometry.dispose();
      guide.material.dispose();
      table.light.shadow.dispose();
      renderer.dispose();
      layer.remove();
    },
  };
}
