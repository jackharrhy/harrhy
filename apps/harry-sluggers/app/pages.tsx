import { css, type RemixNode } from "remix/component";
import { themeRoot, themeStyles } from "@harrhy/ui/theme";
import {
  BaseballField,
  baseballFieldStyles,
  type BaseballPosition,
} from "@harrhy/ui/baseball";
import { concepts } from "./themes/index.ts";
import { labPartStyles } from "./themes/types.ts";
import { originalBackdrop } from "./original.ts";
import { positiveId, result, type Archive, type Match } from "./database.ts";

const styles = css({
  fontFamily: "var(--hui-font-ui)",
  color: "var(--hui-ink)",
  minHeight: "100dvh",
  lineHeight: 1.5,
  "& *": { boxSizing: "border-box" },
  "& body": { margin: 0 },
  "& a": { color: "inherit", textUnderlineOffset: ".2em" },
  "& a:hover": { color: "var(--hui-accent)" },
  "& :focus-visible": {
    outline: "3px solid var(--hui-accent)",
    outlineOffset: "3px",
  },
  "& ::selection": {
    background: "var(--lab-inset-surface)",
    color: "var(--hui-ink)",
  },
  "& header, & main, & footer": {
    maxWidth: "1280px",
    margin: "auto",
    padding: "20px",
  },
  "& header": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "20px",
    borderBottom: "1px solid var(--hui-border)",
  },
  "& nav": { display: "flex", flexWrap: "wrap", gap: "16px" },
  "& nav a, & button, & select": {
    minHeight: "44px",
    display: "inline-flex",
    alignItems: "center",
  },
  "& select, & button, & input": {
    background: "var(--lab-inset-surface)",
    color: "var(--hui-ink)",
    border: "1px solid var(--hui-control-border)",
    borderRadius: "6px",
    padding: "10px",
    font: "inherit",
    maxWidth: "100%",
  },
  "& form label": { display: "grid", minWidth: 0, maxWidth: "100%" },
  "& input": { width: "100%", minWidth: 0 },
  "& form": {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
  },
  "& h1, & h2, & h3, & [data-brand]": {
    fontFamily: "var(--hui-font-display)",
    lineHeight: 1.25,
    textWrap: "balance",
  },
  "& h1": { fontSize: "clamp(28px,4vw,46px)", margin: "16px 0 24px" },
  "& h2": { fontSize: "22px", margin: "0 0 16px" },
  "& p": { maxWidth: "72ch" },
  "& [data-brand]": {
    fontSize: "22px",
    textDecoration: "none",
    marginRight: "auto",
  },
  "& [data-columns]": {
    display: "grid",
    gridTemplateColumns: "minmax(0,1.5fr) minmax(300px,1fr)",
    gap: "24px",
    alignItems: "start",
  },
  "& [data-lab-panel]": {
    position: "relative",
    isolation: "isolate",
    background: "var(--lab-panel-surface)",
    backgroundImage: "var(--lab-panel-image)",
    border: "2px solid var(--lab-surface-edge)",
    borderRadius: "var(--hui-panel-radius)",
    padding: "16px",
    marginBottom: "24px",
    minWidth: 0,
    overflow: "hidden",
  },
  "& [data-lab-panel]::before": {
    content: '""',
    position: "absolute",
    inset: "0 0 auto",
    height: "96px",
    zIndex: -1,
    pointerEvents: "none",
    backdropFilter: "var(--lab-panel-filter)",
    maskImage: "linear-gradient(black,transparent)",
  },
  "@supports not (backdrop-filter: blur(1px))": {
    "& [data-lab-panel]": { backgroundColor: "var(--lab-solid-surface)" },
  },
  "@media (prefers-reduced-transparency: reduce)": {
    "& [data-lab-panel]": { backgroundColor: "var(--lab-solid-surface)" },
    "& [data-lab-panel]::before": { display: "none" },
  },
  "& [data-panel-title]": {
    backgroundImage: "var(--lab-heading-image)",
    color: "var(--lab-heading-ink)",
    margin: "-16px -16px 16px",
    padding: "12px 16px",
  },
  "& [data-roster-grid]": {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill,minmax(132px,1fr))",
    gap: "12px",
  },
  "& [data-roster-card]": {
    display: "grid",
    gridTemplateRows: "auto 1fr auto",
    alignContent: "start",
    padding: "12px",
    background: "var(--lab-card-surface)",
    border: "1px solid var(--lab-surface-edge)",
    borderRadius: "var(--lab-card-radius)",
    overflowWrap: "anywhere",
  },
  "& [data-roster-card] img": {
    width: "56px",
    height: "56px",
    objectFit: "contain",
  },
  "& [data-portrait]": {
    display: "inline-grid",
    placeItems: "center",
    position: "relative",
    width: "56px",
    height: "56px",
    borderRadius: "4px",
    flexShrink: 0,
  },
  "& [data-portrait] img": {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },
  "& [data-roster-card] h3": { margin: "6px 0 3px", fontSize: "15px" },
  "& [data-catalogue-grid]": {
    gridTemplateColumns: "repeat(auto-fill,minmax(132px,144px))",
    gap: "16px",
  },
  "& [data-roster-grid] [data-player-card]": {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minHeight: "92px",
    textAlign: "center",
    justifyContent: "center",
    padding: "16px 8px",
    gap: "8px",
    borderWidth: "2px",
    textDecoration: "none",
  },
  "& [data-roster-grid] [data-player-card]:hover": {
    background:
      "color-mix(in srgb, var(--lab-card-surface) 85%, var(--lab-solid-surface))",
    color: "var(--hui-ink)",
  },
  "& [data-player-card] [data-portrait]": { width: "32px", height: "32px" },
  "& [data-player-card] [data-portrait] img": {
    display: "block",
    minWidth: 0,
    minHeight: 0,
  },
  "& [data-player-name]": { fontSize: "12px", lineHeight: 1.25 },
  "& [data-player-team]": {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    position: "absolute",
    top: "4px",
    right: "6px",
    transform: "rotate(8deg)",
    color: "var(--hui-muted)",
    fontSize: "10px",
    lineHeight: 1,
  },
  "& [data-player-card] [data-player-team] [data-portrait]": {
    width: "16px",
    height: "16px",
  },
  "& [data-portrait-lockup]": { display: "inline-grid", position: "relative" },
  "& [data-player-mark]": {
    position: "absolute",
    display: "grid",
    placeItems: "center",
    width: "14px",
    height: "14px",
    top: "-4px",
    fontSize: "10px",
    fontWeight: 700,
    borderRadius: "50%",
    pointerEvents: "none",
  },
  "& [data-player-mark=captain]": {
    left: "-4px",
    background: "#f0446466",
    color: "var(--hui-ink)",
  },
  "& [data-player-mark=star]": {
    right: "-4px",
    background: "#ffd94933",
    color: "var(--hui-accent)",
  },
  "& [data-player-mark] svg": {
    width: "11px",
    height: "11px",
    fill: "currentColor",
  },
  "& [data-team-side]": {
    display: "flex",
    flexDirection: "column",
    alignItems: "end",
    textAlign: "right",
    overflowWrap: "anywhere",
    gap: "4px",
    fontWeight: 700,
  },
  "& [data-team-side]:last-child": { alignItems: "start", textAlign: "left" },
  "& [data-team-identity]": {
    display: "inline-flex",
    gap: "8px",
    alignItems: "center",
  },
  "& [data-team-identity] [data-portrait], & [data-lineup-player] [data-portrait]":
    { width: "30px", height: "30px" },
  "& [data-lineup-player]": {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
  },
  "& [data-result-label]": {
    padding: "2px 6px",
    borderRadius: "4px",
    fontSize: "12px",
  },
  "& [data-result=Win], & [data-win]": {
    color: "var(--hui-success)",
  },
  "& [data-result=Loss], & [data-loss]": {
    color: "var(--hui-danger)",
  },
  "& [data-result=Draw]": { color: "var(--hui-accent)" },
  "& [data-score] a": {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: "3px",
    background: "var(--lab-inset-surface)",
    borderRadius: "4px",
    textDecoration: "none",
  },
  "& [data-score] a span": { borderRadius: "4px" },
  "& [data-win], & [data-loss]": {
    display: "inline-block",
    minWidth: "2ch",
    textAlign: "center",
    borderRadius: "3px",
    padding: "2px 5px",
  },
  "& [data-match]": {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) 104px minmax(0,1fr)",
    gap: "12px",
    alignItems: "center",
    borderBottom: "1px solid var(--lab-surface-edge)",
    padding: "16px 0",
  },
  "& [data-score]": {
    fontFamily: "var(--hui-font-display)",
    fontSize: "24px",
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  "& [data-scroll]": {
    overflowX: "auto",
    scrollbarColor: "var(--hui-control-border) var(--lab-inset-surface)",
  },
  "& table": {
    borderCollapse: "collapse",
    width: "100%",
    fontVariantNumeric: "tabular-nums",
  },
  "& th, & td": {
    padding: "10px",
    textAlign: "left",
    borderBottom: "1px solid var(--lab-surface-edge)",
    whiteSpace: "nowrap",
  },
  "& th": { background: "var(--lab-inset-surface)" },
  "& [data-muted]": { color: "var(--hui-muted)", fontSize: "14px" },
  "& [data-skip]": { position: "absolute", top: "-100px" },
  "& [data-skip]:focus": {
    top: "4px",
    background: "var(--lab-inset-surface)",
    zIndex: 5,
  },
  "@media (max-width: 800px)": {
    "& [data-columns]": { gridTemplateColumns: "minmax(0,1fr)" },
    "& header, & main, & footer": { padding: "14px" },
    "& [data-match]": {
      gridTemplateColumns: "minmax(0,1fr) 96px minmax(0,1fr)",
      gap: "6px",
    },
  },
});
const knownPositions = new Set([
  "P",
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "LF",
  "CF",
  "RF",
]);
const panel = (title: string, children: RemixNode) => (
  <section data-lab-panel>
    <h2 data-panel-title>{title}</h2>
    {children}
  </section>
);

