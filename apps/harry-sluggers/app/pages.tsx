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
  "& [data-topbar], & main": {
    maxWidth: "1280px",
    margin: "auto",
    padding: "20px",
  },
  "& [data-topbar]": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "8px 40px",
    padding: "16px",
  },
  "& [data-topbar-shell]": {
    position: "relative",
    borderBottom: "1px solid var(--hui-border)",
  },
  "& [data-topbar] form": { marginInlineStart: "auto", order: 1 },
  "& [data-topbar] select": { width: "156px" },
  "@media (min-width: 1640px)": {
    "& [data-topbar] form": {
      position: "absolute",
      right: "16px",
      top: "50%",
      transform: "translateY(-50%)",
    },
  },
  "& [data-topbar] nav": { gap: "0 32px" },
  "& [data-topbar] nav a:not([aria-current])": { textDecoration: "none" },
  "@media (max-width: 767px)": {
    "& [data-topbar]": { gap: "4px 16px" },
    "& [data-topbar] nav": { order: 2, flexBasis: "100%", gap: "0 16px" },
    "& [data-topbar] select": { width: "128px", paddingInline: "6px" },
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
    fontSize: "20px",
    fontWeight: 700,
    fontFamily: "SluggersHappiness, var(--hui-font-display)",
    textDecoration: "none",
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
  "& [data-chemistry-note]": {
    position: "absolute",
    right: "-9px",
    bottom: "-8px",
    color: "#ffd4ed",
    fontSize: "20px",
    fontWeight: 700,
    pointerEvents: "none",
  },
  "& [data-player-card][data-chemistry=negative] [data-chemistry-note]": {
    color: "#ff9a9a",
  },
  "& [data-player-detail]": {
    display: "grid",
    justifyItems: "center",
    gap: "16px",
  },
  "& [data-player-profile]": {
    display: "grid",
    justifyItems: "center",
    gap: "24px",
    padding: "clamp(16px,4vw,32px)",
    background: "var(--lab-card-surface)",
    border: "2px solid var(--lab-surface-edge)",
    borderRadius: "var(--lab-card-radius)",
    maxWidth: "100%",
  },
  "& [data-player-profile] [data-portrait]": { width: "80px", height: "80px" },
  "& [data-player-profile] [data-player-mark]": {
    width: "20px",
    height: "20px",
    fontSize: "14px",
  },
  "& [data-player-profile] p": { margin: 0 },
  "& [data-player-attributes]": {
    display: "grid",
    gridTemplateColumns: "repeat(4,minmax(0,1fr))",
    gap: "32px",
  },
  "& [data-player-attributes] h2": {
    fontSize: "17px",
    borderBottom: "1px solid var(--hui-table-border)",
    margin: "0 0 6px",
    paddingBottom: "4px",
  },
  "& [data-player-attributes] dl": { margin: 0, fontSize: "14px" },
  "& [data-player-attributes] dl div": {
    display: "flex",
    justifyContent: "space-between",
    gap: "8px",
    paddingBlock: "2px",
  },
  "& [data-player-attributes] dd": {
    margin: 0,
    textAlign: "right",
    fontWeight: 600,
  },
  "& [data-player-history]": { width: "min(100%, 42rem)", minWidth: 0 },
  "& [data-player-history] details": { marginBottom: "12px" },
  "& main:has(> [data-player-detail]) > h1": {
    textAlign: "center",
    fontSize: "24px",
  },
  "@media (max-width: 850px)": {
    "& [data-player-attributes]": {
      gridTemplateColumns: "repeat(2,minmax(0,1fr))",
      gap: "16px",
    },
  },
  "@media (max-width: 520px)": {
    "& [data-player-attributes]": { gridTemplateColumns: "minmax(0,1fr)" },
  },
  "& [data-conference]": {
    border: "4px solid var(--lab-surface-edge)",
    borderRadius: "8px",
    padding: "12px",
    marginBottom: "32px",
    minWidth: 0,
  },
  "& [data-conference] > h2, & [data-team-heading]": { textAlign: "center" },
  "& [data-conference-teams]": {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: "32px",
  },
  "& [data-team-entry]": {
    width: "min(100%, 356px)",
    display: "grid",
    gap: "12px",
    textDecoration: "none",
  },
  "& [data-team-heading] h3, & [data-team-heading] p": { margin: 0 },
  "& [data-team-sheet]": {
    minWidth: 0,
    display: "grid",
    justifyItems: "center",
    gap: "16px",
    padding: "clamp(8px, 3vw, 16px)",
    border: "2px solid var(--lab-surface-edge)",
    borderRadius: "var(--lab-card-radius)",
    background: "var(--lab-card-surface)",
  },
  "& [data-team-entry]:is(:hover,:focus-visible) [data-team-sheet]": {
    background: "var(--lab-solid-surface)",
  },
  "& [data-team-order]": {
    display: "flex",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: "6px",
    width: "100%",
    paddingBottom: "10px",
    borderBottom: "1px solid var(--lab-surface-edge)",
  },
  "& [data-team-order] > *, & [data-field-slot]": {
    display: "grid",
    justifyItems: "center",
    textAlign: "center",
    minWidth: 0,
    textDecoration: "none",
    fontSize: "12px",
  },
  "& [data-team-order] strong": { color: "var(--hui-accent)" },
  "& [data-team-sheet] [data-portrait-lockup] [data-portrait]": {
    width: "clamp(23px, 7vw, 32px)",
    height: "clamp(23px, 7vw, 32px)",
  },
  "& [data-team-field]": {
    width: "min(100%, 320px)",
    aspectRatio: "1",
    position: "relative",
    isolation: "isolate",
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0,1fr))",
    gridTemplateRows: "repeat(5,1fr)",
    alignItems: "center",
  },
  "& [data-field-art]": {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    zIndex: -1,
    fill: "rgb(255 255 255 / .22)",
    stroke: "var(--lab-surface-edge)",
    strokeWidth: 4,
  },
  "& [data-field-slot] small": { color: "var(--hui-muted)" },
  "& [data-field-empty]": {
    width: "22px",
    height: "22px",
    background: "rgb(255 255 255 / .15)",
    borderRadius: "50%",
  },
  "& [data-team-detail]": {
    display: "grid",
    justifyItems: "center",
    gap: "16px",
  },
  "& main:has(> [data-team-detail]) > h1": {
    textAlign: "center",
    marginBottom: "8px",
  },
  "& [data-team-detail-roster]": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: "20px",
    maxWidth: "100%",
  },
  "& [data-team-detail-roster] ul": {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  "& [data-team-detail-roster] li": { marginBlock: "4px" },
  "& [data-team-bench]": {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "6px",
    width: "100%",
    borderTop: "1px solid var(--lab-surface-edge)",
    paddingTop: "8px",
  },
  "& [data-team-results]": { width: "min(100%, 42rem)", minWidth: 0 },
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
  "& [data-page-title-hidden]": {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: 0,
    margin: "-1px",
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
  },
  "& [data-skip]": { position: "absolute", top: "-100px" },
  "& [data-skip]:focus": {
    top: "4px",
    background: "var(--lab-inset-surface)",
    zIndex: 5,
  },
  "@media (max-width: 800px)": {
    "& [data-columns]": { gridTemplateColumns: "minmax(0,1fr)" },
    "& [data-topbar], & main": { padding: "14px" },
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

function playerAttributes(stats: Archive["stats"][number]) {
  const groups = {
    "Basic Info": {
      Character: stats.character,
      Class: stats.character_class,
      Captain: stats.captain ? "Yes" : "No",
      Weight: stats.weight,
      Ability: stats.ability,
      Speed: stats.speed,
    },
    Batting: {
      Stance: stats.batting_stance,
      Trajectory: stats.hitting_trajectory,
      "Slap Contact": stats.slap_hit_contact_size,
      "Charge Contact": stats.charge_hit_contact_size,
      "Slap Power": stats.slap_hit_power,
      "Charge Power": stats.charge_hit_power,
      Bunting: stats.bunting,
    },
    "Pitching & Fielding": {
      "Throwing Arm": stats.throwing_arm,
      "Throwing Speed": stats.throwing_speed,
      Fielding: stats.fielding,
      "Fastball Speed": stats.fastball_speed,
      "Curveball Speed": stats.curveball_speed,
      Curve: stats.curve,
      Stamina: stats.stamina,
    },
    "Displayed Stats": {
      Pitching: stats.pitching_css,
      Batting: stats.batting_css,
      Fielding: stats.fielding_css,
      Speed: stats.speed_css,
    },
  };
  return (
    <div data-player-attributes>
      {Object.entries(groups).map(([heading, fields]) => (
        <section>
          <h2>{heading}</h2>
          <dl>
            {Object.entries(fields).map(([label, value]) => (
              <div>
                <dt>{label}:</dt>
                <dd>{value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

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
  const playerPortrait = (
    p: Archive["players"][number],
    captain: boolean,
    starred?: boolean,
  ) => (
    <div data-portrait-lockup>
      {image("player", p.id, p.name, true)}
      {captain && (
        <span
          data-player-mark="captain"
          role="img"
          aria-label="Captain"
          title="Captain"
        >
          C
        </span>
      )}
      {starred && (
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
      <span data-chemistry-note hidden aria-hidden="true">
        ♪
      </span>
    </div>
  );
  const chemistryTargets = (character: string | null, relationship: string) =>
    data.chemistry
      .filter(
        (c) => c.character1 === character && c.relationship === relationship,
      )
      .map((c) => c.character2);
  const cards = (players: Archive["players"]) => (
    <div data-roster-grid data-catalogue-grid>
      {players.map((p) => {
        const owner = team(p.team_id);
        const assignment = data.lineups.find((l) => l.player_id === p.id);
        return (
          <a
            data-roster-card
            data-player-card
            data-character={p.stats_character ?? undefined}
            data-positive={JSON.stringify(
              chemistryTargets(p.stats_character, "positive"),
            )}
            data-negative={JSON.stringify(
              chemistryTargets(p.stats_character, "negative"),
            )}
            href={`/players/${p.id}`}
          >
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
            {playerPortrait(
              p,
              owner?.captain_id === p.id,
              assignment?.is_starred,
            )}
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
                <p data-muted>Only finished games with both scores count.</p>
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
    const stats = data.stats.find(
      (entry) => entry.character === p.stats_character,
    );
    const owner = team(p.team_id);
    const assignment = data.lineups.find((l) => l.player_id === p.id);
    const history = data.events.flatMap((event) => {
      const pick = data.picks.find(
        (row) => row.event_id === event.id && row.player_id === id,
      );
      if (pick)
        return [
          <li>
            {date(event.created_at)} · Drafted by {teamLink(pick.team_id)} (pick{" "}
            {pick.pick_number})
          </li>,
        ];
      const trade = data.tradeEvents.find(
        (row) =>
          row.event_id === event.id &&
          data.tradePlayers.some(
            (move) => move.trade_id === row.trade_id && move.player_id === id,
          ),
      );
      if (trade)
        return [
          <li>
            {date(event.created_at)} ·{" "}
            <a href={`/trades/${trade.trade_id}`}>Trade {trade.trade_id}</a>:{" "}
            {trade.action}
          </li>,
        ];
      const match = data.matchChanges.find(
        (row) =>
          row.event_id === event.id &&
          data.appearances.some(
            (appearance) =>
              appearance.match_id === row.match_id &&
              appearance.player_id === id,
          ),
      );
      return match
        ? [
            <li>
              {date(event.created_at)} ·{" "}
              <a href={`/matches/${match.match_id}`}>Match {match.match_id}</a>:{" "}
              {match.to_state}
            </li>,
          ]
        : [];
    });
    return {
      title: p.name,
      body: (
        <div data-player-detail>
          <section data-player-profile aria-label="Player profile">
            {playerPortrait(
              p,
              owner?.captain_id === p.id,
              assignment?.is_starred,
            )}
            <p>
              Team:{" "}
              {owner ? teamLink(owner.id) : <span data-win>Free Agent</span>}
            </p>
            {stats ? (
              playerAttributes(stats)
            ) : (
              <p>No character attributes recorded.</p>
            )}
          </section>
          <section data-player-history>
            <h2>Player History</h2>
            {history.length ? (
              <ul>{history}</ul>
            ) : (
              <p>No recent league events recorded for this player.</p>
            )}
            <details>
              <summary>Recorded appearances</summary>
              <ul>
                {data.appearances
                  .filter((row) => row.player_id === id)
                  .map((row) => (
                    <li>
                      <a href={`/matches/${row.match_id}`}>
                        Match {row.match_id}
                      </a>{" "}
                      · {teamLink(row.team_id)} ·{" "}
                      {row.fielding_position ?? "Position unknown"}
                    </li>
                  ))}
              </ul>
            </details>
            <details>
              <summary>Recorded batting</summary>
              {table(
                ["Match", "Team", "PA", "H", "HR", "RBI"],
                data.performances
                  .filter((row) => row.player_id === id)
                  .map((row) => [
                    <a href={`/matches/${row.match_id}/stats`}>
                      Match {row.match_id}
                    </a>,
                    teamLink(row.team_id),
                    row.plate_appearances,
                    row.hits,
                    row.home_runs,
                    row.rbi,
                  ]),
                "Player recorded batting",
              )}
            </details>
            <details>
              <summary>Chemistry</summary>
              <ul>
                {data.chemistry
                  .filter(
                    (row) =>
                      row.character1 === p.stats_character ||
                      row.character2 === p.stats_character,
                  )
                  .map((row) => (
                    <li>
                      {row.character1 === p.stats_character
                        ? row.character2
                        : row.character1}
                      : {row.relationship}
                    </li>
                  ))}
              </ul>
            </details>
          </section>
        </div>
      ),
    };
  }
  if (bits[0] === "teams") {
    const manager = (t: Archive["teams"][number]) =>
      data.managers.find((u) => u.id === t.user_id)?.name ?? "Manager unknown";
    const conference = (t: Archive["teams"][number]) =>
      data.conferences.find((c) => c.id === t.conference_id);
    const teams = data.teams.toSorted((a, b) => a.name.localeCompare(b.name));
    const records = teams
      .map((t) => {
        const games = data.matches.filter((m) => result(m, t.id) !== null);
        return {
          id: t.id,
          wins: games.filter((m) => result(m, t.id) === "Win").length,
          losses: games.filter((m) => result(m, t.id) === "Loss").length,
          games,
        };
      })
      .toSorted((a, b) => b.wins - b.losses - (a.wins - a.losses));
    const rank = (teamId: number) => {
      const index = records.findIndex((record) => record.id === teamId);
      return records[index]?.games.length ? `#${index + 1} ` : "";
    };
    function roster(t: Archive["teams"][number]) {
      return data.players
        .filter((p) => p.team_id === t.id)
        .map((p) => ({
          p,
          entry: data.lineups.find((l) => l.player_id === p.id),
        }))
        .toSorted(
          (a, b) =>
            (a.entry?.batting_order ?? Infinity) -
              (b.entry?.batting_order ?? Infinity) ||
            a.p.name.localeCompare(b.p.name),
        );
    }
    function teamSheet(t: Archive["teams"][number], linkPlayers: boolean) {
      const players = roster(t);
      const ordered = players.filter((row) => row.entry?.batting_order != null);
      const bench = players.filter((row) => row.entry?.batting_order == null);
      const slots = [
        ["LF", 1, 1],
        ["CF", 1, 4],
        ["RF", 1, 7],
        ["SS", 2, 3],
        ["2B", 2, 5],
        ["P", 3, 4],
        ["3B", 4, 2],
        ["1B", 4, 6],
        ["C", 5, 4],
      ] as const;
      const icon = (row: (typeof players)[number]) =>
        playerPortrait(row.p, row.p.id === t.captain_id, row.entry?.is_starred);
      return (
        <div data-team-sheet>
          {image("team", t.id, t.abbreviation)}
          {ordered.length ? (
            <div data-team-order aria-label="Batting order">
              {ordered.map((row) => {
                const content = (
                  <>
                    <strong>{row.entry?.batting_order}</strong>
                    {icon(row)}
                  </>
                );
                return linkPlayers ? (
                  <a
                    href={`/players/${row.p.id}`}
                    aria-label={`Batting ${row.entry?.batting_order}: ${row.p.name}`}
                  >
                    {content}
                  </a>
                ) : (
                  <span title={row.p.name}>{content}</span>
                );
              })}
            </div>
          ) : (
            <span data-muted>No batting order recorded.</span>
          )}
          <div
            data-team-field
            role="group"
            aria-label={`${t.name} fielding positions`}
          >
            <svg data-field-art viewBox="-10 -10 310 310" aria-hidden="true">
              <path d="M 0 130 Q 150 -100 300 130 L 150 280 Z" />
            </svg>
            {slots.map(([position, gridRow, gridColumn]) => {
              const row = players.find(
                (candidate) => candidate.entry?.fielding_position === position,
              );
              const content = (
                <>
                  {row ? (
                    icon(row)
                  ) : (
                    <span data-field-empty aria-hidden="true" />
                  )}
                  <small>{position}</small>
                </>
              );
              const style = {
                gridRow,
                gridColumn,
                transform:
                  position === "LF" || position === "RF"
                    ? "translateY(45%)"
                    : undefined,
              };
              return row && linkPlayers ? (
                <a
                  data-field-slot
                  style={style}
                  href={`/players/${row.p.id}`}
                  aria-label={`${position}: ${row.p.name}`}
                >
                  {content}
                </a>
              ) : (
                <span data-field-slot style={style} title={row?.p.name}>
                  {content}
                </span>
              );
            })}
          </div>
          {!!bench.length && (
            <div data-team-bench>
              <small>Bench:</small>
              {bench.map((row) =>
                linkPlayers ? (
                  <a href={`/players/${row.p.id}`} aria-label={row.p.name}>
                    {icon(row)}
                  </a>
                ) : (
                  <span title={row.p.name}>{icon(row)}</span>
                ),
              )}
            </div>
          )}
        </div>
      );
    }
    if (bits.length === 1) {
      const groups = Map.groupBy(teams, (t) => conference(t)?.id ?? null);
      return {
        title: "Teams",
        body: [...groups]
          .toSorted(([a], [b]) =>
            a === null
              ? 1
              : b === null
                ? -1
                : (
                    data.conferences.find((c) => c.id === a)?.name ?? ""
                  ).localeCompare(
                    data.conferences.find((c) => c.id === b)?.name ?? "",
                  ),
          )
          .map(([key, group]) => {
            const conf = data.conferences.find((c) => c.id === key);
            const color =
              conf?.color && /^#[0-9a-f]{6}$/i.test(conf.color)
                ? conf.color
                : undefined;
            return (
              <section
                data-conference
                style={color ? { borderColor: `${color}80` } : undefined}
              >
                <h2>{conf?.name ?? "No Conference"}</h2>
                <div data-conference-teams>
                  {group.map((t) => (
                    <a
                      data-team-entry
                      href={`/teams/${t.id}`}
                      aria-label={t.name}
                    >
                      <div data-team-heading>
                        <h3>
                          <small data-muted>{rank(t.id)}</small>
                          {t.name}
                        </h3>
                        <p data-muted>{manager(t)}</p>
                      </div>
                      {teamSheet(t, false)}
                    </a>
                  ))}
                </div>
              </section>
            );
          }),
      };
    }
    const t = team(id);
    if (
      !t ||
      !(bits.length === 2 || (bits.length === 3 && bits[2] === "lineup"))
    )
      return missing();
    const players = roster(t);
    const index = teams.indexOf(t);
    const games = data.matches.filter((m) =>
      [m.team_a_id, m.team_b_id].includes(t.id),
    );
    const record = records.find((row) => row.id === t.id);
    return {
      title: bits[2] ? `${t.name} lineup` : `${rank(t.id)}${t.name}`,
      body: (
        <div data-team-detail>
          <div data-team-heading>
            <p data-muted>
              {manager(t)} · {conference(t)?.name ?? "No Conference"}
            </p>
          </div>
          <nav aria-label="Team pages">
            {teams[index - 1] && (
              <a
                aria-label="Previous team"
                href={`/teams/${teams[index - 1].id}`}
              >
                ←
              </a>
            )}
            <a href={`/teams/${t.id}`}>Team overview</a>
            <a href={`/teams/${t.id}/lineup`}>Current lineup</a>
            {teams[index + 1] && (
              <a aria-label="Next team" href={`/teams/${teams[index + 1].id}`}>
                →
              </a>
            )}
          </nav>
          {!bits[2] && record && (
            <div data-team-results>
              {panel(
                "Team standings",
                table(
                  ["Team", "W", "L", "D"],
                  [
                    [
                      teamIdentity(t.id),
                      <span data-win>{record.wins}</span>,
                      <span data-loss>{record.losses}</span>,
                      record.games.length - record.wins - record.losses,
                    ],
                  ],
                  "Team standings",
                ),
              )}
            </div>
          )}
          <div data-team-detail-roster>
            <div>
              <h2>Batting order</h2>
              <ul>
                {players
                  .filter((row) => row.entry?.batting_order != null)
                  .map((row) => (
                    <li>
                      {row.entry?.batting_order}. {playerLink(row.p.id)} ·{" "}
                      {row.entry?.fielding_position ?? "—"}
                    </li>
                  ))}
              </ul>
              {players.some((row) => row.entry?.batting_order == null) && (
                <>
                  <h3>Bench</h3>
                  <ul>
                    {players
                      .filter((row) => row.entry?.batting_order == null)
                      .map((row) => (
                        <li>{playerLink(row.p.id)}</li>
                      ))}
                  </ul>
                </>
              )}
            </div>
            {teamSheet(t, true)}
          </div>
          {!bits[2] && (
            <section data-team-results>
              <h2>Team History</h2>
              {panel("Team fixtures", fixtures(games))}
            </section>
          )}
        </div>
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
          <p data-muted>A dash means no score or stat is available.</p>
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
const leagueLinks = [
  ["/", "Home"],
  ["/teams", "Teams"],
  ["/players", "Players"],
  ["/events", "Events"],
  ["/matches", "Matches"],
  ["/draft", "Drafting"],
  ["/trades", "Trading"],
];

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
        <header data-topbar-shell>
          <div data-topbar>
            <a data-brand href="/">
              @harrhy/sluggers
            </a>
            <nav aria-label="League">
              {leagueLinks.map(([href, label]) => {
                const active =
                  url.pathname === href ||
                  (href !== "/" && url.pathname.startsWith(`${href}/`)) ||
                  (href === "/matches" && url.pathname.startsWith("/days/"));
                return (
                  <a
                    href={href}
                    aria-current={
                      active
                        ? url.pathname === href
                          ? "page"
                          : "location"
                        : undefined
                    }
                  >
                    {label}
                  </a>
                );
              })}
            </nav>
            <form method="get">
              <label>
                <select
                  aria-label="Style"
                  data-theme-picker
                  name="theme"
                  defaultValue={concept.id}
                >
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
          </div>
        </header>
        <main id="main">
          <h1
            data-page-title-hidden={
              leagueLinks.some(
                ([href]) => href === (url.pathname.replace(/\/$/, "") || "/"),
              ) || undefined
            }
          >
            {title}
          </h1>
          {body}
        </main>
      </body>
    </html>
  );
}
