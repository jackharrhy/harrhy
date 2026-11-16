import { css, on, ref, type Handle } from "remix/component";
import { themeRoot } from "@harrhy/ui/theme";
import {
  Badge,
  Button,
  Checkbox,
  Field,
  Heading,
  Inline,
  Notice,
  Stack,
  TableContainer,
  Table,
  TableCaption,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@harrhy/ui/native";
import { Dialog, Select } from "@harrhy/ui/interactive";
import {
  leagues,
  characters,
  positions,
  initialLineup,
  matchFixtures,
  lineupError,
  stat,
  innings,
} from "./fixtures.ts";
import {
  sluggersTheme,
  sheet,
  columns,
  number,
  heading,
  quiet,
} from "./theme.ts";

type View = "standings" | "match" | "lineup" | "import";
const views: { value: View; label: string }[] = [
  { value: "standings", label: "Standings" },
  { value: "match", label: "Box score" },
  { value: "lineup", label: "Lineup" },
  { value: "import", label: "Tracker review" },
];
const nav = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  "& button": {
    border: "1px solid #a9c5f4",
    color: "var(--hui-ink)",
    background: "transparent",
    padding: "10px 14px",
    borderRadius: "6px",
    font: "inherit",
    cursor: "pointer",
  },
  "& button[aria-pressed=true]": {
    background: "var(--hui-ink)",
    color: "#173f81",
  },
  "& button:focus-visible": {
    outline: "3px solid white",
    outlineOffset: "3px",
  },
});
const cellName = css({ textAlign: "left", minWidth: "180px" });
const fieldOptions = positions.map((value) => ({ value, label: value }));
const characterOptions = characters.map((value) => ({ value, label: value }));

