import assert from "node:assert/strict";
import { test } from "node:test";
import { seed as deck } from "../deck.ts";
import { renderDeck } from "../render.ts";

test("the deck clamps an old shared position without visible navigation or counters", async () => {
  const audience = await renderDeck({
    slides: deck,
    revision: 1,
    position: 99,
    signIn: true,
  });
  assert.match(audience, /data-mode="audience"/);
  assert.ok(audience.includes(`data-position="${deck.length - 1}"`));
  assert.ok(
    audience.includes(
      `<title>@harrhy/slides - ${deck.length}/${deck.length}</title>`,
    ),
  );
  assert.match(audience, /rel="icon"/);
  assert.match(audience, /<h1 id="title-0">example presentation<\/h1>/);
  assert.equal([...audience.matchAll(/<section /g)].length, deck.length);
  assert.ok(audience.includes("the sample deck"));
  assert.match(audience, /class="account"/);
  assert.match(audience, /href="\/auth\/login"/);
  assert.doesNotMatch(
    audience,
    /<header|workshop\.html|>Previous<|>Next<|>\d{2} \/ \d{2}</,
  );
});

test("presenter mode is separate from a read-only signed-in session", async () => {
  const presenter = await renderDeck({
    slides: deck,
    revision: 1,
    presenter: true,
  });
  const readOnly = await renderDeck({
    slides: deck,
    revision: 1,
    signedIn: true,
  });
  assert.match(presenter, /data-mode="presenter"/);
  assert.ok(presenter.includes("Open clicker"));
  assert.ok(!readOnly.includes("Open clicker"));
  assert.match(readOnly, /data-mode="audience"/);
  for (const page of [presenter, readOnly]) {
    assert.match(page, /action="\/auth\/logout"/);
    assert.doesNotMatch(page, /href="\/auth\/login"/);
  }
});

test("rex is a manually triggered video slide", async () => {
  const html = await renderDeck({
    slides: deck,
    revision: 1,
    position: deck.findIndex((slide) => slide.title === "example recording"),
  });
  assert.ok(html.includes('data-action="play-video"'));
  assert.ok(html.includes(">example recording</h2>"));
  assert.ok(!html.match(/<video[^>]*\bautoplay\b/));
});
