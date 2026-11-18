import * as THREE from "three/webgpu";
import { createHall, hallTexturePaths } from "./hall";
import { billboardAtlasPath, createBillboards, loadBillboardLayout } from "./player-billboard";

type Pose = { id: string; x: number; y: number; z: number; yaw: number; pitch: number };
export type FloorPoint = { x: number; z: number };
type RemotePose = Pose & { id: string };

export async function createView(canvas: HTMLCanvasElement): Promise<{
  draw(local: Pose, remotes: readonly RemotePose[], destination?: FloorPoint, avatar?: Pose): void;
  pickFloor(x: number, y: number): FloorPoint | undefined;
  dispose(): void;
}> {
  const forceWebGL = new URLSearchParams(window.location.search).get("renderer") === "webgl";
  let renderer: THREE.WebGPURenderer | undefined;
  let deviceError: Error | undefined;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.04, 60);
  const ray = new THREE.Raycaster();
  let hall: THREE.Group;
  let marker: THREE.Mesh;
  const textures: THREE.Texture[] = [];
  let billboards: ReturnType<typeof createBillboards> | undefined;
  let initialized = false;
  let disposed = false;

  function dispose() {
    if (disposed) return;
    disposed = true;
    billboards?.dispose();
    const materials = new Set<THREE.Material>();
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      materials.add(object.material);
    });
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    scene.clear();
    if (initialized && renderer) {
      void renderer.dispose().catch((error) => console.error("Disposing the hall renderer", error));
    }
  }

  try {
    const layout = await loadBillboardLayout();
    const loader = new THREE.TextureLoader();
    const results = await Promise.allSettled(
      [...hallTexturePaths, billboardAtlasPath].map(async (path) => {
        try {
          return await loader.loadAsync(path);
        } catch (cause) {
          throw new Error(`Loading texture ${path}`, { cause });
        }
      }),
    );
    for (const result of results) {
      if (result.status === "fulfilled") textures.push(result.value);
    }
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;

    // A canvas cannot switch context types once configured. Three handles
    // startup fallback; after device loss the user can reload in WebGL mode.
    renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL });
    const onDeviceLost = renderer.onDeviceLost.bind(renderer);
    renderer.onDeviceLost = (info) => {
      if (disposed || deviceError) return;
      onDeviceLost(info);
      const recovery =
        info.api === "WebGPU"
          ? " Reload with ?renderer=webgl to try WebGL 2."
          : " Reload to try again.";
      deviceError = new Error(`The hall lost its graphics device.${recovery}`);
    };
    await renderer.init();
    initialized = true;
    if (deviceError) throw deviceError;

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    scene.background = new THREE.Color(0x120e0b);
    scene.fog = new THREE.FogExp2(0x2d2118, 0.018);
    scene.add(new THREE.AmbientLight(0xffce92, 0.38));
    scene.add(new THREE.HemisphereLight(0xffc98c, 0x523626, 1.25));
    for (const [x, z] of [
      [-4, -5],
      [4, 5],
    ]) {
      const glow = new THREE.PointLight(0xff963f, 18, 9, 2);
      glow.position.set(x, 2.4, z);
      scene.add(glow);
    }
    hall = createHall(textures.slice(0, hallTexturePaths.length));
    scene.add(hall);
    marker = new THREE.Mesh(
      new THREE.RingGeometry(0.14, 0.18, 32),
      new THREE.MeshBasicMaterial({ color: 0xf5d18c }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.visible = false;
    scene.add(marker);
    billboards = createBillboards(scene, textures[hallTexturePaths.length], layout);
  } catch (error) {
    dispose();
    throw error;
  }

  const activeRenderer = renderer;
  let width = 0;
  let height = 0;
  let pixelRatio = 0;
  return {
    pickFloor(x, y) {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      camera.updateMatrixWorld();
      ray.setFromCamera(
        new THREE.Vector2(
          ((x - rect.left) / rect.width) * 2 - 1,
          1 - ((y - rect.top) / rect.height) * 2,
        ),
        camera,
      );
      const hit = ray.intersectObject(hall, true)[0];
      if (hit?.object.name !== "walk-floor" || hit.point.y < -0.01) return;
      return { x: hit.point.x, z: hit.point.z };
    },
    draw(local, remotes, destination, avatar) {
      if (disposed) return;
      if (deviceError) throw deviceError;
      const nextWidth = canvas.clientWidth;
      const nextHeight = canvas.clientHeight;
      if (!nextWidth || !nextHeight) return;
      const nextRatio = Math.min(window.devicePixelRatio, 1.75);
      if (nextWidth !== width || nextHeight !== height || nextRatio !== pixelRatio) {
        width = nextWidth;
        height = nextHeight;
        pixelRatio = nextRatio;
        activeRenderer.setDrawingBufferSize(width, height, pixelRatio);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
      camera.position.set(local.x, local.y + 1.65, local.z);
      camera.rotation.set(local.pitch, local.yaw, 0, "YXZ");
      if (avatar) {
        const anchor = camera.position.clone();
        anchor.y -= 0.5;
        const back = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
        ray.set(anchor, back);
        const wall = ray.intersectObject(hall, true)[0];
        const distance = Math.min(3.6, wall ? Math.max(0.08, wall.distance - 0.22) : Infinity);
        camera.position.copy(anchor).addScaledVector(back, distance);
        if (distance > 0.8) remotes = [...remotes, avatar];
      }
      marker.visible = destination !== undefined;
      if (destination) marker.position.set(destination.x, 0.015, destination.z);
      billboards?.draw(camera, remotes);
      activeRenderer.render(scene, camera);
    },
    dispose,
  };
}
