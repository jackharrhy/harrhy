import { css, on, type Handle } from "remix/component";
import { focusStyles } from "./recipes.ts";

export interface BaseballFieldPaint {
  grass: string;
  infield: string;
  line: string;
  marker: string;
  portraitSize: string;
}
export function baseballFieldStyles(paint: BaseballFieldPaint) {
  return css({
    "--baseball-grass": paint.grass,
    "--baseball-infield": paint.infield,
    "--baseball-line": paint.line,
    "--baseball-marker": paint.marker,
    "--baseball-portrait-size": paint.portraitSize,
  });
}

export type BaseballPosition =
  | "P"
  | "C"
  | "1B"
  | "2B"
  | "3B"
  | "SS"
  | "LF"
  | "CF"
  | "RF";
export interface FieldPlayer {
  id: string;
  name: string;
  position: BaseballPosition;
  image?: string | null;
  detail?: string;
}
export interface BaseballFieldProps {
  label: string;
  players: readonly FieldPlayer[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}
const diagonal = 90 / Math.sqrt(2);
const origin = { x: 230, y: 350 };
const project = (x: number, y: number) => ({
  x: origin.x + x,
  y: origin.y - y,
});
export const baseballDiamond = {
  width: 460,
  height: 400,
  home: project(0, 0),
  first: project(diagonal, diagonal),
  second: project(0, 2 * diagonal),
  third: project(-diagonal, diagonal),
  rubber: project(0, 60.5),
} as const;
const positions: Record<BaseballPosition, { x: number; y: number }> = {
  LF: project(-145, 210),
  CF: project(0, 265),
  RF: project(145, 210),
  SS: project(-55, 135),
  "2B": project(55, 135),
  "3B": project(-90, 75),
  P: baseballDiamond.rubber,
  "1B": project(90, 75),
  C: project(0, -18),
};
export function BaseballField(handle: Handle<BaseballFieldProps>) {
  return () => {
    const { home, first, second, third, rubber, width, height } =
      baseballDiamond;
    const infield = [home, first, second, third]
      .map((p) => `${p.x},${p.y}`)
      .join(" ");
    return (
      <div
        role="group"
        aria-label={handle.props.label}
        mix={fieldWrapperStyles}
        data-baseball-field-wrapper
      >
        <div mix={fieldStyles} data-baseball-field>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            aria-hidden="true"
            focusable="false"
            mix={css({
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
            })}
          >
            <path
              d="M230 350 L17.867966 137.867966 A300 300 0 0 1 442.132034 137.867966 Z"
              fill="var(--baseball-grass, #34795a)"
              stroke="var(--baseball-line, #e5f5d5)"
              strokeWidth="2"
            />
            <polygon
              points={infield}
              fill="var(--baseball-infield, #b48b62)"
              stroke="var(--baseball-line, #e5f5d5)"
              strokeWidth="2"
            />
            <path
              d={`M${home.x} ${home.y} L17.867966 137.867966 M${home.x} ${home.y} L442.132034 137.867966`}
              fill="none"
              stroke="var(--baseball-line, #e5f5d5)"
              strokeWidth="2"
            />
            <circle
              cx={rubber.x}
              cy={rubber.y}
              r="12"
              fill="var(--baseball-infield, #b48b62)"
            />
            <rect
              x={rubber.x - 6}
              y={rubber.y - 2}
              width="12"
              height="4"
              fill="var(--baseball-line, #e5f5d5)"
            />
            {[first, second, third].map((point) => (
              <rect
                x={point.x - 4}
                y={point.y - 4}
                width="8"
                height="8"
                fill="var(--baseball-line, #e5f5d5)"
                transform={`rotate(45 ${point.x} ${point.y})`}
              />
            ))}
            <polygon
              points={`${home.x - 5},${home.y - 5} ${home.x + 5},${home.y - 5} ${home.x + 5},${home.y} ${home.x},${home.y + 5} ${home.x - 5},${home.y}`}
              fill="var(--baseball-line, #e5f5d5)"
            />
          </svg>
          {handle.props.players.map((player) => {
            const point = positions[player.position];
            const style = {
              left: `${(point.x / width) * 100}%`,
              top: `${(point.y / height) * 100}%`,
            };
            const label = `${player.position}: ${player.name}${player.detail ? ` · ${player.detail}` : ""}`;
            return (
              <>
                <div
                  style={style}
                  mix={markerStyles}
                  aria-hidden={handle.props.onSelect ? true : undefined}
                  data-selected={handle.props.selectedId === player.id}
                >
                  <span data-field-portrait>
                    {player.image ? (
                      <img src={player.image} alt="" width="32" height="32" />
                    ) : (
                      <span>{player.name.slice(0, 1)}</span>
                    )}
                  </span>
                  <strong>{player.position}</strong>
                  <span data-field-label>
                    <span>{player.name}</span>
                    {player.detail ? <span>{player.detail}</span> : null}
                  </span>
                </div>
                {handle.props.onSelect ? (
                  <button
                    type="button"
                    style={style}
                    aria-label={label}
                    aria-pressed={handle.props.selectedId === player.id}
                    mix={[
                      fieldTargetStyles,
                      focusStyles,
                      on("click", () => handle.props.onSelect?.(player.id)),
                    ]}
                  />
                ) : null}
              </>
            );
          })}
        </div>
        <ol mix={fieldKeyStyles} aria-label="Field position names">
          {handle.props.players.map((player) => (
            <li>
              {handle.props.onSelect ? (
                <button
                  type="button"
                  aria-pressed={handle.props.selectedId === player.id}
                  mix={[
                    focusStyles,
                    on("click", () => handle.props.onSelect?.(player.id)),
                  ]}
                >
                  <strong>{player.position}</strong>
                  <span>
                    {player.name}
                    {player.detail ? <small>{player.detail}</small> : null}
                  </span>
                </button>
              ) : (
                <span>
                  <strong>{player.position}</strong> {player.name}
                  {player.detail ? ` · ${player.detail}` : ""}
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    );
  };
}
const fieldWrapperStyles = css({
  containerType: "inline-size",
  containerName: "baseball",
  minWidth: 0,
});
const fieldStyles = css({
  position: "relative",
  width: "100%",
  aspectRatio: "460 / 400",
  minWidth: 0,
  color: "var(--hui-ink)",
  "& img": { objectFit: "contain", maxWidth: "100%" },
});
const markerStyles = css({
  position: "absolute",
  transform: "translate(-50%,-50%)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  width: "44px",
  height: "44px",
  fontSize: "11px",
  lineHeight: "12px",
  textAlign: "center",
  pointerEvents: "none",
  "& [data-field-portrait]": {
    width: "min(32px,var(--baseball-portrait-size,32px))",
    height: "min(32px,var(--baseball-portrait-size,32px))",
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    background: "var(--baseball-marker,var(--hui-surface))",
  },
  "&[data-selected=true] [data-field-portrait]": {
    outline: "3px solid var(--hui-accent)",
    outlineOffset: "2px",
  },
  "& strong": {
    padding: "0 4px",
    background: "var(--hui-surface)",
    borderRadius: "3px",
  },
  "& [data-field-label]": {
    position: "absolute",
    top: "100%",
    width: "120px",
    left: "50%",
    transform: "translateX(-50%)",
    "& span": {
      display: "block",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      background: "var(--hui-surface)",
      padding: "2px 4px",
    },
  },
  "@container baseball (max-width:480px)": {
    "& [data-field-label]": { display: "none" },
  },
});
const fieldTargetStyles = css({
  position: "absolute",
  transform: "translate(-50%,-50%)",
  width: "44px",
  height: "44px",
  padding: 0,
  border: 0,
  borderRadius: "var(--hui-control-radius)",
  background: "transparent",
  cursor: "pointer",
  "@container baseball (max-width:480px)": { display: "none" },
});
const fieldKeyStyles = css({
  display: "none",
  listStyle: "none",
  margin: "4px 0 0",
  padding: "8px",
  gap: "8px",
  fontSize: "12px",
  "& li": { minWidth: 0 },
  "& button": {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    width: "100%",
    minHeight: "44px",
    padding: "6px 8px",
    font: "inherit",
    textAlign: "left",
    color: "var(--hui-ink)",
    background: "var(--hui-surface)",
    border: "1px solid var(--hui-border)",
    borderRadius: "var(--hui-control-radius)",
    cursor: "pointer",
    "&[aria-pressed=true]": {
      background: "var(--hui-selected-surface)",
      outline: "2px solid var(--hui-accent)",
      outlineOffset: "-2px",
    },
  },
  "@container baseball (max-width:480px)": {
    display: "grid",
    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
  },
});

export interface ScoreboardTeam {
  id: string;
  name: string;
  image?: string | null;
  innings: readonly (number | null)[];
  runs: number | null;
  hits?: number | null;
  errors?: number | null;
}
export function BaseballScoreboard(
  handle: Handle<{
    label: string;
    innings: readonly string[];
    teams: readonly ScoreboardTeam[];
  }>,
) {
  return () => {
    if (
      handle.props.teams.some(
        (team) => team.innings.length !== handle.props.innings.length,
      )
    )
      throw new RangeError(
        "Each scoreboard team must supply one value (or null) per inning header",
      );
    return (
      <div
        role="region"
        aria-label={handle.props.label}
        tabindex={0}
        mix={[scoreStyles, focusStyles]}
        data-baseball-scoreboard
      >
        <table>
          <caption>{handle.props.label}</caption>
          <thead>
            <tr>
              <th scope="col">Team</th>
              {handle.props.innings.map((n) => (
                <th scope="col">{n}</th>
              ))}
              <th scope="col">R</th>
              <th scope="col">H</th>
              <th scope="col">E</th>
            </tr>
          </thead>
          <tbody>
            {handle.props.teams.map((team) => (
              <tr>
                <th scope="row">
                  {team.image ? (
                    <img src={team.image} alt="" width="80" height="32" />
                  ) : null}
                  <span>{team.name}</span>
                </th>
                {team.innings.map((n) => (
                  <td>{n ?? "—"}</td>
                ))}
                <td data-total>{team.runs ?? "—"}</td>
                <td>{team.hits ?? "—"}</td>
                <td>{team.errors ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
}
const scoreStyles = css({
  overflowX: "auto",
  color: "var(--hui-ink)",
  maxWidth: "100%",
  borderRadius: "var(--hui-panel-radius)",
  background: "var(--hui-table-surface)",
  "& table": {
    color: "inherit",
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "580px",
    fontVariantNumeric: "tabular-nums",
    fontSize: "14px",
  },
  "& caption": {
    textAlign: "left",
    padding: "10px 12px",
    color: "var(--hui-muted)",
    fontSize: "12px",
  },
  "& th, & td": {
    padding: "var(--hui-table-cell-padding)",
    textAlign: "center",
    borderBottom: "1px solid var(--hui-table-border)",
  },
  "& thead": {
    background: "var(--hui-table-header)",
    fontSize: "var(--hui-table-header-text-size)",
  },
  "& th:first-child": { textAlign: "left", width: "32%", minWidth: "160px" },
  "& th img": { display: "block", objectFit: "contain", marginBottom: "4px" },
  "& td": { fontFamily: "var(--hui-font-display)" },
  "& [data-total]": {
    color: "var(--hui-accent)",
    fontSize: "24px",
    background: "var(--hui-selected-surface)",
  },
});
