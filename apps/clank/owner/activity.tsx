import { Button } from "@harrhy/ui/native";
import { css, on, ref, type Handle } from "remix/component";
import { Icon } from "./icons.tsx";

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
  padding: "8px",
  fontSize: "12px",
  maxHeight: "16rem",
  overflow: "auto",
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
  let previousFace: string | undefined;
  let previousSelection: string | undefined;
  let animateFace = false;
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
        if (
          Math.abs(event.deltaY) < 5 ||
          handle.props.steps.length + Number(!handle.props.working) < 2
        )
          return;
        event.preventDefault();
        const tick = performance.now();
        if (tick - last > 85) {
          last = tick;
          turn(Math.sign(event.deltaY));
        }
      },
      { passive: false, signal },
    );
  });
  function turn(delta: number) {
    const { steps, working } = handle.props;
    const faces = [
      ...steps.map((step) => step.id),
      ...(!working ? ["done"] : []),
    ];
    if (faces.length < 2) return;
    const index = faces.indexOf(selected ?? faces.at(-1)!);
    selected =
      faces[
        Math.max(
          0,
          Math.min(
            faces.length - 1,
            (index < 0 ? faces.length - 1 : index) + delta,
          ),
        )
      ];
    void handle.update();
  }
  return () => {
    const { steps, working, endedAt } = handle.props;
    const active =
      steps.find((step) => step.id === selected) ??
      (working ? steps.at(-1) : undefined);
    const label = active ? face(active) : working ? "Working…" : summary(steps);
    const faceKey = JSON.stringify([active?.id, working, label]);
    if (faceKey !== previousFace) {
      animateFace =
        previousSelection !== selected ||
        (handle.props.animateChanges &&
          (working || previousFace !== undefined));
      previousFace = faceKey;
    }
    previousSelection = selected;
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
            marginBlock: "10px",
            color: "var(--hui-muted)",
            fontSize: "13px",
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
            mix={css({
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            })}
          >
            <span
              key={faceKey}
              mix={css({
                display: "inline-block",
                "@keyframes wheel-in": {
                  from: { opacity: 0, transform: "translateY(6px)" },
                  to: { opacity: 1, transform: "translateY(0)" },
                },
                animation: animateFace ? "wheel-in 140ms ease-out" : "none",
                "@media (prefers-reduced-motion: reduce)": {
                  animation: "none",
                },
              })}
            >
              {label}
              {!working &&
                !active &&
                ` · ${steps.length} ${steps.length === 1 ? "step" : "steps"}`}
            </span>
          </span>
          <span
            mix={css({
              display: "flex",
              alignItems: "center",
              gap: "8px",
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
          mix={css({ margin: "4px 0", paddingInlineStart: "24px" })}
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
