import { css } from "remix/component";
import type { Archive } from "./database.ts";

const styles = css({
  "& [data-chem-scroll]": { overflow: "auto", maxHeight: "65vh" },
  "& table": { borderCollapse: "separate", borderSpacing: 0 },
  "& th, & td": { textAlign: "center" },
  "& thead th": { position: "sticky", top: 0, zIndex: 1 },
  "& tbody th": { position: "sticky", left: 0 },
  "& [data-chem-positive]": { color: "var(--hui-success)" },
  "& [data-chem-negative]": { color: "var(--hui-danger)" },
});
export const playerViews = [
  ["/players", "Leaderboard"],
  ["/players/grid", "Grid View"],
  ["/players/chemistry", "Chemistry Table"],
  ["/players/chemistry-graph", "Chemistry Graph"],
] as const;
export function playerViewNav(path: string) {
  return (
    <nav aria-label="Player views">
      {playerViews.map(([href, label]) => (
        <a
          href={href}
          aria-current={path === href ? "page" : undefined}
          mix={css({ textDecoration: path === href ? "underline" : "none" })}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
export function leaderboard(data: Archive, url: URL) {
  const columns = [
    ["games", "Games"],
    ["pa", "PA"],
    ["hits", "H"],
    ["hr", "HR"],
    ["rbi", "RBI"],
    ["rate", "Hit %"],
    ["k", "K"],
  ] as const;
  const sort =
    columns.find(([name]) => name === url.searchParams.get("sort"))?.[0] ??
    "hits";
  const rows = data.players
    .map((player) => {
      const records = data.performances.filter(
        (row) => row.player_id === player.id,
      );
      const sum = (
        field:
          | "plate_appearances"
          | "hits"
          | "home_runs"
          | "rbi"
          | "strikeouts",
      ) =>
        records.length && records.every((row) => row[field] !== null)
          ? records.reduce((total, row) => total + (row[field] ?? 0), 0)
          : null;
      const pa = sum("plate_appearances"),
        hits = sum("hits");
      return {
        player,
        games: new Set(records.map((row) => row.match_id)).size,
        pa,
        hits,
        hr: sum("home_runs"),
        rbi: sum("rbi"),
        rate: pa && hits !== null ? (hits / pa) * 100 : null,
        k: sum("strikeouts"),
      };
    })
    .filter((row) => row.games > 0)
    .toSorted(
      (a, b) =>
        (b[sort] ?? -1) - (a[sort] ?? -1) ||
        a.player.name.localeCompare(b.player.name),
    );
  return (
    <div data-scroll tabIndex={0} role="region" aria-label="Leaderboard">
      <table>
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">Team</th>
            {columns.map(([key, label]) => (
              <th
                scope="col"
                aria-sort={key === sort ? "descending" : undefined}
              >
                <a href={`/players?sort=${key}`}>{label}</a>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr>
              <th scope="row">
                <a href={`/players/${row.player.id}`}>{row.player.name}</a>
              </th>
              <td>
                {data.teams.find((team) => team.id === row.player.team_id)
                  ?.abbreviation ?? "—"}
              </td>
              {columns.map(([key]) => (
                <td>
                  {key === "rate"
                    ? (row.rate?.toFixed(1) ?? "—")
                    : (row[key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p>No player statistics recorded.</p>}
    </div>
  );
}
const mark = (relation: string | undefined) =>
  relation === "positive" ? (
    <span data-chem-positive title="Positive chemistry">
      +
    </span>
  ) : relation === "negative" ? (
    <span data-chem-negative title="Negative chemistry">
      −
    </span>
  ) : (
    "·"
  );
export function chemistryView(data: Archive) {
  const entries = new Map<string, number>();
  for (const player of data.players.toSorted(
    (a, b) => a.sort_position - b.sort_position,
  ))
    if (player.stats_character && !entries.has(player.stats_character))
      entries.set(player.stats_character, player.id);
  for (const stat of data.stats)
    if (!entries.has(stat.character)) entries.set(stat.character, 0);
  const names = [...entries.keys()];
  const relations = new Map<string, Map<string, string>>();
  for (const { character1, character2, relationship } of data.chemistry) {
    if (!relations.has(character1)) relations.set(character1, new Map());
    if (!relations.has(character2)) relations.set(character2, new Map());
    relations.get(character1)?.set(character2, relationship);
    relations.get(character2)?.set(character1, relationship);
  }
  if (!names.length) return <p>No chemistry records.</p>;
  return (
    <div mix={styles}>
      <p>
        <span data-chem-positive>+ Positive</span> ·{" "}
        <span data-chem-negative>− Negative</span>
      </p>
      <div
        data-chem-scroll
        tabIndex={0}
        role="region"
        aria-label="Chemistry matrix"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Character</th>
              {names.map((name) => (
                <th scope="col">{name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {names.map((name) => (
              <tr>
                <th scope="row">
                  {entries.get(name) ? (
                    <a href={`/players/${entries.get(name)}`}>{name}</a>
                  ) : (
                    name
                  )}
                </th>
                {names.map((other) => (
                  <td>{mark(relations.get(name)?.get(other))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function forceGraph(data: Archive, assets: ReadonlySet<string>) {
  const icons = Object.fromEntries(
    data.players.flatMap((player) => {
      const asset = [
        `player-side-${player.id}.png`,
        `player-${player.id}.png`,
      ].find((name) => assets.has(name));
      return player.stats_character && asset
        ? [[player.stats_character, `/assets/${asset}`]]
        : [];
    }),
  );
  const edges = data.chemistry.filter(
    (edge) =>
      edge.relationship === "positive" || edge.relationship === "negative",
  );
  return (
    <div
      data-force-graph={JSON.stringify({ edges, icons })}
      mix={css({
        flex: 1,
        minHeight: "220px",
        position: "relative",
        overflow: "hidden",
        cursor: "grab",
      })}
    >
      <noscript>Enable JavaScript to use the chemistry graph.</noscript>
    </div>
  );
}
