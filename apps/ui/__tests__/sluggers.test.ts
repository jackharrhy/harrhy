import * as assert from "remix/assert";
import { it } from "remix/test";
import {
  frozenAppearances,
  initialLineup,
  leagues,
  matchFixtures,
  lineupError,
  stat,
  innings,
} from "../app/public/sluggers/fixtures.ts";

it("keeps overlapping names tenant-local and standings arithmetic balanced", () => {
  assert.equal(leagues[0].teams[0].name, leagues[1].teams[0].name);
  assert.notEqual(leagues[0].teams[0].id, leagues[1].teams[0].id);
  for (const match of matchFixtures) {
    const league = leagues.find((l) => l.id === match.leagueId)!;
    assert.equal(match.seasonId, league.seasonId);
    assert.ok(league.teams.some((t) => t.id === match.awayTeamId));
    assert.ok(league.teams.some((t) => t.id === match.homeTeamId));
  }
  assert.notEqual(matchFixtures[0]!.captureId, matchFixtures[1]!.captureId);
  assert.notEqual(
    matchFixtures[0]!.awayAppearances,
    matchFixtures[1]!.awayAppearances,
  );
  for (const league of leagues) {
    assert.equal(
      league.teams.reduce((n, t) => n + t.wins - t.losses, 0),
      0,
    );
    assert.equal(
      league.teams.reduce((n, t) => n + t.rd, 0),
      0,
    );
  }
});
it("rejects duplicate defensive assignments without rewriting frozen appearances", () => {
  const lineup = initialLineup();
  assert.equal(lineupError(lineup, "Mario"), null);
  lineup[1]!.position = "P";
  assert.equal(
    lineupError(lineup, "Mario"),
    "Assign each defensive position exactly once.",
  );
  assert.equal(frozenAppearances[1]!.position, "C");
});
it("distinguishes missing totals from zero and converts outs rather than decimals", () => {
  assert.equal(stat(null), "—");
  assert.equal(stat(0), "0");
  assert.equal(innings(14), "4.2");
  assert.equal(innings(15), "5.0");
});
