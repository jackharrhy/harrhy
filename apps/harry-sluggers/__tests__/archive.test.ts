import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Client } from "pg";
import { createPostgresDatabase } from "remix/data-table/postgres";
import { createArchiveApp } from "../app/router.tsx";
import {
  createArchiveReader,
  positiveId,
  result,
  type Archive,
  type Match,
} from "../app/database.ts";
import { page } from "../app/pages.tsx";
const empty: Archive = {
  teams: [],
  players: [],
  managers: [],
  conferences: [],
  stats: [],
  chemistry: [],
  lineups: [],
  seasons: [],
  turns: [],
  days: [],
  locations: [],
  matches: [],
  appearances: [],
  performances: [],
  events: [],
  picks: [],
  seasonChanges: [],
  matchChanges: [],
  tradeEvents: [],
  trades: [],
  tradePlayers: [],
};
test("unknown scores never manufacture a result; zero is recorded", () => {
  const m: Match = {
    id: 1,
    match_day_id: null,
    order_in_day: null,
    team_a_id: 1,
    team_b_id: 2,
    location_id: null,
    state: "finished",
    scheduled_date: null,
    team_a_score: 0,
    team_b_score: null,
  };
  assert.equal(result(m, 1), null);
  m.team_b_score = 0;
  assert.equal(result(m, 1), "Draw");
  m.team_b_score = 2;
  assert.equal(result(m, 1), "Loss");
  assert.equal(result(m, 2), "Win");
  assert.equal(result(m, 3), null);
  m.state = "live";
  assert.equal(result(m, 1), null);
});
test("match pages read the frozen lineup after a database roster change", async (t) => {
  const fixture = new PGlite();
  t.after(() => fixture.close());
  await fixture.exec(
    await readFile(new URL("./archive-schema.sql", import.meta.url), "utf8"),
  );
  await fixture.exec(`
    INSERT INTO team (id, name, user_id, abbreviation, captain_id) VALUES
      (1, 'Former club', 1, 'OLD', NULL), (2, 'Current club', 2, 'NEW', 1);
    INSERT INTO players (id, name, team_id, sort_position) VALUES (1, 'Transferred player', 1, 1);
    INSERT INTO team_lineup VALUES (1, 'P', 1, true);
    INSERT INTO matches (id, team_a_id, team_b_id, state, team_a_score, team_b_score)
      VALUES (1, 1, 2, 'finished', 0, 1);
    INSERT INTO match_batting_orders VALUES (1, 1, 1, 1, 'P', true);
  `);

  // Remix uses the promise-based pg query(text, values) subset for reads and
  // transactions. PGlite executes that same SQL; it is not a full pg client.
  const client = {
    async query(text: string, values?: unknown[]) {
      const queryResult = await fixture.query(text, values);
      return {
        rows: queryResult.rows,
        rowCount: queryResult.affectedRows ?? null,
      };
    },
  };
  const reader = createArchiveReader(
    createPostgresDatabase(client as unknown as Client),
  );
  const app = await createArchiveApp(reader);
  const currentLineup = new Request("http://league.test/teams/2/lineup");
  const before = await app.fetch(currentLineup);
  assert.equal(before.status, 200);
  assert.doesNotMatch(await before.text(), /Transferred player/);
  await fixture.exec(`
    UPDATE players SET team_id = 2 WHERE id = 1;
    UPDATE team_lineup SET fielding_position = 'C', batting_order = 2, is_starred = false WHERE player_id = 1;
  `);
  const historical = await app.fetch(
    new Request("http://league.test/matches/1/lineup"),
  );
  assert.equal(historical.status, 200);
  const html = await historical.text();
  assert.match(html, /Former club recorded lineup/);
  assert.match(html, /data-result="Loss">0/);
  assert.match(html, /data-result="Win">1/);
  assert.match(html, />P</);
  assert.match(html, />Starred</);
  assert.doesNotMatch(html, /<td>Captain</);
  const current = await app.fetch(currentLineup);
  assert.equal(current.status, 200);
  const currentHtml = await current.text();
  assert.match(currentHtml, /Transferred player/);
  assert.match(currentHtml, />C</);
  assert.equal(
    (await app.fetch(new Request("http://league.test/", { method: "HEAD" })))
      .status,
    200,
  );
});
test("route IDs reject coercion and oversized input", () => {
  for (const input of [
    "0",
    "-1",
    "1 OR 1=1",
    "1.0",
    "01",
    "9999999999",
    undefined,
  ])
    assert.equal(positiveId(input), null);
  assert.equal(positiveId("123"), 123);
});
test("read-only boundary rejects all unsafe methods before reading", async () => {
  let reads = 0;
  const app = await createArchiveApp({
    async read() {
      reads++;
      return empty;
    },
  });
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const r = await app.fetch(
      new Request("http://league.test/draft", { method }),
    );
    assert.equal(r.status, 405);
  }
  assert.equal(reads, 0);
});
test("SSR routes, missing records and theme persistence", async () => {
  const app = await createArchiveApp({
    async read() {
      return empty;
    },
  });
  for (const path of [
    "/",
    "/players",
    "/teams",
    "/matches",
    "/events",
    "/trades",
    "/draft",
  ]) {
    const r = await app.fetch(new Request(`http://league.test${path}`));
    assert.equal(r.status, 200, path);
    const html = await r.text();
    assert.match(html, /Harry Sluggers/);
    assert.match(html, /Broadcast Prism/);
    assert.equal(r.headers.get("cache-control"), "no-store");
  }
  for (const path of [
    "/players/1",
    "/teams/1",
    "/matches/1/stats",
    "/days/1",
    "/players/nope",
  ])
    assert.equal(
      (await app.fetch(new Request(`http://league.test${path}`))).status,
      404,
      path,
    );
  const themed = await app.fetch(
    new Request("http://league.test/?theme=frost-studio"),
  );
  assert.match(
    themed.headers.get("set-cookie")!,
    /sluggers-theme=frost-studio/,
  );
  const saved = await app.fetch(
    new Request("http://league.test/teams", {
      headers: { cookie: "sluggers-theme=frost-studio" },
    }),
  );
  assert.match(await saved.text(), /data-theme="frost-studio"/);
});
test("database failure is generic and private assets cannot traverse", async () => {
  const app = await createArchiveApp({
    async read() {
      throw new Error("postgres://secret:password@private");
    },
  });
  const response = await app.fetch(new Request("http://league.test/"));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret|password|postgres/);
  assert.equal(
    (await app.fetch(new Request("http://league.test/assets/reader.env")))
      .status,
    404,
  );
  assert.equal(
    page(empty, new URL("http://league.test/teams/1/unknown")).status,
    404,
  );
});
