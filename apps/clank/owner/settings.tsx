import { Dialog } from "@harrhy/ui/interactive";
import { Button, Checkbox } from "@harrhy/ui/native";
import { css, on, type Handle } from "remix/component";
import { modes, type Mode } from "./appearance.ts";
import { recencyWindows, type Recency } from "./sidebar-time.ts";

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
      recency: recencyWindows.find((days) => String(days) === stored) ?? defaultPreferences.recency,
      enterToSend: localStorage.getItem(sendKey) !== "off",
      showMetadata: localStorage.getItem(metadataKey) !== "hidden",
    };
  } catch {
    return defaultPreferences;
  }
}

export function savePreference(change: Partial<Preferences>) {
  try {
    if (change.recency !== undefined) localStorage.setItem(recencyKey, String(change.recency));
    if (change.enterToSend !== undefined)
      localStorage.setItem(sendKey, change.enterToSend ? "on" : "off");
    if (change.showMetadata !== undefined)
      localStorage.setItem(metadataKey, change.showMetadata ? "shown" : "hidden");
  } catch {
    // Storage is optional; the controls still work for this visit.
  }
}

const layout = css({
  display: "grid",
  gap: "12px",
  "& fieldset": { border: 0, padding: 0, margin: 0, minWidth: 0 },
  "& legend": { padding: 0, fontWeight: 600 },
  "& label": {
    display: "flex",
    gap: "6px",
    alignItems: "center",
    minHeight: "32px",
    cursor: "pointer",
  },
  "& input": { margin: 0, accentColor: "var(--hui-ink)" },
});
const choices = css({ display: "flex", flexWrap: "wrap", gap: "0 16px" });

export function Settings(
  handle: Handle<{
    open: boolean;
    mode: Mode;
    setMode(mode: Mode): void;
    preferences: Preferences;
    change(value: Partial<Preferences>): void;
    close(): void;
  }>,
) {
  return () => {
    const { open, mode, setMode, preferences, change, close } = handle.props;
    return (
      <Dialog
        open={open}
        title="Settings"
        description="Preferences for Clank on this browser."
        mix={css({ width: "min(26rem, calc(100% - 2rem))" })}
        onClose={close}
      >
        <div mix={layout}>
          <fieldset>
            <legend>Appearance</legend>
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
                  {days === "forever" ? "Forever" : days === 1 ? "1 day" : `${days} days`}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Composer</legend>
            <label>
              <Checkbox
                checked={preferences.enterToSend}
                mix={on("change", (event) => change({ enterToSend: event.currentTarget.checked }))}
              />
              Enter to send on desktop
            </label>
            <label>
              <Checkbox
                checked={preferences.showMetadata}
                mix={on("change", (event) => change({ showMetadata: event.currentTarget.checked }))}
              />
              Show composer metadata
            </label>
          </fieldset>
          <Button variant="quiet" mix={[css({ justifySelf: "end" }), on("click", close)]}>
            Done
          </Button>
        </div>
      </Dialog>
    );
  };
}
