import { space } from "@harrhy/ui/styles";
import { clientEntry, css, on, type Handle } from "remix/component";
import { themeRoot, themeStyles } from "@harrhy/ui/theme";
import {
  Button,
  Field,
  Heading,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@harrhy/ui/native";
import { Select } from "@harrhy/ui/interactive";
import {
  BaseballField,
  BaseballScoreboard,
  baseballFieldStyles,
} from "@harrhy/ui/baseball";
import { originalBackdrop, originalBlue } from "./original.ts";
import { concepts } from "./concepts/index.ts";
import { labPartStyles } from "./concepts/types.ts";
import {
  labScreens,
  recordedTotal,
  matchResult,
  standings,
  type LabCorpus,
  type LabPlayer,
  type LabMatch,
} from "./model.ts";

function portrait(p: LabPlayer, size = 48) {
  return p.image ? (
    <img src={p.image} alt="" width={size} height={size} loading="lazy" />
  ) : (
    <span
      data-portrait-missing
      title="Original portrait unavailable"
      style={{ width: size, height: size }}
    >
      {(p.character ?? p.name).slice(0, 1)}
    </span>
  );
}

const value = (n: number | null | undefined) => n ?? "—";
function score(match: LabMatch) {
  return (
    <strong data-match-score>
      <span data-result={matchResult(match, match.awayId) ?? undefined}>
        {value(match.awayScore)}
      </span>
      <span data-score-separator>–</span>
      <span data-result={matchResult(match, match.homeId) ?? undefined}>
        {value(match.homeScore)}
      </span>
    </strong>
  );
}
export const SluggersLab = clientEntry(
  import.meta.url,
  function SluggersLab(
    handle: Handle<{
      corpus: LabCorpus;
      initialConcept: string;
      initialScreen: string;
    }>,
  ) {
    const data = handle.props.corpus;
    let conceptId =
      concepts.find((c) => c.id === handle.props.initialConcept)?.id ??
      concepts[0]!.id;
    let screen =
      labScreens.find((s) => s.id === handle.props.initialScreen)?.id ??
      "matchday";
    let matchId = data.stats[0]?.matchId ?? data.matches[0]!.id;
    let dayId = data.matches.find((m) => m.id === matchId)!.dayId;
    let teamId = data.matches.find((m) => m.id === matchId)!.awayId;
    let selectedPlayer =
      data.players.find((p) => p.teamId === teamId)?.id ?? data.players[0]!.id;
    let playerTeam = "all";
    const update = () => handle.update();
    function change(nextConcept = conceptId, nextScreen = screen) {
      conceptId = nextConcept;
      screen = nextScreen;
      const url = new URL(location.href);
      url.searchParams.set("concept", conceptId);
      url.searchParams.set("screen", screen);
      history.replaceState(null, "", url);
      update();
    }
    function openMatch(m: LabMatch) {
      matchId = m.id;
      teamId = m.awayId;
      change(conceptId, "boxscore");
    }
    const team = (id: number) => data.teams.find((t) => t.id === id)!;
    const player = (id: number) => data.players.find((p) => p.id === id)!;
    function identity(id: number, match?: LabMatch) {
      const t = team(id);
      const result = match ? matchResult(match, id) : null;
      return (
        <span data-team-identity>
          {t.image ? <img src={t.image} alt="" width="44" height="32" /> : null}
          <span data-team-label>
            <strong>{t.name}</strong>
            {result ? (
              <small data-result={result}>{result}</small>
            ) : (
              <small>{t.abbreviation}</small>
            )}
          </span>
        </span>
      );
    }
    function board(m: LabMatch) {
      return (
        <BaseballScoreboard
          label="Innings · — means not recorded in this archive"
          innings={["1", "2", "3", "4", "5", "6", "7", "8", "9"]}
          teams={[m.awayId, m.homeId].map((id, i) => {
            const rows = data.stats.filter(
              (s) => s.matchId === m.id && s.teamId === id,
            );
            const t = team(id);
            return {
              id: String(id),
              name: t.name,
              image: t.image,
              innings: Array(9).fill(null),
              runs: i === 0 ? m.awayScore : m.homeScore,
              hits: recordedTotal(rows.map((r) => r.hits)),
              errors: recordedTotal(rows.map((r) => r.errors)),
            };
          })}
        />
      );
    }
    function statsTable(m: LabMatch, id: number) {
      const appearances = data.appearances
        .filter((a) => a.matchId === m.id && a.teamId === id)
        .toSorted((a, b) => a.battingOrder - b.battingOrder);
      return (
        <section data-lab-panel>
          <h3 data-panel-title>{team(id).name} · Batting & fielding</h3>
          <TableContainer
            role="region"
            aria-label={`${team(id).name} match statistics`}
            tabindex={0}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  {["Player", "PA", "H", "HR", "RBI", "PO", "A", "E"].map(
                    (h) => (
                      <TableHead>{h}</TableHead>
                    ),
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {appearances.map((a) => {
                  const p = player(a.playerId),
                    s = data.stats.find(
                      (entry) =>
                        entry.matchId === m.id && entry.playerId === p.id,
                    );
                  return (
                    <TableRow>
                      <TableHead scope="row">
                        <span data-player-identity>
                          {portrait(p, 24)}
                          <span>
                            {p.name}
                            <small>
                              {a.battingOrder}. {p.character} ·{" "}
                              {a.position ?? "Bench"}
                            </small>
                          </span>
                        </span>
                      </TableHead>
                      {[
                        s?.pa,
                        s?.hits,
                        s?.hr,
                        s?.rbi,
                        s?.putouts,
                        s?.assists,
                        s?.errors,
                      ].map((n) => (
                        <TableCell>{value(n)}</TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          {!appearances.length ? (
            <p data-panel-note>
              No frozen appearances recorded for this fixture.
            </p>
          ) : null}
        </section>
      );
    }
    function pitching(m: LabMatch) {
      const rows = data.stats.filter(
        (s) => s.matchId === m.id && s.ipWhole !== null,
      );
      return (
        <section data-lab-panel>
          <h3 data-panel-title>Pitching</h3>
          <TableContainer role="region" aria-label="Pitching" tabindex={0}>
            <Table>
              <TableHeader>
                <TableRow>
                  {["Pitcher", "IP", "SO", "ER"].map((h) => (
                    <TableHead>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow>
                    <TableHead scope="row">
                      {player(s.playerId).name}
                      <small>{team(s.teamId).abbreviation}</small>
                    </TableHead>
                    <TableCell>
                      {s.ipPartial === null
                        ? "—"
                        : `${s.ipWhole}.${s.ipPartial}`}
                    </TableCell>
                    <TableCell>{value(s.strikeouts)}</TableCell>
                    <TableCell>{value(s.er)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {!rows.length ? (
            <p data-panel-note>No pitching statistics recorded.</p>
          ) : null}
        </section>
      );
    }
    function field(id: number) {
      const roster = data.players.filter((p) => p.teamId === id && p.position);
      return (
        <section data-lab-panel>
          <h3 data-panel-title>Defensive positions</h3>
          <div data-field-wrap>
            <BaseballField
              label={`${team(id).name} defensive field`}
              players={roster.map((p) => ({
                id: String(p.id),
                name: p.name,
                position: p.position!,
                image: p.image,
              }))}
              selectedId={String(selectedPlayer)}
              onSelect={(playerId) => {
                selectedPlayer = Number(playerId);
                update();
              }}
            />
          </div>
          <p data-panel-note>
            Select a position to inspect its player. Field reflects the archived
            current lineup.
          </p>
        </section>
      );
    }
    function rosterCard(p: LabPlayer) {
      const owner = data.teams.find((t) => t.id === p.teamId);
      const captain = owner?.captainId === p.id;
      return (
        <button
          type="button"
          data-roster-card
          aria-label={`${p.name} · ${p.character ?? "Character not recorded"} · ${p.position ?? "Bench"} · ${owner?.abbreviation ?? "Free agent"}${captain ? " · Captain" : ""}${p.starred ? " · Starred" : ""} · Batting ${value(p.batting)}, fielding ${value(p.fielding)}, speed ${value(p.speed)}`}
          aria-pressed={selectedPlayer === p.id}
          mix={on("click", () => {
            selectedPlayer = p.id;
            update();
          })}
        >
          <span data-player-icon>
            {portrait(p, 32)}
            {captain ? (
              <span data-captain-mark aria-hidden="true">
                C
              </span>
            ) : null}
            {p.starred ? (
              <svg data-star-mark viewBox="0 0 20 20" aria-hidden="true">
                <path d="m10 1 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L1 7.6l6.2-.9Z" />
              </svg>
            ) : null}
          </span>
          <span data-roster-identity>
            <strong>{p.name}</strong>
            <small>
              {p.position ?? "Bench"} · {owner?.abbreviation ?? "Free"}
            </small>
          </span>
          <span data-card-stats>
            <span>
              BAT <b>{value(p.batting)}</b>
            </span>
            <span>
              FLD <b>{value(p.fielding)}</b>
            </span>
            <span>
              SPD <b>{value(p.speed)}</b>
            </span>
          </span>
        </button>
      );
    }
    return () => {
      const concept = concepts.find((c) => c.id === conceptId)!;
      const current = data.matches.find((m) => m.id === matchId)!;
      const roster = data.players.filter((p) => p.teamId === teamId);
      const inspected = player(selectedPlayer);
      return (
        <div
          data-sluggers-lab
          data-concept={conceptId}
          data-screen={screen}
          data-translucent={concept.parts.panelSurface ? true : undefined}
          mix={[
            themeStyles(concept.tokens),
            themeRoot,
            labPartStyles(concept.parts),
            baseballFieldStyles(concept.field),
            labStyles,
            originalBackdrop,
            concept.recipe,
          ]}
        >
          <header data-lab-toolbar>
            <a href="/explorer/button?theme=scorebook">@harrhy/ui</a>
            <h1>Sluggers cookoff</h1>
            <span>Private, read-only archive · no writes or uploads</span>
            <a
              href="https://sluggers-old.pi.jackharrhy.dev/kitchen-sink"
              target="_blank"
              rel="noreferrer"
            >
              Original reference
            </a>
          </header>
          <section data-lab-switcher aria-label="Design comparison">
            <nav aria-label="Design concepts">
              <span data-concept-family>
                Four glass studies · two reference anchors
              </span>
              {concepts.map((c) => (
                <Button
                  variant={conceptId === c.id ? "primary" : "secondary"}
                  aria-pressed={conceptId === c.id}
                  mix={on("click", () => change(c.id))}
                >
                  {c.name}
                </Button>
              ))}
            </nav>
            <div data-concept-description>
              <strong>{concept.name}</strong>
              <span>
                {concept.parent ? `Based on ${concept.parent} · ` : ""}
                {concept.summary}
              </span>
              <details>
                <summary>What changes / source notes</summary>
                <p>{concept.changes}</p>
                <p>
                  Reference: {concept.source}. One concept file owns its token
                  overrides and visual recipe. Four shared screen renderers and
                  the same archived data remain unchanged.
                </p>
                <p>
                  Shared: native controls, semantic table parts, BaseballField
                  and BaseballScoreboard. Local: page grids, match rows, roster
                  cards and experimental panel recipes. None of these concepts
                  is a stable public theme API.
                </p>
                <p>
                  Archive: {data.teams.length} teams, {data.players.length}{" "}
                  players, {data.matches.length} matches,{" "}
                  {data.appearances.length} frozen appearances,{" "}
                  {data.stats.length} stat rows. No user account fields
                  exported. Original per-inning runs were never recorded: inning
                  cells stay unknown, totals are real. Missing source portraits
                  remain letter markers, not invented replacements.
                </p>
              </details>
            </div>
          </section>
          <main data-lab-main>
            <header data-league-header>
              <div>
                <h2 data-lab-title>Lil Slug Crew</h2>
                <p>
                  Season archive ·{" "}
                  {labScreens.find((s) => s.id === screen)!.label}
                </p>
              </div>
              <nav aria-label="League screens">
                {labScreens.map((s) => (
                  <Button
                    variant={screen === s.id ? "primary" : "secondary"}
                    aria-pressed={screen === s.id}
                    mix={on("click", () => change(conceptId, s.id))}
                  >
                    {s.label}
                  </Button>
                ))}
              </nav>
            </header>
            {screen === "matchday" ? (
              <>
                <div data-view-heading>
                  <Heading level={3}>
                    Match day{" "}
                    {data.days.find((d) => d.id === dayId)?.sequence ?? dayId}
                  </Heading>
                  <Field id="lab-day" label="Match day">
                    <Select
                      key={`day-${dayId}`}
                      defaultValue={String(dayId)}
                      options={data.days.map((d) => ({
                        value: String(d.id),
                        label: d.name ?? `Match day ${d.sequence ?? d.id}`,
                      }))}
                      onValueChange={(id) => {
                        dayId = Number(id);
                        update();
                      }}
                    />
                  </Field>
                </div>
                <div data-content-grid>
                  <section data-lab-panel>
                    <h3 data-panel-title>Schedule & results</h3>
                    <div data-match-list>
                      {data.matches
                        .filter((m) => m.dayId === dayId)
                        .map((m) => (
                          <button
                            type="button"
                            data-match
                            mix={on("click", () => openMatch(m))}
                          >
                            <span data-match-meta>
                              <span>
                                {m.stadium ?? "Stadium not recorded"} ·{" "}
                                {m.state === "finished"
                                  ? "Final"
                                  : m.state === "live"
                                    ? "Live"
                                    : "Scheduled"}
                              </span>
                              <span data-match-action>Box score →</span>
                            </span>
                            <span data-match-teams>
                              {identity(m.awayId, m)}
                              {score(m)}
                              {identity(m.homeId, m)}
                            </span>
                          </button>
                        ))}
                    </div>
                  </section>
                  <section data-lab-panel>
                    <h3 data-panel-title>League standings</h3>
                    <TableContainer
                      role="region"
                      aria-label="Archive standings"
                      tabindex={0}
                    >
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {["Team", "W", "L", "RD"].map((s) => (
                              <TableHead>{s}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {standings(data).map((t, i) => (
                            <TableRow>
                              <TableHead scope="row">
                                <button
                                  type="button"
                                  data-team-link
                                  mix={on("click", () => {
                                    teamId = t.id;
                                    selectedPlayer = data.players.find(
                                      (p) => p.teamId === t.id,
                                    )!.id;
                                    change(conceptId, "lineup");
                                  })}
                                >
                                  <span>{i + 1}.</span>
                                  {t.image ? (
                                    <img
                                      src={t.image}
                                      alt=""
                                      width="54"
                                      height="26"
                                    />
                                  ) : null}
                                  <span>
                                    {t.name}
                                    <small>
                                      {t.conference ?? "Independent"}
                                    </small>
                                  </span>
                                </button>
                              </TableHead>
                              <TableCell data-positive>{t.wins}</TableCell>
                              <TableCell data-negative>{t.losses}</TableCell>
                              <TableCell
                                data-positive={
                                  t.difference > 0 ? true : undefined
                                }
                                data-negative={
                                  t.difference < 0 ? true : undefined
                                }
                              >
                                {t.difference > 0 ? "+" : ""}
                                {t.difference}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </section>
                </div>
              </>
            ) : null}
            {screen === "boxscore" ? (
              <>
                <div data-view-heading>
                  <Heading level={3}>
                    Match {current.id} ·{" "}
                    {current.state === "finished" ? "Final" : "Scheduled"}
                  </Heading>
                  <Field id="lab-match" label="Archived match">
                    <Select
                      key={`match-${matchId}`}
                      defaultValue={String(matchId)}
                      options={data.matches.map((m) => ({
                        value: String(m.id),
                        label: `${m.id}. ${team(m.awayId).abbreviation} at ${team(m.homeId).abbreviation}`,
                      }))}
                      onValueChange={(id) => {
                        matchId = Number(id);
                        update();
                      }}
                    />
                  </Field>
                </div>
                <section data-lab-panel>
                  <h3 data-panel-title>
                    {current.stadium ?? "Stadium not recorded"}
                  </h3>
                  <div data-score-banner>
                    {identity(current.awayId, current)}
                    {score(current)}
                    {identity(current.homeId, current)}
                  </div>
                  {board(current)}
                </section>
                <div data-two-columns>
                  {statsTable(current, current.awayId)}
                  {statsTable(current, current.homeId)}
                </div>
                {pitching(current)}
              </>
            ) : null}
            {screen === "lineup" ? (
              <>
                <div data-view-heading>
                  <Heading level={3}>{team(teamId).name}</Heading>
                  <Field id="lab-team" label="Team">
                    <Select
                      key={`team-${teamId}`}
                      defaultValue={String(teamId)}
                      options={data.teams.map((t) => ({
                        value: String(t.id),
                        label: t.name,
                      }))}
                      onValueChange={(id) => {
                        teamId = Number(id);
                        selectedPlayer = data.players.find(
                          (p) => p.teamId === teamId,
                        )!.id;
                        update();
                      }}
                    />
                  </Field>
                </div>
                <div data-content-grid>
                  <section data-lab-panel>
                    <h3 data-panel-title>Batting order</h3>
                    <ol data-batting-order>
                      {roster
                        .filter((p) => p.battingOrder !== null)
                        .toSorted((a, b) => a.battingOrder! - b.battingOrder!)
                        .map((p) => (
                          <li>
                            <button
                              type="button"
                              aria-pressed={selectedPlayer === p.id}
                              mix={on("click", () => {
                                selectedPlayer = p.id;
                                update();
                              })}
                            >
                              <b>{p.battingOrder}</b>
                              {portrait(p, 24)}
                              <span>
                                {p.name}
                                <small>{p.character}</small>
                              </span>
                              <strong>{p.position ?? "Bench"}</strong>
                            </button>
                          </li>
                        ))}
                    </ol>
                  </section>
                  {field(teamId)}
                </div>
                <section data-lab-panel>
                  <h3 data-panel-title>
                    Full roster · {roster.length} players
                  </h3>
                  <div data-roster-grid>{roster.map(rosterCard)}</div>
                </section>
                <section data-lab-panel aria-live="polite">
                  <h3 data-panel-title>{inspected.name}</h3>
                  <p data-panel-note>
                    {inspected.character} · {inspected.class ?? "Class unknown"}{" "}
                    · Batting {value(inspected.batting)} / Pitching{" "}
                    {value(inspected.pitching)} / Fielding{" "}
                    {value(inspected.fielding)} / Speed {value(inspected.speed)}
                    . Archived lineup only; selection does not edit positions.
                  </p>
                </section>
              </>
            ) : null}
            {screen === "players" ? (
              <>
                <div data-view-heading>
                  <Heading level={3}>
                    Player catalogue ·{" "}
                    {playerTeam === "all"
                      ? data.players.length
                      : data.players.filter(
                          (p) => p.teamId === Number(playerTeam),
                        ).length}
                  </Heading>
                  <Field id="lab-player-team" label="Roster filter">
                    <Select
                      defaultValue={playerTeam}
                      options={[
                        { value: "all", label: "All 120 players" },
                        ...data.teams.map((t) => ({
                          value: String(t.id),
                          label: t.name,
                        })),
                      ]}
                      onValueChange={(id) => {
                        playerTeam = id;
                        update();
                      }}
                    />
                  </Field>
                </div>
                <section data-lab-panel>
                  <h3 data-panel-title>
                    Character roster · same archived players in every concept
                  </h3>
                  <div data-roster-grid data-catalogue-grid>
                    {data.players
                      .filter(
                        (p) =>
                          playerTeam === "all" ||
                          p.teamId === Number(playerTeam),
                      )
                      .map(rosterCard)}
                  </div>
                </section>
                <p data-panel-note>
                  Selected: {inspected.name} · {inspected.character}. Missing
                  values are unknown, not zero.
                </p>
              </>
            ) : null}
            <footer data-lab-footer>
              <p>
                Private design comparison · archived league data, sanitized
                identities · original game artwork and fonts are not cleared for
                redistribution.
              </p>
              <details>
                <summary>Game screenshot reference gallery</summary>
                <div data-reference-grid>
                  {[
                    "batting-and-field-positions",
                    "match-stats",
                    "main-menu",
                  ].map((name) => (
                    <figure>
                      <img
                        src={`/__sluggers-lab/assets/reference-${name}.webp`}
                        alt={`Original Super Mario Sluggers ${name.replaceAll("-", " ")} screenshot`}
                      />
                      <figcaption>
                        {name.replaceAll("-", " ")} · owner-provided original
                        kitchen sink
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </details>
            </footer>
          </main>
        </div>
      );
    };
  },
);
const labStyles = css({
  minHeight: "100vh",
  color: "var(--hui-ink)",
  fontFamily: "var(--hui-font-ui)",
  fontSize: "0.875rem",
  lineHeight: "1.45",
  "& *": { boxSizing: "border-box" },
  "& ::selection": {
    background: "var(--hui-accent)",
    color: "var(--hui-on-accent)",
  },
  "& button, & a, & summary, & [tabindex]": {
    "&:focus-visible": {
      outline: "3px solid var(--hui-focus)",
      outlineOffset: "3px",
    },
  },
  "& button": { touchAction: "manipulation" },
  "& img": { maxWidth: "100%", objectFit: "contain" },
  "& small": {
    display: "block",
    color: "var(--hui-muted)",
    fontFamily: "var(--hui-font-ui)",
    fontWeight: 500,
    fontSize: "0.75rem",
  },
  "& [data-lab-toolbar]": {
    background: originalBlue[600],
    color: "#fff",
    padding: `${space(1.5)} ${space(3)}`,
    display: "flex",
    alignItems: "center",
    gap: space(2.5),
    flexWrap: "wrap",
    fontFamily: "system-ui,sans-serif",
    "& h1": { fontSize: "1.125rem", margin: 0 },
    "& a": { color: "#fff" },
    "& span": { fontSize: "0.75rem", marginLeft: "auto" },
  },
  "& [data-lab-switcher]": {
    padding: `${space(2)} ${space(3)}`,
    background: "var(--hui-surface)",
    borderBottom: "1px solid var(--hui-border)",
    "& nav": { display: "flex", gap: space(1), flexWrap: "wrap" },
    "& button[aria-pressed=true]": {
      background: "var(--hui-accent)",
      color: "var(--hui-on-accent)",
    },
  },
  "& [data-concept-family]": {
    width: "100%",
    gridColumn: "1 / -1",
    color: "var(--hui-muted)",
    fontSize: "0.75rem",
    marginTop: space(0.5),
  },
  "& [data-concept-description]": {
    marginTop: space(1.5),
    display: "flex",
    gap: space(1.5),
    flexWrap: "wrap",
    alignItems: "baseline",
    "& details": { width: "100%" },
    "& summary": {
      cursor: "pointer",
      fontSize: "0.75rem",
      color: "var(--hui-muted)",
    },
    "& p": { maxWidth: "85ch" },
  },
  "& [data-lab-main]": {
    maxWidth: "90rem",
    padding: `${space(3)} ${space(4)} ${space(6)}`,
    margin: "auto",
    display: "grid",
    gap: space(2.5),
  },
  "& [data-league-header]": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space(3),
    flexWrap: "wrap",
    "& nav": { display: "flex", gap: space(1), flexWrap: "wrap" },
    "& p": { margin: `${space(0.75)} 0 0` },
    "& button[aria-pressed=true]": {
      background: "var(--hui-accent)",
      color: "var(--hui-on-accent)",
    },
  },
  "& [data-lab-title]": {
    fontSize: "2.25rem",
    lineHeight: "1.2",
    margin: 0,
    fontFamily: "SluggersHappiness, sans-serif",
  },
  "& [data-view-heading]": {
    display: "flex",
    gap: space(2),
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    "& h3": { fontSize: "1.5rem" },
    "& button": { minWidth: "11.25rem" },
  },
  "& [data-content-grid]": {
    display: "grid",
    gridTemplateColumns:
      "var(--lab-content-columns,minmax(0,1.3fr) minmax(22.5rem,1fr))",
    gap: space(2.5),
    alignItems: "start",
  },
  "& [data-two-columns]": {
    display: "grid",
    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
    gap: space(2.5),
    alignItems: "start",
  },
  "& [data-lab-panel]": {
    minWidth: 0,
    overflow: "hidden",
    backgroundImage: "var(--lab-panel-image)",
    backgroundColor: "var(--lab-panel-surface)",
    position: "relative",
    isolation: "isolate",
    border: "var(--lab-panel-edge)",
    borderRadius: "var(--hui-panel-radius)",
  },
  "&[data-translucent] [data-lab-panel]::before": {
    content: '""',
    position: "absolute",
    inset: "0 0 auto",
    height: "min(6rem,100%)",
    borderRadius: "inherit",
    backdropFilter: "var(--lab-panel-filter)",
    maskImage: "linear-gradient(#000 55%, transparent)",
    pointerEvents: "none",
    zIndex: 0,
  },
  "&[data-translucent] [data-lab-panel] > *": {
    position: "relative",
    zIndex: 1,
  },
  "&[data-screen=players] [data-lab-panel]::before": { display: "none" },
  "&[data-screen=players][data-translucent] [data-panel-title]": {
    backdropFilter: "var(--lab-panel-filter)",
  },
  "@supports not (backdrop-filter: blur(0.0625rem))": {
    "&[data-translucent] [data-lab-panel]": {
      backgroundColor: "var(--hui-surface)",
      backgroundImage: "none",
    },
  },
  "@media (prefers-reduced-transparency: reduce)": {
    "&[data-translucent] [data-lab-panel]": {
      backgroundColor: "var(--hui-surface)",
      backgroundImage: "none",
      backdropFilter: "none",
    },
    "&[data-translucent] [data-panel-title]": { backdropFilter: "none" },
    "&[data-translucent] [data-lab-panel]::before": { display: "none" },
  },
  "& [data-panel-title]": {
    fontSize: "1.125rem",
    fontFamily: "var(--hui-font-display)",
    lineHeight: "1.4",
    margin: 0,
    padding: `${space(1.5)} ${space(2)}`,
    backgroundImage: "var(--lab-heading-image)",
    color: "var(--lab-heading-ink)",
  },
  "& [data-panel-note]": {
    padding: `${space(1.5)} ${space(2)}`,
    margin: 0,
    color: "var(--hui-muted)",
  },
  "& [data-match-list]": {
    display: "grid",
    gridTemplateColumns: "var(--lab-match-columns,minmax(0,1fr))",
    gap: space(1.25),
    padding: space(1.5),
  },
  "& [data-match]": {
    font: "inherit",
    color: "var(--hui-ink)",
    border: "1px solid var(--hui-border)",
    background: "var(--hui-table-surface)",
    borderRadius: "var(--lab-card-radius)",
    padding: space(1.75),
    textAlign: "left",
    cursor: "pointer",
    "&:hover": { background: "var(--hui-hover-surface)" },
  },
  "& [data-match-meta]": {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: space(1),
    fontSize: "0.75rem",
    color: "var(--hui-muted)",
    marginBottom: space(1.5),
  },
  "& [data-match-teams]": {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) 6.5rem minmax(0,1fr)",
    gap: space(1),
    alignItems: "center",
    "& > [data-team-identity]:first-child": {
      flexDirection: "row-reverse",
      textAlign: "right",
    },
  },
  "& [data-team-identity]": {
    display: "flex",
    alignItems: "center",
    gap: space(0.875),
    minWidth: 0,
    textAlign: "left",
    fontSize: "0.8125rem",
    "& img": { width: "2.5rem", height: "2rem", flexShrink: 0 },
    "& [data-team-label]": { minWidth: 0, overflowWrap: "anywhere" },
    "& strong": { display: "block", lineHeight: "1.3" },
    "& small": { fontSize: "0.6875rem", marginTop: space(0.375) },
  },
  "& [data-match-score]": {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) 0.75rem minmax(0,1fr)",
    alignItems: "baseline",
    gap: space(0.375),
    fontSize: "1.5rem",
    fontFamily: "var(--hui-font-display)",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    textAlign: "center",
  },
  "& [data-match-teams] [data-match-score]": { fontSize: "1.5rem" },
  "& [data-score-separator]": {
    color: "var(--hui-muted)",
    fontFamily: "var(--hui-font-ui)",
    fontSize: ".65em",
  },
  "& [data-result=Win]": { color: "var(--hui-success)" },
  "& [data-result=Loss]": { color: "var(--hui-danger)" },
  "& [data-result=Draw]": { color: "var(--hui-muted)" },
  "& small[data-result]": {
    display: "inline-block",
    padding: `${space(0.125)} ${space(0.5)}`,
    borderRadius: "0.1875rem",
    fontSize: "0.6875rem",
    lineHeight: "1.3",
  },
  "& small[data-result=Win]": { background: "#07483c" },
  "& small[data-result=Loss]": { background: "#64233d" },
  "& small[data-result=Draw]": { background: "var(--hui-elevated)" },
  "& [data-match-action]": {
    display: "block",
    fontSize: "0.6875rem",
    whiteSpace: "nowrap",
    flexShrink: 0,
    marginTop: 0,
    textAlign: "right",
    textDecoration: "underline",
    textUnderlineOffset: "0.1875rem",
  },
  "& table": { fontVariantNumeric: "tabular-nums" },
  "& [data-baseball-scoreboard] td:nth-last-child(3)": {
    color: "var(--hui-accent)",
    fontFamily: "var(--hui-font-display)",
    fontWeight: 700,
  },
  "& td, & thead th:not(:first-child)": {
    textAlign: "right",
    whiteSpace: "nowrap",
  },
  "& [data-positive]": {
    color: "var(--hui-success)",
    background: "rgb(0 69 58 / .28)",
    fontFamily: "var(--hui-font-display)",
  },
  "& [data-negative]": {
    color: "var(--hui-danger)",
    background: "rgb(77 16 43 / .28)",
    fontFamily: "var(--hui-font-display)",
  },
  "& [data-team-link]": {
    display: "flex",
    gap: space(1),
    alignItems: "center",
    background: "none",
    border: 0,
    color: "inherit",
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
    padding: 0,
    minHeight: "2.75rem",
    minWidth: "10.625rem",
    "& img": { width: "2.25rem", height: "1.5rem" },
  },
  "& [data-score-banner]": {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) 9rem minmax(0,1fr)",
    gap: space(2),
    alignItems: "center",
    padding: space(2.5),
    "& > strong": {
      fontSize: "2.25rem",
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap",
      color: "var(--hui-accent)",
      textShadow: "0 1px 1px rgb(0 0 0 / .1)",
    },
    "& img": { width: "4.5rem", height: "2.5rem" },
    "& > [data-team-identity]:first-child": {
      flexDirection: "row-reverse",
      textAlign: "right",
      justifyContent: "flex-start",
    },
  },
  "& [data-player-identity]": {
    display: "flex",
    gap: space(1),
    alignItems: "center",
    minWidth: "12.5rem",
    "& img": { flexShrink: 0 },
    "& small": { fontSize: "0.6875rem" },
  },
  "& [data-portrait-missing]": {
    width: "2.5rem",
    height: "2.5rem",
    display: "grid",
    placeItems: "center",
    background: "var(--hui-selected-surface)",
    borderRadius: "50%",
    flexShrink: 0,
  },
  "& [data-field-wrap]": {
    maxWidth: "35rem",
    margin: "auto",
    padding: space(1.5),
  },
  "& [data-batting-order]": {
    listStyle: "none",
    padding: `${space(1)} ${space(1.5)}`,
    margin: 0,
    display: "grid",
    gap: space(0.5),
    "& button": {
      display: "grid",
      gridTemplateColumns: "1.25rem 1.5rem minmax(0,1fr) 2rem",
      gap: space(1.25),
      width: "100%",
      alignItems: "center",
      border: "1px solid var(--hui-border)",
      borderRadius: "var(--hui-control-radius)",
      background: "var(--hui-table-surface)",
      padding: `${space(0.75)} ${space(1)}`,
      minHeight: "2.75rem",
      color: "var(--hui-ink)",
      font: "inherit",
      textAlign: "left",
      cursor: "pointer",
    },
    "& button[aria-pressed=true]": {
      background: "var(--hui-selected-surface)",
      color: "var(--hui-selected-ink)",
    },
  },
  "& [data-roster-grid]": {
    display: "grid",
    gridTemplateColumns: "repeat(6,minmax(0,1fr))",
    gap: space(1.25),
    padding: space(1.5),
  },
  "& [data-roster-card]": {
    border: "1px solid var(--hui-border)",
    font: "inherit",
    color: "var(--hui-ink)",
    padding: space(1.25),
    display: "grid",
    gridTemplateColumns: "2rem minmax(0,1fr)",
    gridTemplateRows: "minmax(2.5rem,1fr) auto",
    alignItems: "center",
    alignContent: "stretch",
    gap: space(0.875),
    textAlign: "left",
    cursor: "pointer",
    minWidth: 0,
    minHeight: "5.5rem",
    "&[aria-pressed=true]": {
      outline: "3px solid var(--hui-focus)",
      outlineOffset: "-3px",
    },
  },
  "& [data-player-icon]": {
    position: "relative",
    width: "2rem",
    height: "2rem",
    display: "grid",
    placeItems: "center",
    alignSelf: "center",
    "& img": { width: "2rem", height: "2rem", objectFit: "contain" },
  },
  "& [data-captain-mark]": {
    position: "absolute",
    top: "-0.25rem",
    left: "-0.25rem",
    background: "#73364a",
    color: "#fff",
    borderRadius: "50%",
    width: "0.8125rem",
    height: "0.8125rem",
    fontSize: "0.5625rem",
    lineHeight: "0.8125rem",
    textAlign: "center",
  },
  "& [data-star-mark]": {
    position: "absolute",
    top: "-0.25rem",
    right: "-0.3125rem",
    width: "0.8125rem",
    height: "0.8125rem",
    fill: "var(--hui-accent)",
    stroke: "#173866",
    strokeWidth: 1,
  },
  "& [data-roster-identity]": {
    minWidth: 0,
    overflowWrap: "anywhere",
    "& strong": { display: "block", fontSize: "0.8125rem", lineHeight: "1.3" },
    "& small": { fontSize: "0.6875rem", marginTop: space(0.375) },
  },
  "& [data-card-stats]": {
    gridColumn: "1 / -1",
    display: "grid",
    gridTemplateColumns: "repeat(3,minmax(0,1fr))",
    gap: space(0.75),
    paddingTop: space(0.625),
    borderTop: "1px solid rgb(164 204 244 / .25)",
    fontSize: "0.625rem",
    fontVariantNumeric: "tabular-nums",
    color: "var(--hui-muted)",
    "& > span": {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: space(0.375),
    },
    "& b": {
      color: "var(--hui-ink)",
      fontSize: "0.8125rem",
      fontFamily: "var(--hui-font-display)",
    },
  },
  "@media (min-width: 30.0625rem)": {
    "&[data-screen=players] [data-roster-grid]": {
      gridTemplateColumns: "repeat(auto-fill,minmax(9rem,1fr))",
    },
  },
  "& [data-lab-footer]": {
    padding: `${space(1.5)} ${space(2)}`,
    borderRadius: "var(--hui-panel-radius)",
    background: "var(--hui-surface)",
    color: "var(--hui-muted)",
    fontSize: "0.75rem",
    "& summary": { cursor: "pointer" },
  },
  "& [data-reference-grid]": {
    display: "grid",
    gridTemplateColumns: "repeat(3,minmax(0,1fr))",
    gap: space(2),
    "& figure": { margin: `${space(1.5)} 0` },
    "& img": { width: "100%", borderRadius: "0.5rem" },
  },
  "@media(max-width:62.5rem)": {
    "& [data-content-grid], & [data-two-columns]": {
      gridTemplateColumns: "minmax(0,1fr)",
    },
    "& [data-match-list]": { gridTemplateColumns: "repeat(2,minmax(0,1fr))" },
    "& [data-roster-grid]": { gridTemplateColumns: "repeat(4,minmax(0,1fr))" },
  },
  "@media(max-width:37.5rem)": {
    "--hui-control-height": "2.75rem",
    "--hui-button-height": "2.75rem",
    "& [data-lab-toolbar]": {
      padding: `${space(1.5)} ${space(2)}`,
      gap: space(1.25),
      "& span": { margin: 0, width: "100%" },
    },
    "& [data-lab-switcher]": { padding: space(1.5) },
    "& [data-lab-switcher] nav": {
      display: "grid",
      gridTemplateColumns: "repeat(2,minmax(0,1fr))",
    },
    "& [data-lab-main]": {
      padding: `${space(2.5)} ${space(1.5)} ${space(4)}`,
      gap: space(2),
    },
    "& [data-lab-title]": { fontSize: "1.875rem" },
    "& [data-league-header]": { gap: space(2) },
    "& [data-league-header] nav": {
      display: "grid",
      width: "100%",
      gridTemplateColumns: "repeat(2,minmax(0,1fr))",
    },
    "& [data-match-list]": { gridTemplateColumns: "minmax(0,1fr)" },
    "& [data-match-teams] [data-match-score]": { fontSize: "1.375rem" },
    "& [data-match-teams]": {
      gridTemplateColumns: "minmax(0,1fr) 6rem minmax(0,1fr)",
      gap: space(0.625),
    },
    "& [data-team-identity]": {
      flexDirection: "column",
      justifyContent: "center",
      textAlign: "center",
      gap: space(0.5),
      fontSize: "0.75rem",
      "& img": { width: "2rem", height: "1.625rem" },
    },
    "& [data-match-teams] > [data-team-identity]:first-child, & [data-score-banner] > [data-team-identity]:first-child":
      { flexDirection: "column", textAlign: "center" },
    "& [data-score-banner]": {
      gridTemplateColumns: "minmax(0,1fr) 6.5rem minmax(0,1fr)",
      gap: space(1),
      padding: `${space(2)} ${space(1.25)}`,
      "& > strong": { fontSize: "1.5rem" },
      "& img": { height: "2.5rem" },
    },
    "& [data-roster-grid]": {
      gridTemplateColumns: "repeat(2,minmax(0,1fr))",
      gap: space(1),
      padding: space(1),
    },
    "& [data-reference-grid]": { gridTemplateColumns: "minmax(0,1fr)" },
    "& [data-player-identity]": { minWidth: "10.625rem" },
  },
});
