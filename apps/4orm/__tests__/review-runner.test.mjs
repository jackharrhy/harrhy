import { test, expect } from "vitest";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

for (const runner of [
  "scripts/review.mjs",
  "__tests__/push-celld.mjs",
  "__tests__/orphan-celld.mjs",
  "__tests__/celld-smoke.mjs",
  "__tests__/chat-copy-acceptance.mjs",
  "__tests__/enrollment-https-cohort.mjs",
  "__tests__/media-archive-roundtrip.mjs",
]) {
  test(`${runner} rejects a mismatched binary before state or evidence writes`, async () => {
    const scratch = await mkdtemp(join(tmpdir(), "fourm-binary-identity-"));
    const binary = join(scratch, "celld");
    await writeFile(binary, "not the canonical executable");
    try {
      const child = spawn(process.execPath, [`apps/4orm/${runner}`], {
        cwd: resolve("../.."),
        env: {
          PATH: process.env.PATH,
          HOME: scratch,
          TMPDIR: scratch,
          CELLD_BIN: binary,
          FOURM_REVIEW_STATE: join(scratch, "state"),
          FOURM_REVIEW_PORT: "19871",
          FOURM_REVIEW_ISSUER_PORT: "19872",
          FOURM_REVIEW_PROVIDER_PORT: "19873",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (output += chunk));
      const code = await new Promise((accept, reject) => {
        child.once("exit", accept);
        child.once("error", reject);
      });
      expect(code).not.toBe(0);
      expect(output).toContain("Celld binary SHA-256 mismatch");
      expect(await readdir(scratch)).toEqual(["celld"]);
    } finally {
      await rm(scratch, { recursive: true });
    }
  });
}

test("an occupied listener cannot produce a false running receipt or overwrite the current owner's receipt", async () => {
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const occupied = listener.address().port;
  const state = await mkdtemp(join(tmpdir(), "fourm-occupied-review-"));
  const receipt = JSON.stringify({ status: "RUNNING", supervisorPid: 12345 });
  await writeFile(join(state, "runtime.json"), receipt);
  try {
    const child = spawn(process.execPath, ["scripts/review.mjs"], {
      env: {
        ...process.env,
        CELLD_BIN: "/not-invoked",
        FOURM_REVIEW_STATE: state,
        FOURM_REVIEW_PORT: String(occupied),
        FOURM_REVIEW_ISSUER_PORT: String(occupied === 18998 ? 18997 : 18998),
        FOURM_REVIEW_PROVIDER_PORT: String(occupied === 18999 ? 18996 : 18999),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    const code = await new Promise((resolve, reject) => {
      child.once("exit", resolve);
      child.once("error", reject);
    });
    expect(code).not.toBe(0);
    expect(output).toContain(`Review port ${occupied} is already occupied`);
    expect(output).not.toContain('"status":"RUNNING"');
    expect(await readFile(join(state, "runtime.json"), "utf8")).toBe(receipt);
  } finally {
    await new Promise((resolve) => listener.close(resolve));
    await rm(state, { recursive: true });
  }
});
