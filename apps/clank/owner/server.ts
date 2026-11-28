import { familiarId, createDocumentServer } from "./document.tsx";
import { readSnapshot } from "./snapshot.ts";
import { createPreview } from "./preview.ts";

function port(key: string, fallback?: number) {
  const value = Number(process.env[key] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535)
    throw Error(`Invalid ${key}`);
  return value;
}

const origin = process.env.HARRHY_CLANK_OWNER_ORIGIN;
if (!origin) throw Error("HARRHY_CLANK_OWNER_ORIGIN is required");
const url = new URL(origin);
if (
  url.origin !== origin ||
  url.protocol !== "https:" ||
  !/^[a-z0-9.-]+(?::[0-9]+)?$/.test(url.host)
)
  throw Error("HARRHY_CLANK_OWNER_ORIGIN must be a canonical HTTPS origin");
const listen = port("HARRHY_CLANK_PORT", 21975);
const pi = port("HARRHY_CLANK_PI_PORT");
if (listen === pi) throw Error("Clank and Pi must use different ports");
createPreview(pi, url.host, createDocumentServer(url.host), (req, signal) =>
  readSnapshot(pi, url.host, req, familiarId, signal),
).listen(listen, "127.0.0.1", () => {
  console.log(`Clank preview listening at 127.0.0.1:${listen}`);
});
