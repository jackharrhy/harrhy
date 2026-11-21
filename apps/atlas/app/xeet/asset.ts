import { build } from "esbuild";

/** Fixed first-party worker only; authored modules never enter this build. */
export async function compileXeetWorker() {
  const result = await build({
    entryPoints: [new URL("./worker.ts", import.meta.url).pathname],
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    target: "es2022",
    sourcemap: false,
    minify: true,
    logLevel: "silent",
  });
  const script = result.outputFiles[0].text;
  if (Buffer.byteLength(script) > 262144) throw new Error("Xeet worker exceeds limit");
  return script;
}
export const xeetWorkerPolicy =
  "default-src 'none'; script-src 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'none'; base-uri 'none'";
