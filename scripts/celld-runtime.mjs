import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const recordUrl = new URL("../celld.json", import.meta.url);

export async function readCelldRuntime(url = recordUrl) {
  const record = JSON.parse(await readFile(url, "utf8"));
  const patterns = {
    image: /^ghcr\.io\/jackharrhy\/celld@sha256:[a-f0-9]{64}$/,
    upstreamVersion: /^\d+\.\d+\.\d+$/,
    upstreamRevision: /^[a-f0-9]{40}$/,
    forkRevision: /^[a-f0-9]{40}$/,
    platform: /^linux\/amd64$/,
    binarySha256: /^[a-f0-9]{64}$/,
  };
  for (const [field, pattern] of Object.entries(patterns)) {
    if (typeof record[field] !== "string" || !pattern.test(record[field])) {
      throw new Error(`Invalid Celld runtime field: ${field}`);
    }
  }
  return record;
}

export async function verifyCelldBinary(
  binaryPath,
  recordUrlOverride = recordUrl,
) {
  const record = await readCelldRuntime(recordUrlOverride);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(binaryPath)) hash.update(chunk);
  const actual = hash.digest("hex");
  if (actual !== record.binarySha256) {
    throw new Error(
      `Celld binary SHA-256 mismatch: expected ${record.binarySha256}, got ${actual}`,
    );
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const [command, binaryPath, ...extra] = process.argv.slice(2);
  if (command === "image" && !binaryPath) {
    console.log((await readCelldRuntime()).image);
  } else if (command === "verify" && binaryPath && extra.length === 0) {
    await verifyCelldBinary(binaryPath);
  } else {
    throw new Error(
      "Usage: node scripts/celld-runtime.mjs image | verify /path/to/celld",
    );
  }
}
