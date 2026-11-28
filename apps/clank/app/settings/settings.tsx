import { DialogClose } from "../dialog-close.tsx";
import { Dialog } from "@harrhy/ui/interactive";
import { Checkbox } from "@harrhy/ui/native";
import { css, on, type Handle } from "remix/component";
import { tints, type Tint } from "./theme-cookie.ts";
import { modes, type Mode } from "./appearance.ts";
import { recencyWindows, type Recency } from "../sidebar/sidebar-time.ts";

interface Preferences {
  recency: Recency;
  enterToSend: boolean;
  showMetadata: boolean;
}

export const defaultPreferences: Preferences = {
  recency: 3,
  enterToSend: true,
  showMetadata: true,
};
const recencyKey = "clank:sidebar-recency";
const sendKey = "clank:enter-to-send";
const metadataKey = "clank:composer-metadata";

export function readPreferences(): Preferences {
  try {
    const stored = localStorage.getItem(recencyKey);
    return {
      recency:
        recencyWindows.find((days) => String(days) === stored) ??
        defaultPreferences.recency,
      enterToSend: localStorage.getItem(sendKey) !== "off",
      showMetadata: localStorage.getItem(metadataKey) !== "hidden",
    };
  } catch {
    return defaultPreferences;
  }
}

export function savePreference(change: Partial<Preferences>) {
  try {
    if (change.recency !== undefined)
      localStorage.setItem(recencyKey, String(change.recency));
    if (change.enterToSend !== undefined)
      localStorage.setItem(sendKey, change.enterToSend ? "on" : "off");
    if (change.showMetadata !== undefined)
      localStorage.setItem(
        metadataKey,
        change.showMetadata ? "shown" : "hidden",
      );
  } catch {
    // Storage is optional; the controls still work for this visit.
  }
}

const layout = css({
  display: "grid",
  gap: "0.75rem",
  "& fieldset": { border: 0, padding: 0, margin: 0, minWidth: 0 },
  "& legend": { padding: 0, fontWeight: 600 },
  "& label": {
    display: "flex",
    gap: "0.375rem",
    alignItems: "center",
    minHeight: "2rem",
    cursor: "pointer",
  },
  "& input": { margin: 0, accentColor: "var(--hui-ink)" },
});
const choices = css({ display: "flex", flexWrap: "wrap", gap: "0 1rem" });

export function Settings(
  handle: Handle<{
    open: boolean;
    mode: Mode;
    setMode(mode: Mode): void;
    tint: Tint;
    setTint(tint: Tint): void;
    preferences: Preferences;
    change(value: Partial<Preferences>): void;
    close(): void;
  }>,
) {
  return () => {
    const { open, mode, setMode, tint, setTint, preferences, change, close } =
      handle.props;
    return (
      <Dialog
        open={open}
        title="Settings"
        description="Preferences for Clank on this browser."
        mix={css({
          width: "min(26rem, calc(100% - 2rem))",
          "& > h2": { paddingInlineEnd: "2.5rem" },
        })}
        onClose={close}
      >
        <div mix={layout}>
          <fieldset>
            <legend>Theme</legend>
            <div mix={choices}>
              {modes.map((choice) => (
                <label key={choice}>
                  <input
                    type="radio"
                    name="clank-theme"
                    checked={mode === choice}
                    mix={on("change", () => setMode(choice))}
                  />
                  {choice[0].toUpperCase() + choice.slice(1)}
                </label>
              ))}
            </div>
            <label
              mix={[
                css({
                  justifyContent: "space-between",
                  marginBlock: "0.375rem",
                  "& select": {
                    font: "inherit",
                    color: "var(--hui-ink)",
                    backgroundColor: "var(--hui-surface)",
                    border: "1px solid var(--hui-control-border)",
                    borderRadius: "var(--hui-control-radius)",
                    padding: "0.375rem 0.5rem",
                  },
                }),
                on("change", ({ target }) => {
                  if (target instanceof HTMLSelectElement) {
                    const next = tints.find(
                      (choice) => choice === target.value,
                    );
                    if (next) setTint(next);
                  }
                }),
              ]}
            >
              Base tint
              <select>
                {tints.map((value) => (
                  <option key={value} value={value} selected={tint === value}>
                    {
                      {
                        pi: "Follow Pi",
                        slate: "Slate",
                        sage: "Sage",
                        plum: "Plum",
                      }[value]
                    }
                  </option>
                ))}
              </select>
            </label>
            <div
              aria-label="Tint preview"
              role="group"
              mix={css({
                display: "grid",
                gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                gap: "0.5rem",
              })}
            >
              {(["light", "dark"] as const).map((scheme) => (
                <div
                  key={scheme}
                  mix={css({
                    colorScheme: scheme,
                    padding: "0.5rem",
                    background: "var(--hui-surface)",
                    color: "var(--hui-ink)",
                    border: "1px solid var(--hui-border)",
                    borderRadius: "var(--hui-control-radius)",
                    fontSize: "0.8125rem",
                  })}
                >
                  <strong>{scheme === "light" ? "Light" : "Dark"}</strong>
                  <div
                    mix={css({
                      marginBlockStart: "0.375rem",
                      padding: "0.25rem 0.5rem",
                      backgroundColor: "var(--hui-selected-surface)",
                      borderRadius: "var(--hui-control-radius)",
                    })}
                  >
                    Message
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Keep sessions in sidebar</legend>
            <div mix={choices}>
              {recencyWindows.map((days) => (
                <label key={days}>
                  <input
                    type="radio"
                    name="clank-recency"
                    checked={preferences.recency === days}
                    mix={on("change", () => change({ recency: days }))}
                  />
                  {days === "forever"
                    ? "Forever"
                    : days === 1
                      ? "1 day"
                      : `${days} days`}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Composer</legend>
            <label>
              <Checkbox
                checked={preferences.enterToSend}
                mix={on("change", (event) =>
                  change({ enterToSend: event.currentTarget.checked }),
                )}
              />
              Enter to send on desktop
            </label>
            <label>
              <Checkbox
                checked={preferences.showMetadata}
                mix={on("change", (event) =>
                  change({ showMetadata: event.currentTarget.checked }),
                )}
              />
              Show composer metadata
            </label>
          </fieldset>
          <DialogClose label="Close settings" close={close} />
        </div>
      </Dialog>
    );
  };
}
