// Standalone source launcher. Unlike the developer CLI, it does not mint a sign-in token.
import { isAbsolute } from "node:path";
import { startServer } from "../src/hosts/server.ts";
import { configureFetch } from "../src/runtime/fetch.ts";

const dataDir = process.env.P2_DATA_DIR;
if (!dataDir || !isAbsolute(dataDir)) throw new Error("Set P2_DATA_DIR to an absolute path");
process.umask(0o077);
configureFetch();

const server = await startServer({ dataDir, dev: false });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
console.log(`p2: listening on 127.0.0.1:${server.port}`);

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 8_000);
  void server.close().then(
    () => {
      clearTimeout(timeout);
      process.exit(0);
    },
    (error) => {
      console.error("p2: close failed", error);
      process.exit(1);
    },
  );
}
