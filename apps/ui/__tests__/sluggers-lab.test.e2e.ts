import * as assert from "remix/assert";
import { it } from "remix/test";
import { createTestServer } from "remix/node-fetch-server/test";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app/router.tsx";
import {
  matchResult,
  type LabCorpus,
} from "../app/public/sluggers/lab/model.ts";
import { concepts } from "../app/public/sluggers/lab/concepts/index.ts";
import type { BaseballPosition } from "@harrhy/ui/baseball";
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

function corpus(): LabCorpus {
  const positions: BaseballPosition[] = [
    "P",
    "C",
    "1B",
    "2B",
    "3B",
    "SS",
    "LF",
    "CF",
    "RF",
  ];
  const teams = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    name: `Demo team ${i + 1}`,
    abbreviation: `D${i + 1}`,
    color: null,
    conference: i < 5 ? "North" : "South",
    captainId: i * 12 + 1,
    captainCharacter: null,
    image: null,
  }));
  const players = Array.from({ length: 120 }, (_, i) => ({
    id: i + 1,
    name: `Demo player ${i + 1} with a deliberately long display name`,
    teamId: Math.floor(i / 12) + 1,
    image: null,
    character: `Character ${i + 1}`,
    position: positions[i % 12] ?? null,
    battingOrder: i % 12 < 9 ? (i % 12) + 1 : null,
    starred: i === 0,
    class: "Balanced",
    batting: 5,
    pitching: 5,
    fielding: 5,
    speed: 5,
  }));
  const matches = Array.from({ length: 65 }, (_, i) => ({
    id: i + 1,
    dayId: Math.floor(i / 5) + 1,
    awayId: (i % 5) * 2 + 1,
    homeId: (i % 5) * 2 + 2,
    state: i < 50 ? "finished" : "upcoming",
    awayScore: i < 50 ? 0 : null,
    homeScore: i < 50 ? 12 : null,
    stadium: "Demo stadium",
  }));
  const appearances = matches.slice(0, 50).flatMap((m) =>
    [m.awayId, m.homeId].flatMap((id) =>
      players
        .filter((p) => p.teamId === id && p.position)
        .map((p) => ({
          matchId: m.id,
          teamId: id,
          playerId: p.id,
          battingOrder: p.battingOrder!,
          position: p.position,
          starred: false,
        })),
    ),
  );
  const stats = appearances.slice(0, 360).map((a) => ({
    matchId: a.matchId,
    teamId: a.teamId,
    playerId: a.playerId,
    pa: 3,
    hits: 0,
    hr: 0,
    outs: null,
    rbi: null,
    ipWhole: 0,
    ipPartial: 2,
    strikeouts: 0,
    er: 0,
    putouts: 0,
    assists: 0,
    errors: null,
  }));
  return {
    teams,
    players,
    matches,
    appearances,
    stats,
    days: Array.from({ length: 13 }, (_, i) => ({
      id: i + 1,
      name: `Match day ${i + 1}`,
      sequence: i + 1,
    })),
  };
}
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
it("switches six curated cookoff recipes over the same data, preserves context, and keeps native field markers accessible", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "sluggers-lab-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, "assets"));
  await writeFile(join(directory, "corpus.json"), JSON.stringify(corpus()));
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify({ "team-1.png": { kind: "test" } }),
  );
  await writeFile(join(directory, "assets/team-1.png"), "synthetic-test-file");
  const app = createApp(undefined, {
    sluggersPrivateFonts: false,
    sluggersLab: { enabled: true, directory },
  });
  t.after(() => app.close());
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
  const page = await t.serve(await createTestServer(app.fetch));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const containerWidth of [480, 481]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/sluggers-lab?concept=dugout-frost&screen=lineup");
    await page.waitForFunction(
      () => document.documentElement.dataset.uiReady === "true",
    );
    const field = page.locator("[data-baseball-field-wrapper]");
    await field.evaluate((element, width) => {
      element.style.width = `${width}px`;
      element.style.maxWidth = "none";
    }, containerWidth);
    assert.equal(await field.locator("button:visible").count(), 9);
    assert.equal(
      await field.evaluate((element) => {
        const rects = [...element.querySelectorAll("button")]
          .filter((b) => b.getClientRects().length)
          .map((b) => b.getBoundingClientRect());
        return rects.every(
          (a, i) =>
            a.width >= 44 &&
            a.height >= 44 &&
            rects
              .slice(i + 1)
              .every(
                (b) =>
                  Math.min(a.right, b.right) <= Math.max(a.left, b.left) ||
                  Math.min(a.bottom, b.bottom) <= Math.max(a.top, b.top),
              ),
        );
      }),
      true,
    );
  }
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/sluggers-lab?concept=channel&screen=lineup");
    await page.waitForFunction(
      () => document.documentElement.dataset.uiReady === "true",
    );
    const screens = page.getByRole("navigation", { name: "League screens" });
    const recipes = page.getByRole("navigation", { name: "Design concepts" });
    assert.equal(await recipes.getByRole("button").count(), 6);
    assert.equal(
      await page.locator("[data-sluggers-lab]").getAttribute("data-concept"),
      "broadcast-prism",
      "retired concepts fall back to the curated recommendation",
    );
    for (const concept of concepts) {
      await recipes
        .getByRole("button", { name: concept.name, exact: true })
        .click();
      assert.match(page.url(), new RegExp(`concept=${concept.id}`));
      const backdrop = await page
        .locator("[data-sluggers-lab]")
        .evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            color: style.backgroundColor,
            image: style.backgroundImage,
            size: style.backgroundSize,
            position: style.backgroundPosition,
            animation: style.animationName,
          };
        });
      assert.equal(backdrop.color, "rgb(29, 86, 191)");
      assert.equal((backdrop.image.match(/radial-gradient/g) ?? []).length, 2);
      assert.match(backdrop.size, /112px 112px, 112px 112px/);
      assert.match(backdrop.position, /0px 0px, 56px 56px/);
      assert.equal(backdrop.animation, "none");
      await screens
        .getByRole("button", { name: "Lineup & field", exact: true })
        .click();
      assert.equal(await page.locator("[data-batting-order] li").count(), 9);
      assert.equal(
        await page
          .locator("[data-baseball-field-wrapper] button:visible")
          .count(),
        9,
      );
      assert.equal(await page.locator("[data-roster-card]").count(), 12);
      assert.equal(
        await page
          .locator("[data-baseball-field-wrapper]")
          .evaluate((field) => {
            const rects = [...field.querySelectorAll("button")]
              .filter((button) => button.getClientRects().length > 0)
              .map((button) => button.getBoundingClientRect());
            return (
              rects.every((rect) => rect.width >= 44 && rect.height >= 44) &&
              rects.every((a, index) =>
                rects
                  .slice(index + 1)
                  .every(
                    (b) =>
                      Math.min(a.right, b.right) <= Math.max(a.left, b.left) ||
                      Math.min(a.bottom, b.bottom) <= Math.max(a.top, b.top),
                  ),
              )
            );
          }),
        true,
        `non-overlapping field targets ${concept.id} ${width}`,
      );
      const marker = page
        .locator("[data-baseball-field-wrapper] button:visible")
        .nth(1);
      await marker.focus();
      await page.keyboard.press("Enter");
      assert.equal(await marker.getAttribute("aria-pressed"), "true");
      assert.equal(
        await marker.evaluate((n) => n === document.activeElement),
        true,
      );
      await screens
        .getByRole("button", { name: "Box score", exact: true })
        .click();
      assert.equal(
        await page.locator("[data-baseball-scoreboard] tbody tr").count(),
        2,
      );
      assert.match(
        await page.locator("[data-baseball-scoreboard]").innerText(),
        /—/,
      );
      assert.equal(
        await page
          .locator("[data-baseball-scoreboard]")
          .evaluate(
            (region) =>
              getComputedStyle(region).color ===
              getComputedStyle(region.querySelector("th")!).color,
          ),
        true,
        `scoreboard header inherits ink ${concept.id}`,
      );
      await screens
        .getByRole("button", { name: "Match day", exact: true })
        .click();
      assert.equal(await page.locator("[data-match]").count(), 5);
      assert.equal(
        await page
          .locator("[data-match-score]")
          .first()
          .evaluate((element) => {
            const rects = [...element.children].map((child) => {
              const range = document.createRange();
              range.selectNodeContents(child);
              return range.getBoundingClientRect();
            });
            return (
              rects[0]!.right <= rects[1]!.left &&
              rects[1]!.right <= rects[2]!.left
            );
          }),
        true,
        `aligned two-digit numeric score slots ${concept.id} ${width}`,
      );
      assert.equal(
        await page.locator("[data-match] small[data-result=Win]").count(),
        5,
      );
      assert.equal(
        await page.locator("[data-match] small[data-result=Loss]").count(),
        5,
      );
      await screens
        .getByRole("button", { name: "Player catalogue", exact: true })
        .click();
      assert.equal(await page.locator("[data-roster-card]").count(), 120);
      assert.equal(
        await page
          .locator("[data-roster-card]")
          .first()
          .evaluate((element) => {
            const icon = element
              .querySelector("[data-player-icon]")!
              .getBoundingClientRect();
            return (
              icon.width === 32 &&
              icon.height === 32 &&
              element.getBoundingClientRect().height >= 44
            );
          }),
        true,
        `compact visual icon inside accessible card ${concept.id}`,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${concept.id} ${width}`,
      );
    }
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
  });
  for (const concept of concepts.filter((c) => c.parts.panelSurface)) {
    await page.goto(`/sluggers-lab?concept=${concept.id}&screen=matchday`);
    await page.waitForFunction(
      () => document.documentElement.dataset.uiReady === "true",
    );
    const panel = await page
      .locator("[data-lab-panel]")
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          color: style.backgroundColor,
          image: style.backgroundImage,
          filter: style.backdropFilter,
          diffusion: getComputedStyle(element, "::before").display,
        };
      });
    assert.deepEqual(
      panel,
      {
        color: "rgb(29, 86, 191)",
        image: "none",
        filter: "none",
        diffusion: "none",
      },
      `opaque reduced-transparency fallback ${concept.id}`,
    );
  }
  await cdp.detach();
  assert.deepEqual(errors, []);
});
