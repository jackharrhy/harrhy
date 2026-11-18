import { copyFile, mkdir } from "node:fs/promises";

const source = new URL("../content/", import.meta.url);
const target = new URL("../dist/client/maps/", import.meta.url);
await mkdir(target, { recursive: true });
await copyFile(new URL("hall.bsp", source), new URL("hall.bsp", target));
