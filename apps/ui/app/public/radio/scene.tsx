import { space } from "@harrhy/ui/styles";
import { css, on, ref } from "remix/component";
import type { Handle } from "remix/component";
import { Button, Inline } from "@harrhy/ui/native";
import { Select } from "@harrhy/ui/interactive";
import { RadioPlayerView } from "./player.tsx";
import type { Density, ThemeName } from "../themes.ts";
import {
  desktopThemeStyle,
  selectedDesktopThemeStyle,
  radioControlsTheme,
} from "./theme.ts";
import { createRadioDemo, scenarios } from "./model.ts";
import { dialIcons } from "./icons.tsx";
import type { Scenario } from "./model.ts";

export function RadioScene(
  handle: Handle<{ theme: ThemeName; density: Density }>,
) {
  let scenario: Scenario = "paused";
  let width = 960;
  const demo = createRadioDemo(() => {
    handle.update();
  });
  return () => (
    <section
      aria-label="Radio fixture"
      mix={css({ display: "grid", gap: space(2.5), minWidth: 0 })}
    >
      <Inline>
        <label htmlFor="radio-scenario">Scenario</label>
        <Select
          id="radio-scenario"
          defaultValue={scenario}
          options={scenarios.map((name) => ({
            value: name,
            label:
              name === "calibrated"
                ? "Offset +20ms"
                : name[0]!.toUpperCase() + name.slice(1),
          }))}
          onValueChange={(value) => {
            scenario = value as Scenario;
            demo.reset(scenario);
          }}
          mix={css({ width: "auto" })}
        />
        <Button mix={on("click", () => demo.reset(scenario))}>
          Reset scene
        </Button>
        <span mix={css({ color: "var(--hui-muted)", fontSize: "0.8125rem" })}>
          Synthetic room · no audio, files or network
        </span>
      </Inline>
      <div
        mix={[
          handle.props.theme === "dial"
            ? [desktopThemeStyle, radioControlsTheme(handle.props.density)]
            : selectedDesktopThemeStyle,
          ref((node, signal) => {
            const observer = new ResizeObserver((entries) => {
              const next = Math.floor(entries[0]?.contentRect.width ?? 960);
              if (next !== width) {
                width = next;
                handle.update();
              }
            });
            observer.observe(node);
            signal.addEventListener("abort", () => observer.disconnect(), {
              once: true,
            });
          }),
        ]}
      >
        <RadioPlayerView
          sceneHref={`/scenes/radio?theme=${handle.props.theme}&density=${handle.props.density}`}
          icons={handle.props.theme === "dial" ? dialIcons : undefined}
          state={demo.state}
          client={demo.actions}
          preview
          roomName="evening-radio"
          viewportWidth={width}
          onAddTrack={() => demo.addTrack()}
        />
      </div>
      <p
        role="status"
        mix={css({
          color: "var(--hui-muted)",
          fontSize: "0.8125rem",
          minHeight: "1.25rem",
        })}
      >
        {demo.announcement ||
          "Try transport, track actions, keyboard reorder and calibration."}
      </p>
    </section>
  );
}
