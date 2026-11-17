import http from "node:http";
import { createRequestListener } from "remix/node-fetch-server";
import { openArchive } from "./app/database.ts";
import { createArchiveApp } from "./app/router.tsx";
const url = process.env.HARRHY_SLEGGERS_DATABASE_URL;
if (!url) throw new Error("HARRHY_SLEGGERS_DATABASE_URL is required");
const archive = openArchive(url);
try {
  await archive.read();
} catch {
  await archive.close();
  throw new Error("The read-only league database is unavailable");
}
const app = await createArchiveApp(
  archive,
  process.env.HARRHY_SLEGGERS_ASSET_ROOT,
);
const server = http.createServer(
  createRequestListener((request) => app.fetch(request), { trustProxy: false }),
);
server.listen(
  Number(process.env.PORT ?? 18950),
  process.env.HARRHY_SLEGGERS_HOST === "0.0.0.0" ? "0.0.0.0" : "127.0.0.1",
);
function stop() {
  server.close(() => {
    void archive.close();
  });
  server.closeIdleConnections();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