export function SluggersScene(handle: Handle<{ theme: string }>) {
  let view: View = "standings";
  let leagueIndex = 0;
  let lineupTeamIndex = 0;
  let empty = false;
  let matchState = "incomplete";
  let matchDay = 2;
  let statsSide = "away";
  let slots = initialLineup();
  let captain = "Mario";
  let readonly = false;
  let saveState: "clean" | "dirty" | "saving" | "saved" | "error" = "clean";
  let simulateFailure = false;
  let error = "";
  let announcement = "";
  let awayMapping = "";
  let missingMapping = "";
  let duplicate = true;
  let acknowledged = false;
  let confirming = false;
  let publishState: "review" | "publishing" | "published" | "error" = "review";
  let root: HTMLElement | undefined;
  let resetKey = 0;
  const update = () => handle.update();
  function reset() {
    slots = initialLineup();
    captain = "Mario";
    statsSide = "away";
    saveState = "clean";
    error = "";
    announcement = "";
    awayMapping = "";
    missingMapping = "";
    acknowledged = false;
    publishState = "review";
    confirming = false;
    resetKey++;
  }
  function changeView(next: View) {
    view = next;
    announcement = "";
    update();
  }
  function move(index: number, delta: number) {
    const next = index + delta;
    if (next < 0 || next >= slots.length || readonly || saveState === "saving")
      return;
    const character = slots[index]!.character;
    [slots[index], slots[next]] = [slots[next]!, slots[index]!];
    saveState = "dirty";
    error = "";
    announcement = `${character} moved to slot ${next + 1}.`;
    update();
    handle.queueTask(() =>
      root
        ?.querySelector<HTMLButtonElement>(
          `[data-character="${character}"] [data-direction="${next === 0 ? 1 : next === 8 ? -1 : delta}"]`,
        )
        ?.focus(),
    );
  }
  function dirty() {
    saveState = "dirty";
    error = "";
    update();
  }
  async function save({ signal }: { signal: AbortSignal }) {
    error = lineupError(slots, captain) ?? "";
    if (error) {
      update();
      handle.queueTask(() =>
        root?.querySelector<HTMLElement>("[data-lineup-error]")?.focus(),
      );
      return;
    }
    saveState = "saving";
    update();
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (signal.aborted) return;
    if (simulateFailure) {
      saveState = "error";
      error =
        "Could not save the demo lineup. Your changes are still here. Turn off simulated failure and retry.";
    } else {
      saveState = "saved";
      announcement = "Lineup saved in this preview only.";
    }
    update();
  }
  async function publish({ signal }: { signal: AbortSignal }) {
    publishState = "publishing";
    update();
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (signal.aborted) return;
    if (simulateFailure) {
      publishState = "error";
      announcement =
        "Simulated publication failed. Nothing was replaced; retry is available.";
    } else {
      publishState = "published";
      confirming = false;
      announcement =
        "Simulation published. No real result or standings changed.";
    }
    update();
  }
  function scoresTable(pitching = false) {
    const incomplete = matchState === "incomplete";
    const match = matchFixtures[leagueIndex]!;
    const appearances =
      statsSide === "away" ? match.awayAppearances : match.homeAppearances;
    return (
      <TableContainer
        role="region"
        aria-label={pitching ? "Pitching statistics" : "Batting statistics"}
        tabindex={0}
      >
        <Table>
          <TableCaption>
            {pitching
              ? "Pitching · innings shown as completed innings + outs"
              : "Batting · — means not recorded; 0 is a recorded zero"}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Character</TableHead>
              {(pitching
                ? ["IP", "H", "BB", "SO"]
                : ["AB", "H", "HR", "RBI"]
              ).map((label) => (
                <TableHead mix={number}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(pitching ? appearances.slice(0, 2) : appearances).map(
              (slot, i) => (
                <TableRow>
                  <TableHead scope="row" mix={cellName}>
                    {slot.character}
                    {i === 0 ? " · Captain" : ""}
                  </TableHead>
                  {(pitching
                    ? [
                        innings(i === 0 ? 12 : 2),
                        stat(i === 0 ? 2 : incomplete ? null : 1),
                        "0",
                        "3",
                      ]
                    : [
                        stat(incomplete && i === 1 ? null : 4),
                        stat(incomplete && i === 1 ? null : i === 0 ? 0 : 1),
                        stat(incomplete && i === 1 ? null : 0),
                        stat(incomplete && i === 1 ? null : 0),
                      ]
                  ).map((value) => (
                    <TableCell mix={number}>{value}</TableCell>
                  ))}
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }
  return () => {
    const league = leagues[leagueIndex]!;
    const match = matchFixtures[leagueIndex]!;
    const team = league.teams[0];
    const opponent = league.teams[1];
    const busy = saveState === "saving";
    const canConfirm =
      awayMapping === team.id &&
      missingMapping !== "" &&
      (!duplicate || acknowledged);
    return (
      <section
        aria-label="Sluggers fixture"
        data-sluggers
        data-league-id={league.id}
        data-season-id={league.seasonId}
        data-match-id={`${league.id}-match-${view === "match" ? matchDay : 3}`}
        mix={[
          sluggersTheme,
          themeRoot,
          css({
            borderRadius: "8px",
            padding: "20px",
            minWidth: 0,
            overflowWrap: "anywhere",
            color: "var(--hui-ink)",
            backgroundImage:
              "radial-gradient(circle, rgb(255 255 255 / 0.025) 40%, transparent 21%), radial-gradient(circle, rgb(255 255 255 / 0.025) 40%, transparent 21%)",
            backgroundSize: "112px 112px",
            backgroundPosition: "0 0, 56px 56px",
            "& *": { boxSizing: "border-box" },
            "& ::selection": {
              background: "var(--hui-accent)",
              color: "var(--hui-on-accent)",
            },
            "& [role=region]": {
              borderRadius: "8px",
              scrollbarColor: "var(--hui-control-border) var(--hui-elevated)",
            },
            "& table": { minWidth: "480px" },
            "& th[scope=rowgroup]": {
              background: "var(--hui-table-header)",
              color: "var(--hui-muted)",
              fontSize: "12px",
            },
            "& th[scope=row]": {
              fontFamily: "SluggersRodin, system-ui, sans-serif",
            },
            "@media(max-width: 600px)": {
              padding: "16px 10px",
              "--hui-control-height": "44px",
              "--hui-button-height": "44px",
            },
          }),
          ref((node) => {
            root = node;
          }),
        ]}
      >
        <Stack mix={css({ gap: "20px" })}>
          <Inline>
            <Badge
              mix={css({ "--hui-muted": "#ffffff", "--hui-border": "#a9c5f4" })}
            >
              Synthetic league preview
            </Badge>
            <span mix={css({ color: "var(--hui-ink)", fontSize: "13px" })}>
              No accounts, uploads or backend · reload resets changes
            </span>
          </Inline>
          <div
            mix={css({
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "16px",
              flexWrap: "wrap",
            })}
          >
            <div>
              <Heading
                level={2}
                mix={css({
                  fontFamily:
                    "SluggersHappiness, SluggersBolt, system-ui, sans-serif",
                  fontSize: "36px",
                  margin: 0,
                  color: "var(--hui-ink)",
                  lineHeight: "1.2",
                })}
              >
                Sluggers
              </Heading>
              <p mix={css({ margin: "8px 0 0", color: "var(--hui-muted)" })}>
                {league.name} / {league.season}
              </p>
            </div>
            <div
              mix={css({
                background: "var(--hui-table-header)",
                color: "var(--hui-ink)",
                padding: "8px 12px",
                borderRadius: "8px",
              })}
            >
              <Field id="sluggers-league" label="League">
                <Select
                  key="league"
                  defaultValue={league.id}
                  disabled={busy}
                  options={leagues.map((l) => ({ value: l.id, label: l.name }))}
                  onValueChange={(value) => {
                    leagueIndex = leagues.findIndex((l) => l.id === value);
                    empty = false;
                    lineupTeamIndex = 0;
                    reset();
                    update();
                  }}
                />
              </Field>
            </div>
          </div>
          <nav aria-label="Sluggers examples" mix={nav}>
            {views.map((item) => (
              <button
                type="button"
                disabled={busy}
                aria-pressed={view === item.value}
                mix={on("click", () => changeView(item.value))}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div mix={sheet}>
            {view === "standings" ? (
              <Stack mix={css({ gap: "20px" })}>
                <Inline>
                  <Heading level={3} mix={heading}>
                    League standings
                  </Heading>
                  <Button
                    mix={on("click", () => {
                      empty = !empty;
                      update();
                    })}
                  >
                    {empty ? "Show played season" : "Show empty season"}
                  </Button>
                </Inline>
                <div mix={columns}>
                  <section aria-label="Conference standings">
                    <Heading level={4}>Conference standings</Heading>
                    {empty ? (
                      <Notice>
                        No completed matches this season. The next fixture is
                        still scheduled.
                      </Notice>
                    ) : (
                      <TableContainer
                        role="region"
                        aria-label={`${league.name} standings`}
                        tabindex={0}
                      >
                        <Table>
                          <TableCaption>
                            {league.season} · W wins, L losses, +/− win-loss
                            difference, RD run differential
                          </TableCaption>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Team / manager</TableHead>
                              {["W", "L", "+/−", "RD"].map((s) => (
                                <TableHead mix={number}>{s}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          {Array.from(
                            new Set(league.teams.map((t) => t.conference)),
                          ).map((conference) => (
                            <TableBody>
                              <TableRow>
                                <TableHead scope="rowgroup" colSpan={5}>
                                  {conference} conference
                                </TableHead>
                              </TableRow>
                              {league.teams
                                .filter((t) => t.conference === conference)
                                .map((row) => (
                                  <TableRow>
                                    <TableHead scope="row" mix={cellName}>
                                      <button
                                        type="button"
                                        mix={[
                                          css({
                                            border: 0,
                                            background: "transparent",
                                            color: "var(--hui-ink)",
                                            padding: 0,
                                            font: "inherit",
                                            textAlign: "left",
                                            textDecoration: "underline",
                                            textUnderlineOffset: "3px",
                                            cursor: "pointer",
                                          }),
                                          on("click", () => {
                                            lineupTeamIndex =
                                              league.teams.findIndex(
                                                (t) => t.id === row.id,
                                              );
                                            reset();
                                            changeView("lineup");
                                          }),
                                        ]}
                                      >
                                        {row.name}
                                      </button>
                                      <div
                                        mix={css({
                                          color: "var(--hui-muted)",
                                          fontSize: "12px",
                                          display: "inline",
                                          marginLeft: "8px",
                                          fontFamily:
                                            "SluggersCezanne, system-ui, sans-serif",
                                        })}
                                      >
                                        {row.manager}
                                      </div>
                                    </TableHead>
                                    {[
                                      row.wins,
                                      row.losses,
                                      row.wins - row.losses,
                                      row.rd,
                                    ].map((value, i) => (
                                      <TableCell
                                        mix={[
                                          number,
                                          css({
                                            color:
                                              i === 0
                                                ? "var(--hui-success)"
                                                : i === 1
                                                  ? "var(--hui-danger)"
                                                  : value > 0
                                                    ? "var(--hui-success)"
                                                    : value < 0
                                                      ? "var(--hui-danger)"
                                                      : "var(--hui-muted)",
                                          }),
                                        ]}
                                      >
                                        {i > 1 && value > 0 ? "+" : ""}
                                        {value}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                ))}
                            </TableBody>
                          ))}
                        </Table>
                      </TableContainer>
                    )}
                  </section>
                  <section aria-label="Upcoming fixtures">
                    <Heading level={4}>Next on the diamond</Heading>
                    <p mix={quiet}>Match day 3 · Scheduled</p>
                    <Heading
                      level={5}
                      mix={css({ fontSize: "20px", margin: "12px 0" })}
                    >
                      {team.name}
                      <br />
                      at {opponent.name}
                    </Heading>
                    <p mix={quiet}>Mushroom stadium · Saturday, 19:00 UTC</p>
                    <Button
                      mix={on("click", () => {
                        matchState = "scheduled";
                        matchDay = 3;
                        changeView("match");
                      })}
                    >
                      View match
                    </Button>
                  </section>
                </div>
                <Notice>
                  Both leagues have a Fireballs team. Switching league changes
                  the season, team IDs and match context; this preview is not an
                  authorization system.
                </Notice>
              </Stack>
            ) : null}
            {view === "match" ? (
              <Stack mix={css({ gap: "20px" })}>
                <Inline>
                  <Heading level={3} mix={heading}>
                    Match day {matchDay}
                  </Heading>
                  <Field id="sluggers-result" label="Result scenario">
                    <Select
                      defaultValue={matchState}
                      key={`result-${matchState}`}
                      options={[
                        { value: "scheduled", label: "Scheduled" },
                        { value: "final", label: "Final · complete capture" },
                        {
                          value: "incomplete",
                          label: "Final · incomplete capture",
                        },
                      ]}
                      onValueChange={(value) => {
                        matchState = value;
                        update();
                      }}
                    />
                  </Field>
                </Inline>
                <div
                  mix={css({
                    background: "var(--hui-table-header)",
                    borderRadius: "10px",
                    padding: "16px",
                    textAlign: "center",
                  })}
                >
                  <Badge>
                    {matchState === "scheduled" ? "Scheduled" : "Final"}
                  </Badge>
                  <div
                    mix={css({
                      display: "grid",
                      gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)",
                      gap: "12px",
                      alignItems: "center",
                      marginTop: "16px",
                    })}
                  >
                    <div>
                      {team.name}
                      <p mix={quiet}>Away</p>
                    </div>
                    <strong
                      mix={css({
                        fontFamily: "SluggersCezanne, sans-serif",
                        color: "var(--hui-accent)",
                        fontSize: "36px",
                        fontVariantNumeric: "tabular-nums",
                      })}
                    >
                      {matchState === "scheduled"
                        ? "vs"
                        : `${match.awayScore} – ${match.homeScore}`}
                    </strong>
                    <div>
                      {opponent.name}
                      <p mix={quiet}>Home</p>
                    </div>
                  </div>
                </div>
                {matchState === "scheduled" ? (
                  <Notice>
                    No result recorded. Statistics appear after a reviewed
                    result is published.
                  </Notice>
                ) : (
                  <>
                    <Notice>
                      {matchState === "incomplete"
                        ? "Incomplete capture: the sample tracker stopped early. Missing statistics stay unknown, not zero."
                        : "Complete sample capture. Result and evidence completeness are separate states."}
                    </Notice>
                    <Field id="sluggers-stats-side" label="Statistics team">
                      <Select
                        defaultValue={statsSide}
                        options={[
                          { value: "away", label: `${team.name} · Away` },
                          { value: "home", label: `${opponent.name} · Home` },
                        ]}
                        onValueChange={(value) => {
                          statsSide = value;
                          update();
                        }}
                      />
                    </Field>
                    <Heading level={4}>
                      {statsSide === "away" ? team.name : opponent.name} ·
                      frozen match appearances
                    </Heading>
                    <p mix={quiet}>
                      Recorded at match start · {match.captureId}. Editing the
                      team lineup does not change these appearances.
                    </p>
                    <div
                      mix={css({
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                      })}
                    >
                      {(statsSide === "away"
                        ? match.awayAppearances
                        : match.homeAppearances
                      ).map((s, i) => (
                        <span
                          mix={css({
                            padding: "8px 10px",
                            background: "var(--hui-table-header)",
                            borderRadius: "6px",
                          })}
                        >
                          {i + 1}. {s.character} · {s.position}
                        </span>
                      ))}
                    </div>
                    {scoresTable()}
                    {scoresTable(true)}
                  </>
                )}
              </Stack>
            ) : null}
            {view === "lineup" ? (
              <Stack mix={css({ gap: "20px" })}>
                <Inline>
                  <Heading level={3} mix={heading}>
                    {league.teams[lineupTeamIndex]!.name} lineup
                  </Heading>
                  <Badge>
                    {readonly
                      ? "Read only"
                      : saveState === "clean"
                        ? "Current lineup"
                        : saveState === "dirty"
                          ? "Unsaved changes"
                          : saveState === "saving"
                            ? "Saving…"
                            : saveState === "saved"
                              ? "Saved locally"
                              : "Save failed"}
                  </Badge>
                </Inline>
                <Inline>
                  <Button
                    disabled={busy}
                    mix={on("click", () => {
                      readonly = !readonly;
                      update();
                    })}
                  >
                    {readonly
                      ? "Switch to team manager"
                      : "Preview signed-out access"}
                  </Button>
                  <Button
                    disabled={busy}
                    mix={on("click", () => {
                      simulateFailure = !simulateFailure;
                      update();
                    })}
                  >
                    {simulateFailure
                      ? "Disable simulated failure"
                      : "Simulate save failure"}
                  </Button>
                </Inline>
                {readonly ? (
                  <Notice>
                    Sign in as this team's manager to edit. Controls are
                    read-only in this scenario.
                  </Notice>
                ) : null}
                <Field id="sluggers-captain" label="Captain">
                  <Select
                    key={`captain-${resetKey}`}
                    defaultValue={captain}
                    disabled={readonly || busy}
                    options={characterOptions}
                    onValueChange={(value) => {
                      captain = value;
                      dirty();
                    }}
                  />
                </Field>
                {error ? (
                  <div data-lineup-error tabindex={-1}>
                    <Notice role="alert">{error}</Notice>
                  </div>
                ) : null}
                <div mix={columns}>
                  <ol
                    aria-label="Batting order"
                    mix={css({
                      listStyle: "none",
                      padding: 0,
                      margin: 0,
                      display: "grid",
                      gap: "8px",
                    })}
                  >
                    {slots.map((slot, i) => (
                      <li
                        key={slot.character}
                        data-character={slot.character}
                        mix={css({
                          display: "grid",
                          gridTemplateColumns:
                            "36px minmax(100px,1fr) 96px auto",
                          alignItems: "center",
                          gap: "12px",
                          padding: "8px 12px",
                          background: "var(--hui-table-header)",
                          borderRadius: "8px",
                          "@media(max-width:600px)": {
                            gridTemplateColumns: "28px minmax(0,1fr) 90px",
                            gap: "8px",
                          },
                        })}
                      >
                        <strong mix={number}>{i + 1}</strong>
                        <span>
                          {slot.character}
                          {captain === slot.character ? (
                            <span mix={quiet}> · Captain</span>
                          ) : null}
                        </span>
                        <Select
                          aria-label={`${slot.character} defense`}
                          key={`${slot.character}-${resetKey}`}
                          defaultValue={slot.position}
                          disabled={readonly || busy}
                          options={fieldOptions}
                          onValueChange={(value) => {
                            slot.position = value;
                            dirty();
                          }}
                        />
                        <div
                          mix={css({
                            display: "flex",
                            gap: "6px",
                            "@media(max-width:600px)": { gridColumn: "2 / -1" },
                          })}
                        >
                          <Button
                            data-direction="-1"
                            aria-label={`Move ${slot.character} up`}
                            disabled={i === 0 || readonly || busy}
                            mix={on("click", () => move(i, -1))}
                          >
                            Up
                          </Button>
                          <Button
                            data-direction="1"
                            aria-label={`Move ${slot.character} down`}
                            disabled={i === 8 || readonly || busy}
                            mix={on("click", () => move(i, 1))}
                          >
                            Down
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <section
                    aria-label="Defensive field"
                    mix={css({ textAlign: "center" })}
                  >
                    <Heading level={4}>Defensive field</Heading>
                    <p mix={quiet}>
                      Text markers · no original character artwork
                    </p>
                    <div
                      mix={css({
                        position: "relative",
                        width: "100%",
                        maxWidth: "360px",
                        aspectRatio: "1",
                        margin: "12px auto",
                        "&::before": {
                          content: "''",
                          position: "absolute",
                          inset: "22%",
                          background: "rgb(196 215 247 / 0.22)",
                          border: "1px solid rgb(196 215 247 / 0.3)",
                          transform: "rotate(45deg)",
                        },
                      })}
                    >
                      {slots.map((slot) => {
                        const point: Record<string, [number, number]> = {
                          P: [50, 52],
                          C: [50, 90],
                          "1B": [78, 70],
                          "2B": [69, 36],
                          "3B": [22, 70],
                          SS: [31, 36],
                          LF: [15, 17],
                          CF: [50, 8],
                          RF: [85, 17],
                        };
                        const [x, y] = point[slot.position] ?? [50, 50];
                        return (
                          <div
                            style={{ left: `${x}%`, top: `${y}%` }}
                            mix={css({
                              position: "absolute",
                              transform: "translate(-50%, -50%)",
                              width: "30%",
                              fontSize: "12px",
                              lineHeight: "1.4",
                            })}
                          >
                            <strong
                              mix={css({
                                display: "block",
                                color: "var(--hui-accent)",
                              })}
                            >
                              {slot.position}
                            </strong>
                            <span>{slot.character}</span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
                <p mix={quiet}>
                  Nine different characters, one captain and each defensive
                  position exactly once. Keyboard: Tab to Up or Down, then
                  Enter.
                </p>
                <Inline>
                  <Button
                    variant="primary"
                    disabled={readonly}
                    action={save}
                    pendingLabel="Saving lineup…"
                    onError={() => {
                      saveState = "error";
                      error =
                        "Could not save the demo lineup. Retry your changes.";
                      update();
                    }}
                  >
                    Save lineup
                  </Button>
                  <Button
                    disabled={busy}
                    mix={on("click", () => {
                      reset();
                      update();
                    })}
                  >
                    Reset lineup
                  </Button>
                </Inline>
              </Stack>
            ) : null}
            {view === "import" ? (
              <Stack mix={css({ gap: "20px" })}>
                <Heading level={3} mix={heading}>
                  Review tracker result
                </Heading>
                <Notice>
                  Mock parsed export · no upload, parser or real publication.
                  Sample workbook sections: Game Info, Stats, Pitching.
                </Notice>
                <div>
                  <Heading level={4}>
                    {team.name} at {opponent.name}
                  </Heading>
                  <p mix={quiet}>
                    {league.name} / {league.season} / Scheduled match 3 · Home:{" "}
                    {opponent.name}
                  </p>
                </div>
                <div mix={columns}>
                  <Field
                    id="sluggers-away"
                    label="Map away brand: Custom Red"
                    description="Branding is not a durable team identifier."
                  >
                    <Select
                      key={`away-${resetKey}-${league.id}`}
                      defaultValue={awayMapping}
                      placeholder="Choose scheduled away team"
                      options={league.teams.map((t) => ({
                        value: t.id,
                        label: t.name,
                      }))}
                      onValueChange={(value) => {
                        awayMapping = value;
                        publishState = "review";
                        update();
                      }}
                    />
                  </Field>
                  <Field
                    id="sluggers-character"
                    label="Resolve character: Green brother"
                    description="Eight of nine sample characters already mapped."
                  >
                    <Select
                      key={`mapping-${resetKey}`}
                      defaultValue={missingMapping}
                      placeholder="Choose character"
                      options={[
                        { value: "luigi", label: "Luigi" },
                        {
                          value: "mario",
                          label: "Mario · already mapped",
                          disabled: true,
                        },
                      ]}
                      onValueChange={(value) => {
                        missingMapping = value;
                        publishState = "review";
                        update();
                      }}
                    />
                  </Field>
                </div>
                {awayMapping && awayMapping !== team.id ? (
                  <Notice role="alert">
                    Away team cannot be the scheduled home team. Choose{" "}
                    {team.name}.
                  </Notice>
                ) : null}
                <Notice>
                  Incomplete capture: Luigi's batting totals are not recorded.
                  Existing zeros remain zeros. Bobbles are not mapped to errors.
                </Notice>
                <TableContainer
                  role="region"
                  aria-label="Import statistics preview"
                  tabindex={0}
                >
                  <Table>
                    <TableCaption>
                      Preview only · publication is a separate confirmation
                    </TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Character</TableHead>
                        <TableHead mix={number}>AB</TableHead>
                        <TableHead mix={number}>H</TableHead>
                        <TableHead mix={number}>HR</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableHead scope="row">Mario</TableHead>
                        <TableCell mix={number}>4</TableCell>
                        <TableCell mix={number}>0</TableCell>
                        <TableCell mix={number}>0</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableHead scope="row">
                          {missingMapping ? "Luigi" : "Unresolved character"}
                        </TableHead>
                        <TableCell mix={number}>—</TableCell>
                        <TableCell mix={number}>—</TableCell>
                        <TableCell mix={number}>—</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
                <Inline>
                  <Button
                    mix={on("click", () => {
                      duplicate = !duplicate;
                      acknowledged = false;
                      update();
                    })}
                  >
                    {duplicate
                      ? "Use new-result scenario"
                      : "Use replacement scenario"}
                  </Button>
                  <Button
                    mix={on("click", () => {
                      simulateFailure = !simulateFailure;
                      update();
                    })}
                  >
                    {simulateFailure
                      ? "Disable simulated failure"
                      : "Simulate publication failure"}
                  </Button>
                </Inline>
                {duplicate ? (
                  <Notice>
                    <strong>Replacement warning.</strong> This sample match
                    already has a published result. Previous evidence would be
                    retained.
                    <p>
                      <label
                        mix={css({
                          display: "flex",
                          gap: "10px",
                          alignItems: "start",
                          minHeight: "24px",
                          cursor: "pointer",
                        })}
                      >
                        <Checkbox
                          checked={acknowledged}
                          mix={on("change", (event) => {
                            acknowledged = (event.target as HTMLInputElement)
                              .checked;
                            update();
                          })}
                        />{" "}
                        I understand this replaces the existing result for{" "}
                        {team.name} at {opponent.name}.
                      </label>
                    </p>
                  </Notice>
                ) : null}
                {!canConfirm ? (
                  <p mix={quiet}>
                    Resolve both mappings
                    {duplicate ? " and acknowledge replacement" : ""} to
                    continue.
                  </p>
                ) : null}
                {publishState === "published" ? (
                  <Notice role="status">
                    Simulation published. No real match or standings changed.
                  </Notice>
                ) : null}
                <Button
                  variant="primary"
                  disabled={!canConfirm}
                  aria-disabled={publishState === "published" || undefined}
                  mix={on("click", () => {
                    if (publishState === "published") return;
                    confirming = true;
                    update();
                  })}
                >
                  Review {duplicate ? "replacement" : "publication"}…
                </Button>
                <Dialog
                  open={confirming}
                  title={
                    duplicate
                      ? "Confirm simulated replacement"
                      : "Confirm simulated publication"
                  }
                  initialFocus="[data-cancel]"
                  onClose={() => {
                    if (publishState !== "publishing") {
                      confirming = false;
                      update();
                    }
                  }}
                >
                  <Stack>
                    <p>
                      {league.name} / {league.season}
                      <br />
                      <strong>
                        {team.name} (away) at {opponent.name} (home)
                      </strong>
                    </p>
                    <p>
                      Sample final: {match.awayScore}–{match.homeScore}.
                      Incomplete capture; unknown statistics stay unknown.{" "}
                      {duplicate
                        ? "The existing result will be replaced in this simulation."
                        : "This sample result will be marked published locally."}
                    </p>
                    {publishState === "error" ? (
                      <Notice role="alert">
                        Simulated publication failed. Nothing was replaced. Turn
                        off simulated failure outside this dialog before
                        retrying.
                      </Notice>
                    ) : null}
                    <Inline>
                      <Button
                        data-cancel
                        disabled={publishState === "publishing"}
                        mix={on("click", () => {
                          confirming = false;
                          update();
                        })}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        action={publish}
                        pendingLabel="Simulating…"
                        onError={() => {
                          publishState = "error";
                          update();
                        }}
                      >
                        Confirm simulation
                      </Button>
                    </Inline>
                  </Stack>
                </Dialog>
              </Stack>
            ) : null}
          </div>
          <p
            role="status"
            aria-live="polite"
            mix={css({ minHeight: "24px", margin: 0, color: "var(--hui-ink)" })}
          >
            {announcement ||
              "Interactive examples use local fixture data. No production connections."}
          </p>
        </Stack>
      </section>
    );
  };
}
