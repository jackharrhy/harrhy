import { createCanvas } from "./canvas-view";

export const Canvas = createCanvas(() => import("./client"));
