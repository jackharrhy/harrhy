export const leagues = [
  {
    id: "lil-slug",
    seasonId: "lil-slug-s1",
    name: "Lil Slug Crew",
    season: "Season 1",
    teams: [
      {
        conference: "Mushroom",
        id: "lil-fire",
        name: "Fireballs",
        manager: "Rowan",
        wins: 2,
        losses: 0,
        rd: 5,
        color: "#ad2831",
      },
      {
        conference: "Mushroom",
        id: "lil-shell",
        name: "Shell Club",
        manager: "Alex",
        wins: 1,
        losses: 1,
        rd: -1,
        color: "#176b4a",
      },
      {
        conference: "Mushroom",
        id: "lil-star",
        name: "Star Nine",
        manager: "Sam",
        wins: 0,
        losses: 2,
        rd: -4,
        color: "#785515",
      },
      {
        conference: "Flower",
        id: "lil-garden",
        name: "Garden Party",
        manager: "Jules",
        wins: 1,
        losses: 0,
        rd: 3,
        color: "#8b3c69",
      },
      {
        conference: "Flower",
        id: "lil-barrel",
        name: "Barrel Runners",
        manager: "Morgan",
        wins: 0,
        losses: 1,
        rd: -3,
        color: "#775324",
      },
    ],
  },
  {
    id: "harbor",
    seasonId: "harbor-s1",
    name: "Harbor League",
    season: "Spring season",
    teams: [
      {
        conference: "Harbor",
        id: "harbor-fire",
        name: "Fireballs",
        manager: "Alex",
        wins: 1,
        losses: 0,
        rd: 2,
        color: "#78498e",
      },
      {
        conference: "Harbor",
        id: "harbor-tide",
        name: "The Very Long Named Harbor Tidal Wave Club",
        manager: "Casey",
        wins: 0,
        losses: 1,
        rd: -2,
        color: "#16617b",
      },
    ],
  },
] as const;
export const characters = [
  "Mario",
  "Luigi",
  "Peach",
  "Daisy",
  "Yoshi",
  "Birdo",
  "Donkey Kong",
  "Diddy Kong",
  "Bowser Jr.",
] as const;
export const positions = [
  "P",
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "LF",
  "CF",
  "RF",
] as const;
export interface Slot {
  character: string;
  position: string;
}
export function initialLineup(): Slot[] {
  return characters.map((character, i) => ({
    character,
    position: positions[i]!,
  }));
}
export const frozenAppearances = initialLineup();
export const frozenHomeAppearances: readonly Slot[] = [
  "Wario",
  "Waluigi",
  "Bowser",
  "Koopa Troopa",
  "Toad",
  "Toadette",
  "Magikoopa",
  "Petey Piranha",
  "King Boo",
].map((character, i) => ({ character, position: positions[i]! }));
export const matchFixtures = leagues.map((league, index) => ({
  id: `${league.id}-match-2`,
  leagueId: league.id,
  seasonId: league.seasonId,
  awayTeamId: league.teams[0].id,
  homeTeamId: league.teams[1].id,
  captureId: `${league.id}-sample-export-2`,
  awayScore: index === 0 ? 4 : 3,
  homeScore: index === 0 ? 2 : 1,
  awayAppearances: frozenAppearances.map((slot) => ({ ...slot })),
  homeAppearances: frozenHomeAppearances.map((slot) => ({ ...slot })),
}));
export function lineupError(slots: Slot[], captain: string): string | null {
  if (slots.length !== 9 || new Set(slots.map((s) => s.character)).size !== 9)
    return "Choose nine different characters.";
  if (!slots.some((s) => s.character === captain))
    return "Captain must be in this lineup.";
  if (
    new Set(slots.map((s) => s.position)).size !== 9 ||
    slots.some(
      (s) => !positions.includes(s.position as (typeof positions)[number]),
    )
  )
    return "Assign each defensive position exactly once.";
  return null;
}
export function stat(value: number | null): string {
  return value === null ? "—" : String(value);
}
export function innings(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}
