import { it } from "remix/test";
import * as assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyReviewedLinks,
  parseReviewedManifest,
} from "../scripts/link-central-auth.ts";

it("preflights every local ID before applying reviewed subject links", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cms-links-"));
  const first = join(dir, "operator.db"),
    second = join(dir, "site.db");
  for (const path of [first, second]) {
    const database = new DatabaseSync(path);
    database.exec(
      "CREATE TABLE users(id INTEGER PRIMARY KEY, auth_subject TEXT, auth_issuer TEXT); INSERT INTO users(id) VALUES (1)",
    );
    database.close();
  }
  try {
    const targets = [
      { name: "operator", path: first, rows: [{ id: 1, subject: "owner" }] },
      { name: "site", path: second, rows: [{ id: 2, subject: "editor" }] },
    ];
    assert.throws(
      () => applyReviewedLinks(targets, true, "https://issuer.example.test"),
      /Unknown local user ID/,
    );
    const database = new DatabaseSync(first);
    assert.equal(
      database.prepare("SELECT auth_subject FROM users WHERE id=1").get()
        ?.auth_subject,
      null,
    );
    database.close();
    targets[1].rows[0].id = 1;
    assert.deepEqual(
      applyReviewedLinks(targets, false, "https://issuer.example.test"),
      [
        { target: "operator", links: 1 },
        { target: "site", links: 1 },
      ],
    );
    assert.deepEqual(
      applyReviewedLinks(targets, true, "https://issuer.example.test"),
      [
        { target: "operator", links: 1 },
        { target: "site", links: 1 },
      ],
    );
    assert.deepEqual(
      applyReviewedLinks(targets, true, "https://issuer.example.test"),
      [
        { target: "operator", links: 1 },
        { target: "site", links: 1 },
      ],
    );
    assert.throws(
      () =>
        applyReviewedLinks(
          targets,
          true,
          "https://different-issuer.example.test",
        ),
      /another issuer/,
    );
    const linked = new DatabaseSync(first);
    assert.equal(
      linked.prepare("SELECT auth_issuer FROM users WHERE id=1").get()
        ?.auth_issuer,
      "https://issuer.example.test",
    );
    linked.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("links the operator while leaving unreviewed site users unlinked", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cms-operator-link-"));
  const operatorPath = join(dir, "operator.db");
  const sitePath = join(dir, "site.db");
  for (const path of [operatorPath, sitePath]) {
    const database = new DatabaseSync(path);
    database.exec(
      "CREATE TABLE users(id INTEGER PRIMARY KEY, auth_subject TEXT, auth_issuer TEXT); INSERT INTO users(id) VALUES (1)",
    );
    database.close();
  }
  try {
    const reviewed = parseReviewedManifest({
      issuer: "https://issuer.example.test",
      operator: [{ id: 1, subject: "owner" }],
      sites: { andrew: [], luke: [] },
    });
    assert.throws(
      () =>
        parseReviewedManifest({
          issuer: "https://issuer.example.test",
          operator: [],
          sites: { andrew: [] },
        }),
      /operator link is required/,
    );
    assert.deepEqual(
      applyReviewedLinks(
        [
          { name: "operator", path: operatorPath, rows: reviewed.operator },
          { name: "andrew", path: sitePath, rows: reviewed.sites.andrew },
        ],
        true,
        reviewed.issuer,
      ),
      [
        { target: "operator", links: 1 },
        { target: "andrew", links: 0 },
      ],
    );
    const site = new DatabaseSync(sitePath);
    assert.equal(
      site.prepare("SELECT auth_subject FROM users WHERE id=1").get()
        ?.auth_subject,
      null,
    );
    site.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
