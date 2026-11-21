import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

export async function startDoodleGallery() {
  const directory = await mkdtemp(tmpdir() + "/auth-gallery-");
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL("../../tools/doodle-gallery/server.mjs", import.meta.url),
      ),
    ],
    {
      env: {
        ...process.env,
        GALLERY_HOST: "127.0.0.1",
        GALLERY_PORT: String(port),
        GALLERY_POOL_FILE: directory + "/pool.json",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const exited = once(server, "exit");
  async function close() {
    server.kill("SIGTERM");
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
  try {
    await Promise.race([
      once(server.stdout, "data"),
      exited.then(([code]) => {
        throw new Error(`Doodle gallery exited before startup (${code})`);
      }),
    ]);
    return { origin, poolFile: directory + "/pool.json", close };
  } catch (error) {
    await close();
    throw error;
  }
}
