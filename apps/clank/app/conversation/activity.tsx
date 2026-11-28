import { space } from "@harrhy/ui/theme";
import { Button } from "@harrhy/ui/native";
import { css, on, ref, type Handle } from "remix/component";
import { Icon } from "../icons.tsx";

export type Step = {
  id: string;
  name: string;
  args?: unknown;
  output?: string;
  state: string;
  at?: number;
  end?: number;
};
function summary(steps: readonly Step[]) {
  const counts = new Map<string, number>();
  for (const step of steps)
    if (step.name !== "Thought") {
      const name = step.name === "write" ? "edit" : step.name;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  const words = [...counts].map(([name, n]) =>
    name === "bash"
      ? `ran ${n === 1 ? "a command" : `${n} commands`}`
      : name === "edit"
        ? `edited ${n === 1 ? "a file" : `${n} files`}`
        : name === "read"
          ? `read ${n === 1 ? "a file" : `${n} files`}`
          : name === "subagent"
            ? n === 1
              ? "used a subagent"
              : `used subagents ${n} times`
            : `used ${name}${n === 1 ? "" : ` ${n} times`}`,
  );
  if (steps.some((step) => step.name === "Thought")) words.unshift("thought");
  const text = words.join(", ") || "done";
  return text[0].toUpperCase() + text.slice(1);
}
function elapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60
    ? `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`
    : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
function face(step: Step) {
  const running = step.state === "Running" || step.state === "Pending";
  const arg = step.args as { command?: unknown; path?: unknown } | undefined;
  const path =
    typeof arg?.path === "string" ? arg.path.split("/").at(-1) : undefined;
  if (step.name === "Thought") return running ? "Thinking…" : "Thought";
  if (step.name === "bash")
    return `${running ? "Running" : "Ran"} ${typeof arg?.command === "string" ? arg.command.split("\n")[0] : "a command"}`;
  if (step.name === "read")
    return `${running ? "Reading" : "Read"} ${path ?? "a file"}`;
  if (step.name === "edit" || step.name === "write")
    return `${running ? "Editing" : "Edited"} ${path ?? "a file"}`;
  return `${running ? "Using" : "Used"} ${step.name}`;
}
const output = css({
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  background: "var(--hui-canvas)",
  padding: space(1),
  fontSize: "0.75rem",
  maxHeight: "16rem",
  overflow: "auto",
});
type TickerFace = { key: string; index: number; text: string };
const tickerFace = css({
  gridArea: "1 / 1",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  "&[aria-hidden=true]": { transform: "translateY(calc(-1 * var(--enter)))" },
  "@media (prefers-reduced-motion: no-preference)": {
    transition: "transform 390ms cubic-bezier(.16,.85,.24,1)",
    "@starting-style": {
      "[data-slide] > &[data-current]": {
        transform: "translateY(var(--enter))",
      },
    },
  },
});
export function Activity(
  handle: Handle<{
    steps: Step[];
    working: boolean;
    endedAt?: number;
    animateChanges: boolean;
  }>,
) {
  let selected: string | undefined;
  let keys: string[] = [];
  let current: TickerFace | undefined;
  let outgoing: TickerFace | undefined;
  let manual = false;
  let pending = false;
  let idle: ReturnType<typeof setTimeout> | undefined;
  handle.signal.addEventListener("abort", () => clearTimeout(idle), {
    once: true,
  });
  let shown = false;
  let openStep: string | undefined;
  let now: number | undefined;
  const id = `${handle.id}-steps`;
  const update = () => {
    if (handle.props.working) {
      now = Date.now();
      void handle.update();
    }
  };
  const clock = ref<HTMLDivElement>((_node, signal) => {
    update();
    const timer = setInterval(update, 1000);
    signal.addEventListener("abort", () => clearInterval(timer), {
      once: true,
    });
  });
  const wheel = ref<HTMLButtonElement>((node, signal) => {
    let last = 0;
    node.addEventListener(
      "wheel",
      (event) => {
        const delta = Math.sign(event.deltaY);
        if (
          Math.abs(event.deltaY) < 5 ||
          !current ||
          !keys[current.index + delta]
        )
          return;
        event.preventDefault();
        const tick = performance.now();
        if (tick - last > 85) {
          last = tick;
          turn(delta);
        }
      },
      { passive: false, signal },
    );
  });
  function turn(delta: number) {
    if (!current) return;
    const key = keys[current.index + delta];
    if (key === undefined) return;
    selected = key;
    manual = true;
    clearTimeout(idle);
    // Appends wait while the reader is rolling. Idle alone never changes a face.
    idle = setTimeout(() => {
      idle = undefined;
      if (!pending) return;
      pending = false;
      selected = undefined;
      void handle.update();
    }, 4000);
    void handle.update();
  }
  return () => {
    const { steps, working, endedAt, animateChanges } = handle.props;
    const previousCount = keys.length;
    keys = steps.length ? steps.map((step) => `step:${step.id}`) : ["waiting"];
    if (!working) keys.push("done");
    const added = keys.length - previousCount;
    if (added && !idle) selected = undefined;
    else if (added) pending = true;
    const picked = selected === undefined ? -1 : keys.indexOf(selected);
    const index = picked < 0 ? keys.length - 1 : picked;
    const active = steps[index];
    const key = keys[index]!;
    const label = active
      ? face(active)
      : key === "waiting"
        ? "Working…"
        : summary(steps);
    const text =
      key === "done"
        ? `${label} · ${steps.length} ${steps.length === 1 ? "step" : "steps"}`
        : label;
    if (current?.key !== key) {
      // A new baseline or a batch catch-up cuts directly to its final face.
      outgoing =
        current &&
        current.index !== index &&
        (manual || (animateChanges && added >= 0 && added <= 2))
          ? current
          : undefined;
    }
    manual = false;
    current = { key, index, text };
    const rows = outgoing
      ? [outgoing, current].toSorted((a, b) => a.index - b.index)
      : [current];
    const started = steps.find((step) => step.at !== undefined)?.at;
    const end = working
      ? now
      : (endedAt ??
        steps.map((step) => step.end ?? 0).reduce((a, b) => Math.max(a, b), 0));
    const time =
      started !== undefined && end !== undefined && end >= started
        ? elapsed(end - started)
        : undefined;
    return (
      <div
        data-tool-activity
        data-state={working ? "working" : "done"}
        mix={[
          working ? clock : undefined,
          css({
            marginBlock: space(1.25),
            color: "var(--hui-muted)",
            fontSize: "0.8125rem",
          }),
        ]}
      >
        <Button
          variant="quiet"
          aria-label={`${label}. Show the steps`}
          aria-expanded={shown}
          aria-controls={id}
          mix={[
            wheel,
            css({
              width: "100%",
              fontWeight: 400,
              fontSize: "0.8125rem",
              color: "var(--hui-muted)",
              justifyContent: "space-between",
              textAlign: "start",
              overflow: "hidden",
            }),
            on("keydown", (event) => {
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                turn(event.key === "ArrowUp" ? -1 : 1);
              }
            }),
            on("click", () => {
              shown = !shown;
              openStep = shown ? active?.id : undefined;
              void handle.update();
            }),
          ]}
        >
          <span
            data-activity-viewport
            data-slide={
              outgoing
                ? outgoing.index < index
                  ? "forward"
                  : "backward"
                : undefined
            }
            mix={css({
              display: "grid",
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              "&[data-slide=forward]": { "--enter": "100%" },
              "&[data-slide=backward]": { "--enter": "-100%" },
            })}
          >
            {rows.map((item) => (
              <span
                key={item.key}
                data-activity-face={item.key}
                data-current={item.key === key || undefined}
                aria-hidden={item.key !== key || undefined}
                mix={tickerFace}
              >
                {item.text}
              </span>
            ))}
          </span>
          <span
            mix={css({
              display: "flex",
              alignItems: "center",
              gap: space(1),
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            })}
          >
            {time}
            <Icon name={shown ? "down" : "right"} />
          </span>
        </Button>
        <ol
          id={id}
          hidden={!shown}
          mix={css({ margin: `${space(0.5)} 0`, paddingInlineStart: space(3) })}
        >
          {steps.map((step) => (
            <li key={step.id}>
              <details open={openStep === step.id}>
                <summary>
                  {face(step)} · {step.state}
                </summary>
                {step.args !== undefined && (
                  <pre mix={output}>{JSON.stringify(step.args, null, 2)}</pre>
                )}
                {step.output && <pre mix={output}>{step.output}</pre>}
              </details>
            </li>
          ))}
        </ol>
      </div>
    );
  };
}
