import { spawn } from "node:child_process";
import { verifyCelldBinary } from "../../scripts/celld-runtime.mjs";

const binary = process.env.HARRHY_REVIEW_CELLD_BIN;
if (!binary?.startsWith("/"))
  throw new Error(
    "Set HARRHY_REVIEW_CELLD_BIN to the absolute path of the qualified binary",
  );
await verifyCelldBinary(binary);
const child = spawn(
  binary,
  ["dev", "--host", "127.0.0.1", "--port", "9867", "--no-watch"],
  { stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = signal === "SIGINT" ? 130 : (code ?? 1);
});
