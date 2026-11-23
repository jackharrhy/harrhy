import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { readCelldRuntime } from "../../celld-runtime.mjs";

const apps = ["ref", "radio", "worldview", "maps-collaboration", "world"];

test("all Celld container defaults and provenance labels use the canonical artifact", async () => {
  const record = await readCelldRuntime();
  for (const app of apps) {
    const source = await readFile(
      new URL(`../../../apps/${app}/Dockerfile`, import.meta.url),
      "utf8",
    );
    const defaults = [...source.matchAll(/^ARG CELLD_IMAGE=(.*)$/gm)];
    assert.equal(defaults.length, 1, `${app}: exactly one Celld default`);
    assert.equal(
      defaults[0][1],
      record.image,
      `${app}: canonical immutable image`,
    );
    assert.match(
      source,
      new RegExp(
        `LABEL dev\\.jackharrhy\\.${app}\\.celld-image=\\$\\{?CELLD_IMAGE\\}?`,
      ),
      `${app}: provenance label`,
    );
  }
});
