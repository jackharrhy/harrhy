import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app/router.tsx";
import type { LabCorpus } from "../app/public/sluggers/lab/model.ts";
import type { BaseballPosition } from "@harrhy/ui/baseball";

export async function createLabFixture(
  after: (cleanup: () => Promise<void>) => void,
) {
  const directory = await mkdtemp(join(tmpdir(), "sluggers-lab-test-"));
  after(() => rm(directory, { recursive: true, force: true }));
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
  after(() => app.close());
  return app;
}

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
