import { createServer } from "node:http";
import { createRequestListener } from "remix/node-fetch-server";
import { createApp, defaultHosts } from "./app/router.tsx";

const hosts =
  process.env.UI_HOSTS?.split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean) ?? defaultHosts;
const port = Number(process.env.PORT ?? 18943);
if (
  !Number.isInteger(port) ||
  port < (process.env.UI_DEV_CHILD === "1" ? 0 : 1) ||
  port > 65535
)
  throw new Error("Invalid PORT");
const app = createApp(hosts);
const server = createServer(createRequestListener(app.fetch));
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(port, process.env.HOST ?? "127.0.0.1", () => {
  const address = server.address();
  if (
    process.env.UI_DEV_CHILD === "1" &&
    address &&
    typeof address !== "string"
  )
    process.send?.({ port: address.port });
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close(() => {
      void app.close().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
