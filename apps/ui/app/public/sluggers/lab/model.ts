import type { BaseballPosition } from "@harrhy/ui/baseball";
interface LabTeam {
  id: number;
  name: string;
  abbreviation: string;
  color: string | null;
  conference: string | null;
  captainId: number | null;
  captainCharacter: string | null;
  image?: string | null;
}
export interface LabPlayer {
  id: number;
  name: string;
  teamId: number | null;
  image: string | null;
  character: string | null;
  position: BaseballPosition | null;
  battingOrder: number | null;
  starred: boolean;
  class: string | null;
  batting: number | null;
  pitching: number | null;
  fielding: number | null;
  speed: number | null;
}
export interface LabMatch {
  id: number;
  dayId: number;
  awayId: number;
  homeId: number;
  state: string;
  awayScore: number | null;
  homeScore: number | null;
  stadium: string | null;
}
interface LabStats {
  matchId: number;
  teamId: number;
  playerId: number;
  pa: number | null;
  hits: number | null;
  hr: number | null;
  outs: number | null;
  rbi: number | null;
  ipWhole: number | null;
  ipPartial: number | null;
  strikeouts: number | null;
  er: number | null;
  putouts: number | null;
  assists: number | null;
  errors: number | null;
}
interface LabAppearance {
  matchId: number;
  teamId: number;
  playerId: number;
  battingOrder: number;
  position: BaseballPosition | null;
  starred: boolean;
}
export interface LabCorpus {
  teams: LabTeam[];
  players: LabPlayer[];
  days: { id: number; name: string | null; sequence: number | null }[];
  matches: LabMatch[];
  appearances: LabAppearance[];
  stats: LabStats[];
}
export type LabScreen = "matchday" | "boxscore" | "lineup" | "players";
export const labScreens: { id: LabScreen; label: string }[] = [
  { id: "matchday", label: "Match day" },
  { id: "boxscore", label: "Box score" },
  { id: "lineup", label: "Lineup & field" },
  { id: "players", label: "Player catalogue" },
];
export function standings(corpus: LabCorpus) {
  return corpus.teams
    .map((team) => {
      let wins = 0,
        losses = 0,
        forRuns = 0,
        against = 0;
      for (const m of corpus.matches) {
        if (
          m.state !== "finished" ||
          m.awayScore === null ||
          m.homeScore === null ||
          (m.awayId !== team.id && m.homeId !== team.id)
        )
          continue;
        const a = m.awayId === team.id ? m.awayScore : m.homeScore;
        const b = m.awayId === team.id ? m.homeScore : m.awayScore;
        wins += Number(a > b);
        losses += Number(a < b);
        forRuns += a;
        against += b;
      }
      return { ...team, wins, losses, difference: forRuns - against };
    })
    .toSorted((a, b) => b.wins - a.wins || b.difference - a.difference);
}
export function recordedTotal(values: (number | null | undefined)[]) {
  return values.length && values.every((n) => n != null)
    ? values.reduce<number>((a, b) => a + (b ?? 0), 0)
    : null;
}
