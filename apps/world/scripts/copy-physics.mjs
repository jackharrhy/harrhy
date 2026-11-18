import { copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const wasm = new URL("box3d.wasm", import.meta.resolve("box3d.js"));
await Promise.all([
  copyFile(wasm, fileURLToPath(new URL("../dist/server/box3d.wasm", import.meta.url))),
  copyFile(wasm, fileURLToPath(new URL("../dist/client/assets/box3d.wasm", import.meta.url))),
]);
