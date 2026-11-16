import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const image = process.argv[2];
assert.ok(image, "Usage: node apps/garden/__tests__/image-smoke.mjs IMAGE");
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8", timeout: 120_000 });
const directory = mkdtempSync(join(tmpdir(), "garden-image-smoke-"));
let id;
try {
  chmodSync(directory, 0o755);
  writeFileSync(
    join(directory, "Home.md"),
    '---\npublic: true\n---\n# Garden image fixture\n\n```tsx\nconst fox = "🦊";\n```\n',
  );
  id = docker(
    "create",
    "--network",
    "none",
    "-e",
    "GARDEN_CONTENT_PATH=/tmp/garden-image-fixture",
    image,
  ).trim();
  docker("cp", directory, `${id}:/tmp/garden-image-fixture`);
  docker("start", id);
  docker(
    "exec",
    id,
    "node",
    "--input-type=module",
    "-e",
    `
    import assert from 'node:assert/strict';
    let response;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { response = await fetch('http://127.0.0.1:4322/'); break; }
      catch (error) { if (attempt === 59) throw error; await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Garden image fixture/);
    assert.match(html, /hui-highlight github-dark/);
    assert.match(html, /🦊/);
    const entry = await fetch('http://127.0.0.1:4322/assets/app/ui/public/entry.js');
    assert.equal(entry.status, 200);
    console.log('Garden default CMD, synthetic snapshot, syntax highlighting and browser entry passed');
  `,
  );
  assert.equal(JSON.parse(docker("inspect", id))[0].State.Running, true);
  console.log("Garden production image default-CMD smoke passed");
} catch (error) {
  if (id) process.stderr.write(docker("logs", id));
  throw error;
} finally {
  if (id) docker("rm", "-f", id);
  rmSync(directory, { recursive: true, force: true });
}
