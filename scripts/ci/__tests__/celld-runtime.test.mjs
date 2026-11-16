import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readCelldRuntime, verifyCelldBinary } from "../../celld-runtime.mjs";

test("Celld runtime record validates immutable identity and verifies binary content", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "celld-runtime-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const binary = join(directory, "celld");
  const recordPath = join(directory, "celld.json");
  const contents = "disposable test fixture, not a Celld artifact";
  const record = {
    image: `ghcr.io/jackharrhy/celld@sha256:${"a".repeat(64)}`,
    upstreamVersion: "0.6.3",
    upstreamRevision: "b".repeat(40),
    forkRevision: "c".repeat(40),
    platform: "linux/amd64",
    binarySha256: createHash("sha256").update(contents).digest("hex"),
  };
  await writeFile(binary, contents);
  await writeFile(recordPath, JSON.stringify(record));
  assert.deepEqual(await readCelldRuntime(recordPath), record);
  await verifyCelldBinary(binary, recordPath);
  await writeFile(binary, "different executable");
  await assert.rejects(
    verifyCelldBinary(binary, recordPath),
    /SHA-256 mismatch/,
  );

  for (const [field, value] of Object.entries({
    image: "ghcr.io/jackharrhy/celld:latest",
    upstreamVersion: null,
    upstreamRevision: "short",
    forkRevision: undefined,
    platform: "linux/arm64",
    binarySha256: "not-a-hash",
  })) {
    await writeFile(recordPath, JSON.stringify({ ...record, [field]: value }));
    await assert.rejects(
      readCelldRuntime(recordPath),
      new RegExp(`Invalid Celld runtime field: ${field}`),
    );
  }
});
