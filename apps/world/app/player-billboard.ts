type Point = { x: number; y: number; z: number };
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
  if (!response.ok)
    throw new Error(`Loading billboard layout: HTTP ${response.status}`);
  return response.json();
}
