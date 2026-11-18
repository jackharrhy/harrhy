import * as THREE from "three/webgpu";

type Point = { x: number; y: number; z: number };
type Remote = Point & { id: string; yaw: number };
type Layout = {
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  quad: { widthMeters: number; heightMeters: number };
  playerCollider: { heightMeters: number };
  views: readonly { viewDirection: Point }[];
};

export const billboardAtlasPath = "/billboard/player-billboard.png";

export async function loadBillboardLayout(): Promise<Layout> {
  const response = await fetch("/billboard/player-billboard.json");
  if (!response.ok) throw new Error(`Loading billboard layout: HTTP ${response.status}`);
  return response.json();
}

// The atlas encodes unit directions from the character centre to the camera.
// Rotate into player-local space; normalizing isn't needed for comparing dots.
function closestView(yaw: number, center: Point, camera: Point, views: Layout["views"]) {
  const dx = camera.x - center.x;
  const dy = camera.y - center.y;
  const dz = camera.z - center.z;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const x = cos * dx - sin * dz;
  const z = sin * dx + cos * dz;
  let best = -Infinity;
  let index = 0;
  for (let i = 0; i < views.length; i++) {
    const direction = views[i]!.viewDirection;
    const dot = x * direction.x + dy * direction.y + z * direction.z;
    if (dot > best) {
      best = dot;
      index = i;
    }
  }
  return index;
}

export function createBillboards(scene: THREE.Scene, atlas: THREE.Texture, layout: Layout) {
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.magFilter = atlas.minFilter = THREE.NearestFilter;
  atlas.generateMipmaps = false;
  const material = new THREE.MeshBasicMaterial({ map: atlas, alphaTest: 0.45, toneMapped: false });
  const frames = new Map<number, THREE.PlaneGeometry>();
  const players = new Map<string, THREE.Mesh<THREE.PlaneGeometry>>();

  function frame(index: number) {
    const cached = frames.get(index);
    if (cached) return cached;
    const geometry = new THREE.PlaneGeometry(layout.quad.widthMeters, layout.quad.heightMeters);
    const uv = geometry.attributes.uv;
    const col = index % layout.columns;
    const row = layout.rows - 1 - Math.floor(index / layout.columns);
    // Sample inside this cell, never the adjacent frame at a shared edge.
    const insetX = 0.5 / layout.frameWidth;
    const insetY = 0.5 / layout.frameHeight;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(
        i,
        (col + insetX + uv.getX(i) * (1 - 2 * insetX)) / layout.columns,
        (row + insetY + uv.getY(i) * (1 - 2 * insetY)) / layout.rows,
      );
    }
    frames.set(index, geometry);
    return geometry;
  }

  return {
    draw(camera: THREE.PerspectiveCamera, remotes: readonly Remote[]) {
      const seen = new Set<string>();
      for (const player of remotes) {
        seen.add(player.id);
        const center = {
          x: player.x,
          y: player.y + layout.playerCollider.heightMeters / 2,
          z: player.z,
        };
        const geometry = frame(closestView(player.yaw, center, camera.position, layout.views));
        let mesh = players.get(player.id);
        if (!mesh) {
          mesh = new THREE.Mesh(geometry, material);
          players.set(player.id, mesh);
          scene.add(mesh);
        }
        mesh.geometry = geometry;
        mesh.position.copy(center);
        mesh.quaternion.copy(camera.quaternion);
      }
      for (const [id, mesh] of players) {
        if (seen.has(id)) continue;
        mesh.removeFromParent();
        players.delete(id);
      }
    },
    dispose() {
      for (const mesh of players.values()) mesh.removeFromParent();
      players.clear();
      for (const geometry of frames.values()) geometry.dispose();
      frames.clear();
      material.dispose();
    },
  };
}
