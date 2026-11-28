import { css, on, type Handle, type RemixNode } from "remix/component";
import { AnswerDot, WorkingDots, WorkingFrame } from "./rail-mark.tsx";
import { Icon } from "./icons.tsx";

const reveal = {
  "& .rail-control.rail-archive": { opacity: 1, pointerEvents: "auto" },
  "&:has(.rail-archive) .rail-age": { visibility: "hidden" },
} as const;
const rowStyle = css({
  position: "relative",
  display: "flex",
  alignItems: "center",
  minWidth: 0,
  paddingInline: "8px 6px",
  borderRadius: "var(--hui-control-radius)",
  fontSize: "14px",
  minHeight: "28px",
  "&[data-child]": { color: "var(--hui-muted)", fontSize: "13px" },
  "&:hover, &:has(:focus-visible)": {
    background: "var(--hui-hover-surface)",
    ...reveal,
  },
  "&:has([aria-pressed=true])": {
    background: "var(--hui-selected-surface)",
    color: "var(--hui-selected-ink)",
    fontWeight: 600,
  },
  "& button": {
    background: "transparent",
    border: 0,
    color: "inherit",
    font: "inherit",
    cursor: "pointer",
    borderRadius: "var(--hui-control-radius)",
  },
  "& button:focus-visible": {
    outline: "2px solid currentColor",
    outlineOffset: "-2px",
  },
  "& .rail-open": {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    minWidth: 0,
    padding: "4px 2px",
    textAlign: "start",
  },
  // Stretch only the primary hit area. Disclosure and archive are sibling buttons above it.
  "& .rail-open::after": { content: "''", position: "absolute", inset: 0 },
  "& .rail-label": {
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  "& .rail-marker": {
    flex: "none",
    position: "relative",
    width: "16px",
    height: "16px",
    display: "grid",
    placeItems: "center",
    "& > svg:not([data-rail-mark]), & > img": { width: "16px", height: "16px" },
  },
  "& .rail-label[data-unread]": { fontWeight: 600 },
  "& .rail-label svg": {
    width: "12px",
    height: "12px",
    marginInlineEnd: "4px",
    verticalAlign: "-1px",
    color: "var(--hui-muted)",
  },
  "& .rail-details": {
    marginInlineStart: "auto",
    display: "flex",
    alignItems: "center",
    flex: "none",
    gap: "4px",
  },
  "& .rail-work-count": {
    display: "inline-flex",
    alignItems: "center",
    gap: "2px",
    fontSize: "12px",
    fontWeight: 400,
    color: "var(--hui-muted)",
  },
  "& .rail-control": {
    position: "relative",
    display: "grid",
    placeItems: "center",
    padding: 0,
    flex: "none",
    width: "28px",
    height: "28px",
    color: "var(--hui-muted)",
  },
  "& .rail-control:is(:hover,:focus-visible)": { color: "var(--hui-ink)" },
  "& .rail-tail": {
    display: "grid",
    placeItems: "center end",
    flex: "none",
    pointerEvents: "none",
  },
  "& .rail-tail > *": { gridArea: "1 / 1" },
  "& .rail-age": {
    paddingInline: "4px",
    color: "var(--hui-muted)",
    fontSize: "12px",
    fontWeight: 400,
    fontVariantNumeric: "tabular-nums",
  },
  "& .rail-control.rail-archive": {
    justifyItems: "end",
    paddingInlineEnd: "4px",
    boxSizing: "border-box",
    opacity: 0,
    pointerEvents: "none",
  },
  "@media (pointer: coarse), (hover: none)": { ...reveal },
  "@media (pointer: coarse), (max-width: 40rem)": {
    minHeight: "44px",
    "& .rail-control": { width: "44px", height: "44px" },
  },
});

export function RailRow(
  handle: Handle<{
    label: string;
    title?: string;
    familiarLogo?: RemixNode;
    pinned?: boolean;
    unread?: boolean;
    failure?: string;
    running?: number;
    child?: boolean;
    selected: boolean;
    age?: string;
    open(button: HTMLButtonElement): void;
    disclosure?: {
      controls: string;
      expanded: boolean;
      toggle(button: HTMLButtonElement): void;
    };
    archive?: (button: HTMLButtonElement) => void;
  }>,
) {
  return () => {
    const {
      label,
      title,
      familiarLogo,
      pinned,
      unread,
      failure,
      running = 0,
      child,
      selected,
      age,
      open,
      disclosure,
      archive,
    } = handle.props;
    const working = running > 0;
    const failed = failure !== undefined;
    const backgroundWork = !familiarLogo && working && (failed || unread);
    const workText =
      running > 1
        ? `${running} agents running`
        : backgroundWork
          ? "Running"
          : "Working";
    const reason = child && failed ? `Failed: ${failure}` : failure;
    const status = [reason, unread && "New answer", working && workText]
      .filter(Boolean)
      .join(" · ");
    const description = [title !== label && title, status]
      .filter(Boolean)
      .join(" · ");
    return (
      <div data-child={child ? "" : undefined} mix={rowStyle}>
        <button
          class="rail-open"
          type="button"
          aria-label={label}
          aria-describedby={description ? handle.id : undefined}
          title={[title ?? label, status].filter(Boolean).join("\n")}
          aria-pressed={selected}
          mix={on("click", (e) => open(e.currentTarget))}
        >
          <span class="rail-marker" aria-hidden="true">
            {familiarLogo ? (
              <>
                {familiarLogo}
                {working && <WorkingFrame />}
              </>
            ) : failed || unread ? (
              <AnswerDot failure={failure} />
            ) : working ? (
              <WorkingDots />
            ) : null}
          </span>
          <span class="rail-label" data-unread={unread ? "" : undefined}>
            {pinned && <Icon name="pin" />}
            {label}
          </span>
          <span id={handle.id} hidden>
            {description}
          </span>
        </button>
        <span mix={css({ display: "contents" })}>
          {disclosure && (
            <button
              class="rail-control"
              type="button"
              aria-label={`Subagents for ${label}`}
              aria-expanded={disclosure.expanded}
              aria-controls={disclosure.controls}
              mix={on("click", (e) => disclosure.toggle(e.currentTarget))}
            >
              <Icon name={disclosure.expanded ? "down" : "right"} />
            </button>
          )}
        </span>
        {(age || archive || backgroundWork || (familiarLogo && unread)) && (
          <span class="rail-details">
            {familiarLogo && unread && <AnswerDot />}
            {backgroundWork && (
              <span class="rail-work-count" title={workText} aria-hidden="true">
                <WorkingDots />
                {running > 1 && running}
              </span>
            )}
            {(age || archive) && (
              <span class="rail-tail">
                <span class="rail-age" aria-hidden="true">
                  {age}
                </span>
                {archive && (
                  <button
                    class="rail-control rail-archive"
                    type="button"
                    title={`Archive ${label}`}
                    aria-label={`Archive ${label}`}
                    aria-haspopup="dialog"
                    mix={on("click", (e) => archive(e.currentTarget))}
                  >
                    <Icon name="archive" />
                  </button>
                )}
              </span>
            )}
          </span>
        )}
      </div>
    );
  };
}
