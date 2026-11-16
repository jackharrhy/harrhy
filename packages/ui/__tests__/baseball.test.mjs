import assert from "node:assert/strict";
import test from "node:test";
import "remix/node-tsx";
import { jsx } from "remix/component/jsx-runtime";
import { renderToStream } from "remix/component/server";
const { BaseballField, BaseballScoreboard, baseballDiamond } =
  await import("../baseball.tsx");
const html = (component, props) =>
  new Response(renderToStream(jsx(component, props))).text();

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test("diamond uses one projected coordinate model for 90-foot bases and 60.5-foot rubber", () => {
  const { home, first, second, third, rubber } = baseballDiamond;

  for (const [a, b] of [
    [home, first],
    [first, second],
    [second, third],
    [third, home],
  ])
    assert.ok(Math.abs(distance(a, b) - 90) < 1e-9);
  assert.equal(distance(home, rubber), 60.5);
  assert.ok(Math.abs(distance(home, second) - 90 * Math.sqrt(2)) < 1e-9);
});

test("field markers use caller names and native optional selection without game assets", async () => {
  const players = [
    { id: "custom-player", name: "Harbor defender", position: "CF" },
  ];
  const staticHtml = await html(BaseballField, {
    label: "Harbor field",
    players,
  });
  assert.match(staticHtml, /Harbor field/);
  assert.match(staticHtml, /Harbor defender/);
  assert.ok(!staticHtml.includes("<button"));
  const interactive = await html(BaseballField, {
    label: "Harbor field",
    selectedId: "custom-player",
    players: [{ ...players[0], detail: "Captain" }],
    onSelect() {},
  });
  assert.match(interactive, /type="button"/);
  assert.match(interactive, /aria-label="CF: Harbor defender · Captain"/);
  assert.match(interactive, /aria-pressed="true"/);
  assert.ok(!interactive.includes("<img"));
});

test("scoreboard keeps unknown innings distinct from zero and trusts explicit totals", async () => {
  const output = await html(BaseballScoreboard, {
    label: "Harbor result",
    innings: ["1", "2"],
    teams: [
      { id: "harbor", name: "Harbor", innings: [0, null], runs: 7, hits: 0 },
    ],
  });
  assert.match(output, /role="region"/);
  assert.match(output, /tabindex="0"/);
  assert.match(output, /<td>0<\/td><td>—<\/td>/);
  assert.match(output, /data-total[^>]*>7<\/td>/);
  assert.match(output, /<th scope="row"/);
});

test("scoreboard rejects short and long inning rows rather than misaligning totals", async () => {
  for (const innings of [[0], [0, null, 2]])
    await assert.rejects(
      html(BaseballScoreboard, {
        label: "Result",
        innings: ["1", "2"],
        teams: [{ id: "one", name: "One", innings, runs: 2 }],
      }),
      /one value.*per inning header/,
    );
});