const table = (head: string[], rows: RemixNode[][], label: string) => (
  <div data-scroll role="region" aria-label={label} tabIndex={0}>
    <table>
      <thead>
        <tr>
          {head.map((h) => (
            <th scope="col">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr>
            {row.map((cell) => (
              <td>{cell ?? "—"}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    {!rows.length && <p>No records available.</p>}
  </div>
);

export function page(
  data: Archive,
  url: URL,
  assets: ReadonlySet<string> = new Set(),
): { title: string; body: RemixNode; status?: number } {
  const bits = url.pathname.split("/").filter(Boolean);
  const id = positiveId(bits[1]);
  const team = (n: number | null) => data.teams.find((t) => t.id === n);
  const player = (n: number) => data.players.find((p) => p.id === n);
  const teamLink = (n: number) => (
    <a href={`/teams/${n}`}>{team(n)?.name ?? "Unknown team"}</a>
  );
  const playerLink = (n: number) => (
    <a href={`/players/${n}`}>{player(n)?.name ?? "Unknown player"}</a>
  );
  const portraitSource = (type: "player" | "team", n: number) => {
    const name = `${type}-${n}.png`;
    return assets.has(name) ? `/assets/${name}` : undefined;
  };
  const image = (
    type: "player" | "team",
    n: number,
    name: string,
    side = false,
  ) => {
    const sideName = `player-side-${n}.png`;
    const src =
      side && assets.has(sideName)
        ? `/assets/${sideName}`
        : portraitSource(type, n);
    return (
      <span data-portrait aria-hidden="true">
        {src ? (
          <img src={src} alt="" width="56" height="56" loading="lazy" />
        ) : (
          name.slice(0, 2)
        )}
      </span>
    );
  };
  const teamIdentity = (n: number) => (
    <span data-team-identity>
      {image("team", n, team(n)?.abbreviation ?? "?")}
      {teamLink(n)}
    </span>
  );
  const cards = (players: Archive["players"]) => (
    <div data-roster-grid data-catalogue-grid>
      {players.map((p) => {
        const owner = team(p.team_id);
        const assignment = data.lineups.find((l) => l.player_id === p.id);
        return (
          <a data-roster-card data-player-card href={`/players/${p.id}`}>
            <span data-player-team title={owner?.name ?? "Free agent"}>
              {owner ? (
                <>
                  {image("team", owner.id, owner.abbreviation)}
                  {owner.abbreviation}
                </>
              ) : (
                "Free"
              )}
            </span>
            <div data-portrait-lockup>
              {image("player", p.id, p.name, true)}
              {owner?.captain_id === p.id && (
                <span
                  data-player-mark="captain"
                  role="img"
                  aria-label="Captain"
                  title="Captain"
                >
                  C
                </span>
              )}
              {assignment?.is_starred && (
                <span
                  data-player-mark="star"
                  role="img"
                  aria-label="Starred"
                  title="Starred"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m10 1 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L1 7.6l6.2-.9Z" />
                  </svg>
                </span>
              )}
            </div>
            <span data-player-name>{p.name}</span>
          </a>
        );
      })}
    </div>
  );
  const fixtures = (matches: Match[]) =>
    matches.length ? (
      matches.map((m) => {
        const a = result(m, m.team_a_id);
        const b = result(m, m.team_b_id);
        return (
          <article data-match>
            <div data-team-side>
              {image(
                "team",
                m.team_a_id,
                team(m.team_a_id)?.abbreviation ?? "?",
              )}
              {teamLink(m.team_a_id)}
              {a && (
                <small data-result-label data-result={a}>
                  {a}
                </small>
              )}
            </div>
            <div data-score>
              <a
                href={`/matches/${m.id}`}
                aria-label={`Match ${m.id}: ${m.team_a_score ?? "unknown"} to ${m.team_b_score ?? "unknown"}`}
              >
                <span data-result={a ?? undefined}>
                  {m.team_a_score ?? "—"}
                </span>
                <span>–</span>
                <span data-result={b ?? undefined}>
                  {m.team_b_score ?? "—"}
                </span>
              </a>
              <div data-muted>{m.state}</div>
            </div>
            <div data-team-side>
              {image(
                "team",
                m.team_b_id,
                team(m.team_b_id)?.abbreviation ?? "?",
              )}
              {teamLink(m.team_b_id)}
              {b && (
                <small data-result-label data-result={b}>
                  {b}
                </small>
              )}
            </div>
          </article>
        );
      })
    ) : (
      <p>No recorded fixtures.</p>
    );
  const lineup = (
    rows: {
      player_id: number;
      batting_order: number | null;
      fielding_position: string | null;
      is_starred: boolean;
    }[],
    captain: number | null,
  ) => (
    <>
      {table(
        ["Order", "Player", "Position", "Captain", "Starred"],
        [...rows]
          .toSorted((a, b) => (a.batting_order ?? 99) - (b.batting_order ?? 99))
          .map((r) => [
            r.batting_order,
            <span data-lineup-player>
              {image("player", r.player_id, player(r.player_id)?.name ?? "?")}
              {playerLink(r.player_id)}
            </span>,
            r.fielding_position,
            r.player_id === captain ? "Captain" : "—",
            r.is_starred ? "Starred" : "—",
          ]),
        "Batting order",
      )}
      {rows.some((r) => r.fielding_position) && (
        <BaseballField
          label="Recorded fielding positions"
          players={rows
            .filter(
              (r) =>
                r.fielding_position && knownPositions.has(r.fielding_position),
            )
            .map((r) => ({
              id: String(r.player_id),
              name: player(r.player_id)?.name ?? "Unknown player",
              position: r.fielding_position as BaseballPosition,
              image: portraitSource("player", r.player_id),
            }))}
        />
      )}
    </>
  );
  if (!bits.length) {
    const standings = data.teams
      .map((t) => {
        const matches = data.matches.filter((m) =>
          [m.team_a_id, m.team_b_id].includes(t.id),
        );
        return {
          t,
          wins: matches.filter((m) => result(m, t.id) === "Win").length,
          losses: matches.filter((m) => result(m, t.id) === "Loss").length,
          draws: matches.filter((m) => result(m, t.id) === "Draw").length,
        };
      })
      .toSorted(
        (a, b) =>
          b.wins - a.wins ||
          a.losses - b.losses ||
          a.t.name.localeCompare(b.t.name),
      );
    return {
      title: "League clubhouse",
      body: (
        <>
          <p>
            Historical Sluggers, live from the original league database. Browse
            the season, squads and recorded games. This website is read-only.
          </p>
          <div data-columns>
            <div>
              {panel(
                "Latest results",
                fixtures(
                  data.matches
                    .filter((m) => m.state === "finished")
                    .toSorted(
                      (a, b) =>
                        (b.match_day_id ?? 0) - (a.match_day_id ?? 0) ||
                        (b.order_in_day ?? 0) - (a.order_in_day ?? 0),
                    )
                    .slice(0, 5),
                ),
              )}
              {panel(
                "Upcoming games",
                fixtures(
                  data.matches
                    .filter((m) => m.state !== "finished")
                    .toSorted(
                      (a, b) =>
                        (a.match_day_id ?? 999) - (b.match_day_id ?? 999) ||
                        (a.order_in_day ?? 0) - (b.order_in_day ?? 0),
                    )
                    .slice(0, 5),
                ),
              )}
              <p>
                <a href="/matches">All match days</a>
              </p>
            </div>
            {panel(
              "Recorded results",
              <>
                {table(
                  ["Team", "W", "L", "D"],
                  standings.map(({ t, wins, losses, draws }) => [
                    teamIdentity(t.id),
                    <span data-win>{wins}</span>,
                    <span data-loss>{losses}</span>,
                    draws,
                  ]),
                  "Recorded standings",
                )}
                <p data-muted>
                  Only finished games with both scores recorded count. This is
                  not a certified final league table.
                </p>
              </>,
            )}
          </div>
        </>
      ),
    };
  }
  if (bits[0] === "players" && bits.length === 1) {
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
    const selectedTeam = positiveId(url.searchParams.get("team") ?? undefined);
    const players = data.players
      .filter(
        (p) =>
          (!q || p.name.toLowerCase().includes(q.toLowerCase())) &&
          (!selectedTeam || p.team_id === selectedTeam),
      )
      .toSorted((a, b) => a.sort_position - b.sort_position);
    return {
      title: "Players",
      body: (
        <>
          <form method="get">
            <label>
              Player name <input name="q" defaultValue={q} />
            </label>
            <label>
              Team{" "}
              <select
                name="team"
                defaultValue={selectedTeam ? String(selectedTeam) : ""}
              >
                <option value="">All teams</option>
                {data.teams.map((t) => (
                  <option value={String(t.id)}>{t.name}</option>
                ))}
              </select>
            </label>
            <button>Find players</button>
          </form>
          <p>{players.length} players</p>
          {cards(players)}
        </>
      ),
    };
  }
  if (bits[0] === "players" && id && bits.length === 2) {
    const p = player(id);
    if (!p) return missing();
    const stats = data.stats.find((s) => s.character === p.stats_character);
    return {
      title: p.name,
      body: (
        <>
          <p>{p.team_id ? teamLink(p.team_id) : "Free agent"}</p>
          {image("player", p.id, p.name)}
          <div data-columns>
            {panel(
              "Character attributes",
              stats ? (
                table(
                  ["Attribute", "Value"],
                  Object.entries(stats).map(([key, value]) => [
                    human(key),
                    String(value),
                  ]),
                  "Character attributes",
                )
              ) : (
                <p>No character attributes recorded.</p>
              ),
            )}
            <div>
              {panel(
                "Chemistry",
                <ul>
                  {data.chemistry
                    .filter(
                      (c) =>
                        c.character1 === p.stats_character ||
                        c.character2 === p.stats_character,
                    )
                    .map((c) => (
                      <li>
                        {c.character1 === p.stats_character
                          ? c.character2
                          : c.character1}
                        : {c.relationship}
                      </li>
                    ))}
                </ul>,
              )}
              {panel(
                "Recorded batting",
                table(
                  ["Match", "Team", "PA", "H", "HR", "RBI"],
                  data.performances
                    .filter((s) => s.player_id === id)
                    .map((s) => [
                      <a href={`/matches/${s.match_id}/stats`}>
                        Match {s.match_id}
                      </a>,
                      teamLink(s.team_id),
                      s.plate_appearances,
                      s.hits,
                      s.home_runs,
                      s.rbi,
                    ]),
                  "Player recorded batting",
                ),
              )}
              {panel(
                "Recorded appearances",
                <ul>
                  {data.appearances
                    .filter((a) => a.player_id === id)
                    .map((a) => (
                      <li>
                        <a href={`/matches/${a.match_id}`}>
                          Match {a.match_id}
                        </a>{" "}
                        · {teamLink(a.team_id)} ·{" "}
                        {a.fielding_position ?? "Position unknown"}
                      </li>
                    ))}
                </ul>,
              )}
            </div>
          </div>
        </>
      ),
    };
  }
  if (bits[0] === "teams" && bits.length === 1)
    return {
      title: "Teams",
      body: (
        <div data-roster-grid>
          {data.teams.map((t) => (
            <article data-roster-card>
              {image("team", t.id, t.name)}
              <h2>{teamLink(t.id)}</h2>
              <p>
                {data.managers.find((u) => u.id === t.user_id)?.name ??
                  "Manager unknown"}
              </p>
              <p>
                {data.players.filter((p) => p.team_id === t.id).length} players
              </p>
            </article>
          ))}
        </div>
      ),
    };
  if (
    bits[0] === "teams" &&
    id &&
    (bits.length === 2 || (bits.length === 3 && bits[2] === "lineup"))
  ) {
    const t = team(id);
    if (!t) return missing();
    const roster = data.players.filter((p) => p.team_id === id);
    return {
      title: bits[2] ? `${t.name} lineup` : t.name,
      body: (
        <>
          <p>
            {data.managers.find((u) => u.id === t.user_id)?.name ??
              "Manager unknown"}{" "}
            ·{" "}
            {data.conferences.find((c) => c.id === t.conference_id)?.name ??
              "No conference"}
          </p>
          <nav aria-label="Team pages">
            <a href={`/teams/${id}`}>Roster</a>
            <a href={`/teams/${id}/lineup`}>Current lineup</a>
          </nav>
          {bits[2] ? (
            panel(
              "Current team lineup",
              <>
                <p data-muted>
                  Current roster only. Individual matches preserve their own
                  recorded lineup.
                </p>
                {lineup(
                  data.lineups.filter((l) =>
                    roster.some((p) => p.id === l.player_id),
                  ),
                  t.captain_id,
                )}
              </>,
            )
          ) : (
            <>
              {panel("Squad", cards(roster))}
              {panel(
                "Team fixtures",
                fixtures(
                  data.matches.filter((m) =>
                    [m.team_a_id, m.team_b_id].includes(id),
                  ),
                ),
              )}
            </>
          )}
        </>
      ),
    };
  }
  if (bits[0] === "matches" && bits.length === 1)
    return {
      title: "Match days",
      body: (
        <>
          {[...data.days]
            .toSorted(
              (a, b) => (a.order_in_season ?? 0) - (b.order_in_season ?? 0),
            )
            .map((day) =>
              panel(
                day.name ?? `Match day ${day.id}`,
                <>
                  <p>
                    <a href={`/days/${day.id}`}>Open match day</a> ·{" "}
                    {date(day.date)}
                  </p>
                  {fixtures(
                    data.matches.filter((m) => m.match_day_id === day.id),
                  )}
                </>,
              ),
            )}
          {data.matches.some((m) => m.match_day_id === null) &&
            panel(
              "Unassigned fixtures",
              fixtures(data.matches.filter((m) => m.match_day_id === null)),
            )}
        </>
      ),
    };
  if (bits[0] === "days" && id && bits.length === 2) {
    const day = data.days.find((d) => d.id === id);
    if (!day) return missing();
    return {
      title: day.name ?? `Match day ${id}`,
      body: (
        <>
          <p>{date(day.date)}</p>
          {panel(
            "Fixtures",
            fixtures(
              data.matches
                .filter((m) => m.match_day_id === id)
                .toSorted(
                  (a, b) => (a.order_in_day ?? 0) - (b.order_in_day ?? 0),
                ),
            ),
          )}
        </>
      ),
    };
  }
  if (
    bits[0] === "matches" &&
    id &&
    (bits.length === 2 ||
      (bits.length === 3 && ["lineup", "stats"].includes(bits[2]!)))
  ) {
    const m = data.matches.find((match) => match.id === id);
    if (!m) return missing();
    const subpage = bits[2];
    return {
      title: `${team(m.team_a_id)?.name ?? "Team"} vs ${team(m.team_b_id)?.name ?? "Team"}`,
      body: (
        <>
          {panel(
            `Match ${id}`,
            <>
              {fixtures([m])}
              <p>
                {data.locations.find((l) => l.id === m.location_id)?.name ??
                  "Venue unknown"}{" "}
                · {date(m.scheduled_date)}
              </p>
              {m.match_day_id && (
                <a href={`/days/${m.match_day_id}`}>Back to match day</a>
              )}
            </>,
          )}
          <nav aria-label="Match pages">
            <a href={`/matches/${id}`}>Overview</a>
            <a href={`/matches/${id}/lineup`}>Recorded lineups</a>
            <a href={`/matches/${id}/stats`}>Box score</a>
          </nav>
          <p data-muted>
            Missing scores and statistics are unknown, not zero. No
            inning-by-inning scores are stored in this archive.
          </p>
          {subpage === "stats"
            ? [m.team_a_id, m.team_b_id].map((tid) =>
                panel(
                  `${team(tid)?.name ?? "Team"} box score`,
                  table(
                    [
                      "Player",
                      "PA",
                      "H",
                      "HR",
                      "Outs",
                      "RBI",
                      "IP",
                      "K",
                      "ER",
                      "PO",
                      "A",
                      "DP",
                      "TP",
                      "Errors",
                    ],
                    data.performances
                      .filter((s) => s.match_id === id && s.team_id === tid)
                      .map((s) => [
                        playerLink(s.player_id),
                        s.plate_appearances,
                        s.hits,
                        s.home_runs,
                        s.outs,
                        s.rbi,
                        s.innings_pitched_whole === null ||
                        s.innings_pitched_partial === null
                          ? "—"
                          : `${s.innings_pitched_whole}.${s.innings_pitched_partial}`,
                        s.strikeouts,
                        s.earned_runs,
                        s.putouts,
                        s.assists,
                        s.double_plays,
                        s.triple_plays,
                        s.errors,
                      ]),
                    "Recorded player statistics",
                  ),
                ),
              )
            : [m.team_a_id, m.team_b_id].map((tid) =>
                panel(
                  `${team(tid)?.name ?? "Team"} recorded lineup`,
                  lineup(
                    data.appearances.filter(
                      (a) => a.match_id === id && a.team_id === tid,
                    ),
                    null,
                  ),
                ),
              )}
        </>
      ),
    };
  }
  if (bits[0] === "draft" && bits.length === 1)
    return {
      title: "Draft room",
      body: (
        <>
          <p>
            Read-only season state and recorded picks. No drafting actions or
            private pre-draft choices are available.
          </p>
          {data.seasons.map((s) =>
            panel(
              `Season ${s.id} · ${s.state}`,
              <>
                <p>
                  On the clock:{" "}
                  {data.teams.find(
                    (t) => t.user_id === s.current_drafting_user_id,
                  )?.name ?? "No team currently drafting"}
                  . Timer duration: {s.draft_timer_duration} seconds.{" "}
                  {s.draft_timer_paused_at ? "Timer paused." : ""}
                </p>
                {table(
                  ["Turn", "Team"],
                  data.turns
                    .filter((t) => t.season_id === s.id)
                    .toSorted((a, b) => a.drafting_turn - b.drafting_turn)
                    .map((t) => [
                      t.drafting_turn,
                      data.teams.find(
                        (candidate) => candidate.user_id === t.user_id,
                      )?.name ?? "Unknown team",
                    ]),
                  "Draft order",
                )}
              </>,
            ),
          )}
          {panel(
            "Recorded picks",
            table(
              ["Pick", "Player", "Team"],
              [...data.picks]
                .toSorted((a, b) => a.pick_number - b.pick_number)
                .map((p) => [
                  p.pick_number,
                  playerLink(p.player_id),
                  teamLink(p.team_id),
                ]),
              "Draft picks",
            ),
          )}
        </>
      ),
    };
  if (
    bits[0] === "trades" &&
    bits.length === 2 &&
    (!id || !data.trades.some((t) => t.id === id))
  )
    return missing();
  if (bits[0] === "trades" && (bits.length === 1 || (bits.length === 2 && id)))
    return {
      title: "Trade history",
      body: (
        <>
          <p>
            Read-only transaction history. Private proposal and response
            messages are not shown.
          </p>
          {data.trades
            .filter((t) => bits.length === 1 || t.id === id)
            .map((t) =>
              panel(
                `Trade ${t.id} · ${t.status}`,
                <>
                  <p>
                    <a href={`/trades/${t.id}`}>Open trade {t.id}</a> ·{" "}
                    {date(t.created_at)}
                  </p>
                  <p>
                    {t.status === "accepted"
                      ? "Accepted player movement"
                      : "Proposed player movement; not an accepted transfer"}
                  </p>
                  <ul>
                    {data.tradePlayers
                      .filter((p) => p.trade_id === t.id)
                      .map((p) => (
                        <li>
                          {playerLink(p.player_id)}: {teamLink(p.from_team_id)}{" "}
                          → {teamLink(p.to_team_id)}
                        </li>
                      ))}
                  </ul>
                </>,
              ),
            )}
        </>
      ),
    };
  if (bits[0] === "events" && bits.length === 1)
    return {
      title: "League events",
      body: panel(
        "Latest 200 events",
        <ol>
          {data.events
            .filter((e) => e.event_type !== "trade_preferences_update")
            .map((e) => {
              const pick = data.picks.find((p) => p.event_id === e.id);
              const change = data.matchChanges.find((c) => c.event_id === e.id);
              const state = data.seasonChanges.find((c) => c.event_id === e.id);
              const trade = data.tradeEvents.find((t) => t.event_id === e.id);
              return (
                <li>
                  <time>{date(e.created_at)}</time> ·{" "}
                  {pick ? (
                    <>
                      {teamLink(pick.team_id)} drafted{" "}
                      {playerLink(pick.player_id)} (pick {pick.pick_number})
                    </>
                  ) : change ? (
                    <>
                      <a href={`/matches/${change.match_id}`}>
                        Match {change.match_id}
                      </a>
                      : {change.to_state}
                    </>
                  ) : state ? (
                    <>
                      Season {e.season_id}: {state.to_state}
                    </>
                  ) : trade ? (
                    <>
                      <a href={`/trades/${trade.trade_id}`}>
                        Trade {trade.trade_id}
                      </a>
                      : {trade.action}
                    </>
                  ) : (
                    human(e.event_type)
                  )}
                </li>
              );
            })}
        </ol>,
      ),
    };
  return missing();
}
function missing() {
  return {
    title: "Page not found",
    body: (
      <p>
        This league record does not exist.{" "}
        <a href="/">Return to the clubhouse</a>.
      </p>
    ),
    status: 404,
  };
}
function human(value: string) {
  return value.replaceAll("_", " ");
}
function date(value: unknown) {
  if (!value) return "Date not recorded";
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime())
    ? "Date not recorded"
    : d.toLocaleString("en-GB", {
        timeZone: "UTC",
        dateStyle: "medium",
        timeStyle: "short",
      }) + " UTC";
}
export function document(title: string, body: RemixNode, url: URL) {
  const concept =
    concepts.find((c) => c.id === url.searchParams.get("theme")) ??
    concepts[0]!;
  return (
    <html
      lang="en"
      data-theme={concept.id}
      mix={[
        themeRoot,
        themeStyles(concept.tokens),
        labPartStyles(concept.parts),
        baseballFieldStyles(concept.field),
        styles,
        originalBackdrop,
        concept.recipe,
      ]}
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="robots" content="noindex,nofollow" />
        <title>{title} · Harry Sluggers</title>
        <link rel="stylesheet" href="/fonts.css" />
        <script type="module" src="/runtime.js"></script>
      </head>
      <body>
        <a href="#main" data-skip>
          Skip to content
        </a>
        <header>
          <a data-brand href="/">
            Harry Sluggers
          </a>
          <form method="get">
            <label>
              Style{" "}
              <select data-theme-picker name="theme" defaultValue={concept.id}>
                {concepts.map((c) => (
                  <option value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            {[...url.searchParams]
              .filter(([key]) => key !== "theme")
              .map(([key, value]) => (
                <input type="hidden" name={key} value={value} />
              ))}
          </form>
          <nav aria-label="League">
            <a href="/">Home</a>
            <a href="/players">Players</a>
            <a href="/teams">Teams</a>
            <a href="/matches">Matches</a>
            <a href="/draft">Draft</a>
            <a href="/events">Events</a>
            <a href="/trades">Trades</a>
          </nav>
        </header>
        <main id="main">
          <h1>{title}</h1>
          {body}
        </main>
        <footer>Harry Sluggers · Historical league · Read-only</footer>
      </body>
    </html>
  );
}
