import * as THREE from "three/webgpu";
import { canvasTexture } from "@harrhy/pool/presentation";
export function label(text: string, width: number, color = "#eee6cd") {
  const texture = canvasTexture(512, 128, (ctx) => {
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 50px Trebuchet MS, sans-serif";
    ctx.fillText(text, 256, 67, 480);
  });
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    }),
  );
  sprite.scale.set(width, width / 4, 1);
  return sprite;
}
export function plaque(text: string, width: number) {
  const map = canvasTexture(768, 192, (ctx) => {
    ctx.fillStyle = "#20372b";
    ctx.fillRect(0, 0, 768, 192);
    ctx.strokeStyle = "#9c8452";
    ctx.lineWidth = 5;
    ctx.strokeRect(10, 10, 748, 172);
    ctx.fillStyle = "#e3d3a9";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 74px Georgia, serif";
    ctx.fillText(text, 384, 99, 700);
  });
  const surface = new THREE.MeshStandardMaterial({ map, roughness: 0.92 });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), surface);
}
export function tableStatus(text: string) {
  const map = canvasTexture(1024, 160, (ctx) => {
    ctx.fillStyle = "#e6d9bc";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "96px Georgia, serif";
    ctx.fillText(text, 512, 80, 960);
  });
  return new THREE.Mesh(
    new THREE.PlaneGeometry(1.85, 0.25),
    new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      depthWrite: false,
      roughness: 1,
      opacity: 0.85,
    }),
  );
}
export const material = (color: number, roughness = 0.8) =>
  new THREE.MeshStandardMaterial({ color, roughness });
