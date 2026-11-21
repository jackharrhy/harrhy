import * as THREE from "three/webgpu";
const ballColors = [
  "#f6f0df",
  "#e8b72d",
  "#315ca8",
  "#c94336",
  "#8350a2",
  "#dc792b",
  "#34846c",
  "#8a2b32",
  "#131716",
  "#e8b72d",
  "#315ca8",
  "#c94336",
  "#8350a2",
  "#dc792b",
  "#34846c",
  "#8a2b32",
];
export function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
export function createBallMaterials() {
  return ballColors.map((color, id) => {
    const map = canvasTexture(512, 256, (ctx) => {
      ctx.fillStyle = id > 8 ? "#eee9d9" : color;
      ctx.fillRect(0, 0, 512, 256);
      if (id > 8) {
        ctx.fillStyle = color;
        ctx.fillRect(0, 68, 512, 120);
      }
      if (id)
        for (const x of [128, 384]) {
          ctx.fillStyle = "#faf4e2";
          ctx.beginPath();
          ctx.arc(x, 128, 30, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#17201c";
          ctx.font = "bold 39px Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(id), x, 130);
        }
    });
    map.anisotropy = 8;
    return new THREE.MeshPhysicalMaterial({
      map,
      roughness: 0.24,
      metalness: 0,
      specularIntensity: 0.3,
      clearcoat: 0.08,
      clearcoatRoughness: 0.16,
    });
  });
}
