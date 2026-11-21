import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

/** Only the fixed first-party browser entry; never an external path or authored module. */
export async function compileComments() {
  const result = await build({
    entryPoints: [new URL("./entry.tsx", import.meta.url).pathname],
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    target: "es2024",
    jsx: "automatic",
    jsxImportSource: "remix/component",
    sourcemap: false,
    minify: true,
    legalComments: "none",
    banner: {
      js: `/*\n${await readFile(new URL("../../LICENSES/Hypothesis.txt", import.meta.url), "utf8")}\n*/`,
    },
    logLevel: "silent",
  });
  const script = result.outputFiles[0].text;
  if (Buffer.byteLength(script) > 1048576) throw new Error("Comments bundle exceeds limit");
  return { script, digest: createHash("sha256").update(script).digest("hex") };
}
