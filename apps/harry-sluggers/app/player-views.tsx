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
  "& svg": {
    display: "block",
    width: "100%",
    maxWidth: "780px",
    marginInline: "auto",
  },
  "& svg text": {
    fill: "currentColor",
    fontFamily: "var(--hui-font-ui)",
    fontSize: "12px",
    paintOrder: "stroke",
    stroke: "var(--lab-inset-surface)",
    strokeWidth: 3,
    strokeLinejoin: "round",
  },
  "& svg circle": {
    fill: "var(--lab-inset-surface)",
    stroke: "currentColor",
    strokeWidth: 2,
  },
  "& svg a:hover circle, & svg a:focus-visible circle": {
    fill: "var(--hui-canvas)",
    strokeWidth: 4,
  },
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
export function chemistryView(data: Archive, url: URL, graph: boolean) {
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
  if (!graph)
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
  const requested = url.searchParams.get("character");
  const selected = requested && entries.has(requested) ? requested : names[0]!;
  const kind = url.searchParams.get("relationship");
  const neighbors = [...(relations.get(selected) ?? [])].filter(
    ([name, relation]) =>
      name !== selected &&
      entries.has(name) &&
      ((kind !== "positive" && kind !== "negative") || relation === kind),
  );
  const href = (character: string) =>
    `/players/chemistry-graph?${new URLSearchParams({ character, ...(kind ? { relationship: kind } : {}) })}`;
  const points = neighbors.map(([name, relation], index) => {
    const angle =
      (index / Math.max(neighbors.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      name,
      relation,
      x: 360 + 275 * Math.cos(angle),
      y: 270 + 205 * Math.sin(angle),
    };
  });
  return (
    <div mix={styles}>
      <form method="get">
        <label>
          Character{" "}
          <select name="character" defaultValue={selected}>
            {names.map((name) => (
              <option value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Relationships{" "}
          <select name="relationship" defaultValue={kind ?? ""}>
            <option value="">All</option>
            <option value="positive">Positive</option>
            <option value="negative">Negative</option>
          </select>
        </label>
        <button>Show connections</button>
      </form>
      <p>
        <span data-chem-positive>+ Positive</span> ·{" "}
        <span data-chem-negative>− Negative</span>
      </p>
      {points.length ? (
        <>
          <svg
            viewBox="0 0 720 540"
            aria-label={`Chemistry graph for ${selected}`}
          >
            {points.map(({ x, y, relation }) => (
              <line
                x1="360"
                y1="270"
                x2={x}
                y2={y}
                stroke="currentColor"
                opacity="0.6"
                data-chem-positive={relation === "positive" || undefined}
                data-chem-negative={relation === "negative" || undefined}
                strokeDasharray={relation === "negative" ? "6 4" : undefined}
              />
            ))}
            <circle cx="360" cy="270" r="17" />
            <text x="360" y="303" textAnchor="middle">
              {selected}
            </text>
            {points.map(({ name, relation, x, y }) => (
              <a
                href={href(name)}
                aria-label={`${name}: ${relation} chemistry`}
                data-chem-positive={relation === "positive" || undefined}
                data-chem-negative={relation === "negative" || undefined}
              >
                <circle cx={x} cy={y} r="13" />
                <text x={x} y={y + 4} textAnchor="middle">
                  {relation === "positive" ? "+" : "−"}
                </text>
                <text x={x} y={y + 28} textAnchor="middle">
                  {name}
                </text>
              </a>
            ))}
          </svg>
          <details>
            <summary>Connections for {selected}</summary>
            <ul>
              {neighbors.map(([name, relation]) => (
                <li>
                  <a href={href(name)}>{name}</a> · {relation}
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <p>
          No {kind === "positive" || kind === "negative" ? `${kind} ` : ""}
          connections for {selected}.
        </p>
      )}
    </div>
  );
}
