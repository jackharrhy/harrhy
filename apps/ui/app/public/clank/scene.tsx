import { clientEntry, on, ref, type Handle } from "remix/component";
import {
  themeRoot,
  themeStyles,
  composeTheme,
  densityOverrides,
} from "@harrhy/ui/theme";
import { Button } from "@harrhy/ui/native";
import { sessions, blocks } from "./fixture.ts";
import { WorkbenchHeader } from "../workbench.tsx";
import { themes, themeLabels, type ThemeName } from "../themes.ts";
const palettes = ["clean", "brutalist", "graphite"] as const;
import { Words, Settled } from "./markdown.tsx";
import { Mark } from "./marks.tsx";
import { shell } from "./styles.ts";

export const Cookoff = clientEntry(
  import.meta.url,
  function Cookoff(handle: Handle<{ initial: ThemeName }>) {
    let skin = handle.props.initial,
      index = 0,
      pane = "Transcript",
      engine = "Tail";
    let density: keyof typeof densityOverrides = "compact";
    let source = blocks(sessions[index]).join("\n\n"),
      length = source.length;
    let timer: ReturnType<typeof setInterval> | undefined,
      scroll: HTMLElement | undefined,
      title: HTMLElement | undefined;
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
    };
    handle.signal.addEventListener("abort", stop, { once: true });
    const step = () => {
      const atEnd =
        scroll &&
        scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop < 32 &&
        !window.getSelection()?.toString();
      length = Math.min(length + 8, source.length);
      if (length === source.length) stop();
      handle.update();
      if (atEnd)
        handle.queueTask(() => {
          if (scroll) scroll.scrollTop = scroll.scrollHeight;
        });
    };
    function play() {
      if (timer) stop();
      else {
        if (length === source.length) length = 0;
        timer = setInterval(step, 130);
      }
      handle.update();
    }
    function select(i: number) {
      stop();
      index = i;
      source = blocks(sessions[i]).join("\n\n");
      length = source.length;
      pane = "Transcript";
      handle.update();
      handle.queueTask(() => {
        title?.focus();
        if (scroll) scroll.scrollTop = 0;
      });
    }
    return () => {
      const s = sessions[index],
        complete = length === source.length,
        state = complete ? "Complete" : timer ? "Streaming" : "Paused";
      return (
        <div
          data-skin={skin}
          data-pane={pane}
          mix={[
            themeStyles(composeTheme(themes[skin], densityOverrides[density])),
            themeRoot,
            shell,
          ]}
        >
          <WorkbenchHeader
            theme={skin}
            page="scenes"
            onThemeChange={(next) => {
              skin = next;
              handle.update();
            }}
          />
          <nav aria-label="Session views" class="mobile">
            {["Sessions", "Transcript", "Overview"].map((p) => (
              <button
                aria-pressed={pane === p}
                mix={on("click", () => {
                  pane = p;
                  handle.update();
                })}
              >
                {p}
              </button>
            ))}
          </nav>
          <main class="columns">
            <aside class="sessions" aria-label="Session list">
              <div class="railhead">
                <h1 class="phone-title">Sessions</h1>
                <h2 class="rail-title">Clank</h2>
              </div>
              {sessions.map((item, i) => (
                <button
                  class="session"
                  aria-pressed={index === i}
                  mix={on("click", () => select(i))}
                >
                  <span>{item.name}</span>
                </button>
              ))}
              <div class="railfoot">
                <a href="/scenes">← UI showcase</a>
                <nav aria-label="Design comparison" class="skins">
                  {palettes.map((k) => (
                    <button
                      aria-pressed={skin === k}
                      mix={on("click", () => {
                        skin = k;
                        handle.update();
                      })}
                    >
                      {themeLabels[k]}
                    </button>
                  ))}
                </nav>
                <div class="skins" role="group" aria-label="Density">
                  {(["standard", "compact"] as const).map((value) => (
                    <button
                      aria-pressed={density === value}
                      mix={on("click", () => {
                        density = value;
                        handle.update();
                      })}
                    >
                      {value === "compact" ? "Compact" : "Standard"}
                    </button>
                  ))}
                </div>
              </div>
            </aside>
            <section class="transcript" aria-label="Session detail">
              <div class="heading">
                <h1
                  tabindex={-1}
                  mix={ref((node) => {
                    title = node;
                  })}
                >
                  {s.name}
                </h1>
                <div class="statusline">
                  <span class="state" data-complete={complete} role="status">
                    {complete ? (
                      <Mark name="check" />
                    ) : (
                      <Mark name="terminal" />
                    )}
                    {state}
                  </span>
                </div>
              </div>
              <section
                class="scroll"
                tabindex={0}
                aria-label="Transcript"
                mix={ref((node) => {
                  scroll = node;
                })}
              >
                <div class="measure">
                  <div class="user" aria-label="Operator message">
                    <p>{s.prompt}</p>
                    <time>{s.time}</time>
                  </div>
                  <details key={s.id}>
                    <summary>
                      <Mark name="terminal" />
                      <span>
                        Read <code>{s.file}</code>
                      </span>
                      <small>Done</small>
                    </summary>
                    <p>
                      Loaded the fixture source for the {s.note.toLowerCase()}{" "}
                      check.
                    </p>
                  </details>
                  {engine === "Words" ? (
                    <Words
                      source={source.slice(0, length)}
                      active={!complete}
                    />
                  ) : (
                    <Settled
                      source={source.slice(0, length)}
                      active={!complete}
                    />
                  )}
                  <details key={"check" + s.id}>
                    <summary>
                      <Mark name={complete ? "check" : "terminal"} />
                      <span>Verify output</span>
                      <small>
                        {complete
                          ? "Passed"
                          : length > s.intro.length
                            ? "Running"
                            : "Queued"}
                      </small>
                    </summary>
                    <p>
                      {complete
                        ? "Expected and observed values match."
                        : "Waiting for the fixture comparison."}
                    </p>
                  </details>
                </div>
              </section>
              <footer class="transport">
                <Button mix={on("click", play)}>
                  <Mark name="play" />
                  {timer ? "Pause" : complete ? "Replay" : "Resume"}
                </Button>
                <button
                  class="step"
                  mix={on("click", () => {
                    stop();
                    if (length === source.length) length = 0;
                    step();
                  })}
                >
                  Step
                </button>
                <div
                  class="engines"
                  role="group"
                  aria-label="Markdown renderer"
                >
                  {["Tail", "Words"].map((e) => (
                    <button
                      aria-pressed={e === engine}
                      mix={on("click", () => {
                        engine = e;
                        handle.update();
                      })}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </footer>
            </section>
            <aside class="overview" aria-label="Overview">
              <div class="railhead">
                <h1 class="phone-title">Overview</h1>
                <h2 class="rail-title">Overview</h2>
              </div>
              <dl>
                <dt>Project</dt>
                <dd>Proofpress</dd>
                <dt>Session</dt>
                <dd>{s.id}</dd>
                <dt>Started</dt>
                <dd>{s.time}</dd>
                <dt>File read</dt>
                <dd>
                  <code>{s.file}</code>
                </dd>
                <dt>Verification</dt>
                <dd>
                  {complete
                    ? "Passed"
                    : length > s.intro.length
                      ? "Running"
                      : "Queued"}
                </dd>
              </dl>
            </aside>
          </main>
        </div>
      );
    };
  },
);
