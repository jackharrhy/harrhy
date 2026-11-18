import { BAR, HALL, STOOLS } from "@harrhy/pool-simulation/geometry";
import { SURF_RAMP } from "../shared/surf-ramp";
import * as THREE from "three/webgpu";

export const hallTexturePaths = [
  "/textures/hall-floor-wood.webp",
  "/textures/hall-brick.webp",
  "/textures/hall-brick-normal.webp",
  "/textures/hall-green-wood.webp",
  "/textures/hall-trim-wood.webp",
] as const;

function box(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
  textureMetres?: number,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  if (textureMetres) {
    const uv = mesh.geometry.attributes.uv;
    const faces = [
      [d, h],
      [d, h],
      [w, d],
      [w, d],
      [w, h],
      [w, h],
    ];
    for (let i = 0; i < uv.count; i++) {
      const [width, height] = faces[Math.floor(i / 4)];
      uv.setXY(i, (uv.getX(i) * width) / textureMetres, (uv.getY(i) * height) / textureMetres);
    }
  }
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
export function createHall(textures: readonly THREE.Texture[]) {
  const [floor, brick, normal, green, wood] = textures;
  const group = new THREE.Group();
  for (const texture of textures) {
    if (texture !== normal) texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
  }
  box(
    group,
    HALL.x * 2,
    0.25,
    HALL.z * 2,
    0,
    -0.125,
    0,
    new THREE.MeshStandardMaterial({
      map: floor,
      bumpMap: floor,
      bumpScale: 0.004,
      roughness: 0.92,
    }),
    4,
  ).name = "walk-floor";
  const brickMat = new THREE.MeshStandardMaterial({
    map: brick,
    normalMap: normal,
    roughness: 0.96,
  });
  brickMat.normalScale.set(0.35, 0.35);
  const paint = woodMaterial(green);
  const trim = woodMaterial(wood);
  const darkWood = woodMaterial(wood, 0xb6a18b);
  for (const [x, z, rotation] of [
    [0, -HALL.z, 0],
    [0, HALL.z, Math.PI],
    [-HALL.x, 0, Math.PI / 2],
    [HALL.x, 0, -Math.PI / 2],
  ]) {
    const wall = new THREE.Group();
    wall.position.set(x, 0, z);
    wall.rotation.y = rotation;
    group.add(wall);
    const width = x ? HALL.z * 2 : HALL.x * 2 + 0.4;
    box(wall, width, 22, 0.25, 0, 10.85, 0, brickMat, 3);
    box(wall, width, 1, 0.3, 0, 0.5, 0.2, paint, 1);
    box(wall, width, 0.12, 0.36, 0, 0.06, 0.2, darkWood, 1);
    box(wall, width, 0.07, 0.4, 0, 1.025, 0.2, darkWood, 1);
    for (let along = -width / 2 + 1; along < width / 2; along++)
      box(wall, 0.04, 0.87, 0.05, along, 0.555, 0.365, darkWood, 1);
  }
  const bar = new THREE.MeshStandardMaterial({ color: 0x3c3225, roughness: 0.92 });
  box(group, BAR.width, BAR.height, BAR.depth, BAR.x, BAR.height / 2, BAR.z, bar);
  box(group, BAR.width + 0.2, 0.1, BAR.depth + 0.2, BAR.x, BAR.height, BAR.z, trim, 1);
  for (const { x, y, z } of STOOLS) {
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.12, 16), paint);
    stool.position.set(x, y - 0.06, z);
    group.add(stool);
    box(group, 0.12, y - 0.12, 0.12, x, (y - 0.12) / 2, z, darkWood, 1);
  }
  const { highX, lowX, height, minZ, maxZ } = SURF_RAMP;
  const rampGeometry = new THREE.BufferGeometry();
  rampGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        highX,
        0,
        minZ,
        lowX,
        0,
        minZ,
        highX,
        height,
        minZ,
        highX,
        0,
        maxZ,
        lowX,
        0,
        maxZ,
        highX,
        height,
        maxZ,
      ],
      3,
    ),
  );
  rampGeometry.setIndex([0, 2, 1, 3, 4, 5, 2, 5, 1, 1, 5, 4, 0, 3, 5, 0, 5, 2]);
  const rampFaces = rampGeometry.toNonIndexed();
  rampGeometry.dispose();
  rampFaces.computeVertexNormals();
  const ramp = new THREE.Mesh(
    rampFaces,
    new THREE.MeshStandardMaterial({ color: 0x886547, roughness: 0.82, side: THREE.DoubleSide }),
  );
  group.add(ramp);
  return group;
}

function woodMaterial(map: THREE.Texture, color = 0xffffff) {
  return new THREE.MeshStandardMaterial({
    color,
    map,
    bumpMap: map,
    bumpScale: 0.003,
    roughness: 0.92,
  });
}
