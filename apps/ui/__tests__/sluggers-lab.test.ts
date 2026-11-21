import * as assert from "remix/assert";
import { it } from "remix/test";
import { createApp } from "../app/router.tsx";
import { matchResult } from "../app/public/sluggers/lab/model.ts";
import { concepts } from "../app/public/sluggers/lab/concepts/index.ts";
import { createLabFixture } from "./sluggers-lab-fixture.ts";

it("labels only authoritative finished results, including zero and draws", () => {
  const match = {
    id: 1,
    dayId: 1,
    awayId: 1,
    homeId: 2,
    state: "finished",
    awayScore: 0,
    homeScore: 2,
    stadium: null,
  };
  assert.equal(matchResult(match, 1), "Loss");
  assert.equal(matchResult(match, 2), "Win");
  assert.equal(matchResult({ ...match, homeScore: 0 }, 1), "Draw");
  assert.equal(matchResult({ ...match, awayScore: null }, 1), null);
  assert.equal(matchResult({ ...match, state: "upcoming" }, 1), null);
  assert.equal(matchResult({ ...match, state: "live" }, 1), null);
  assert.equal(matchResult(match, 99), null);
});

it("keeps the private cookoff and curated assets unavailable without explicit capability", async (t) => {
  const app = createApp(undefined, {
    sluggersLab: { enabled: false, directory: "/does-not-exist" },
  });
  t.after(() => app.close());
  for (const path of [
    "/sluggers-lab",
    "/__sluggers-lab/assets/team-1.png",
    "/assets/ui/sluggers/lab.server.tsx",
  ])
    assert.equal(
      (await app.fetch(new Request(`http://localhost${path}`))).status,
      404,
    );
});
it("serves only manifest-listed cookoff assets without shared caching", async (t) => {
  const app = await createLabFixture((cleanup) => t.after(cleanup));
  for (const path of [
    "/__sluggers-lab/assets/missing.png",
    "/__sluggers-lab/assets/corpus.json",
    "/__sluggers-lab/assets/player-999.png",
    "/__sluggers-lab/assets/%2e%2e%2fcorpus.json",
  ])
    assert.equal(
      (await app.fetch(new Request(`http://localhost${path}`))).status,
      404,
    );
  const allowed = await app.fetch(
    new Request("http://localhost/__sluggers-lab/assets/team-1.png"),
  );
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("cache-control"), "private, no-store");
  assert.equal(await allowed.text(), "synthetic-test-file");
});

it("renders each curated concept over the requested screen and falls back from retired concepts", async (t) => {
  const app = await createLabFixture((cleanup) => t.after(cleanup));
  async function render(concept: string, screen: string) {
    const response = await app.fetch(
      new Request(
        "http://localhost/sluggers-lab?concept=" +
          concept +
          "&screen=" +
          screen,
      ),
    );
    assert.equal(response.status, 200);
    return response.text();
  }
  const fallback = await render("channel", "lineup");
  assert.match(fallback, /data-concept="broadcast-prism" data-screen="lineup"/);
  for (const { id } of concepts) {
    const html = await render(id, "lineup");
    assert.ok(
      html.includes('data-concept="' + id + '" data-screen="lineup"'),
      id,
    );
    assert.match(html, /data-batting-order/);
    assert.match(html, /Demo player 1 with a deliberately long display name/);
  }
  const scores = await render("broadcast-prism", "boxscore");
  assert.match(scores, /data-baseball-scoreboard/);
  assert.match(scores, /Demo team 1/);
  assert.match(scores, /—/);
  const matchday = await render("broadcast-prism", "matchday");
  assert.equal((matchday.match(/<small data-result="Win">/g) ?? []).length, 5);
  assert.equal((matchday.match(/<small data-result="Loss">/g) ?? []).length, 5);
});
