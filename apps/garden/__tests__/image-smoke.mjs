import assert from "node:assert/strict";
import {
  docker,
  withImageContainer,
} from "../../../scripts/ci/image-container.mjs";
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function smokeGarden(image) {
  const directory = mkdtempSync(join(tmpdir(), "garden-image-smoke-"));
  try {
    chmodSync(directory, 0o755);
    writeFileSync(
      join(directory, "Home.md"),
      '---\npublic: true\n---\n# Garden image fixture\n\n```tsx\nconst fox = "🦊";\n```\n',
    );
    withImageContainer(
      image,
      ["-e", "GARDEN_CONTENT_PATH=/tmp/garden-image-fixture"],
      (id, start) => {
        docker("cp", directory, `${id}:/tmp/garden-image-fixture`);
        start();
        process.stdout.write(
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
          ),
        );
        assert.equal(JSON.parse(docker("inspect", id))[0].State.Running, true);
        console.log("Garden production image default-CMD smoke passed");
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
