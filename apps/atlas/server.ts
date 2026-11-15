import http from "node:http";
import { createRequestListener } from "remix/node-fetch-server";
import { createAtlas } from "./app/router.tsx";

const root =
  process.env.HARRHY_ATLAS_CONTENT_ROOT ?? process.env.ATLAS_CONTENT_ROOT;
if (!root)
  throw new Error(
    "Set ATLAS_CONTENT_ROOT to an external curated content directory",
  );
const manifest = process.env.HARRHY_ATLAS_MANIFEST;
if (!manifest)
  throw new Error(
    "Set HARRHY_ATLAS_MANIFEST to an absolute trusted registry file",
  );
const atlas = await createAtlas(root, manifest);
const stopWatching = atlas.catalog.watch();
const server = http.createServer(
  createRequestListener(
    async (request) => {
      try {
        return await atlas.router.fetch(request);
      } catch {
        return new Response("Internal Server Error", { status: 500 });
      }
    },
    { trustProxy: false },
  ),
);
const port = Number(process.env.PORT || 4336);
server.listen(port, "127.0.0.1", () =>
  console.log(`Atlas private preview: http://127.0.0.1:${port}`),
);
function shutdown() {
  stopWatching();
  server.closeAllConnections();
  server.close();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
