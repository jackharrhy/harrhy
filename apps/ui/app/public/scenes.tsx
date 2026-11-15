import { clientEntry, css, on } from "remix/component";
import type { Handle } from "remix/component";
import {
  Badge,
  Button,
  Checkbox,
  Field,
  Inline,
  Input,
  Notice,
  Panel,
  Stack,
  Textarea,
} from "@harrhy/ui/native";
import { Select } from "@harrhy/ui/interactive";
import { themeRoot, themeStyles } from "@harrhy/ui/theme";
import { themes } from "./themes.ts";
import type { ThemeName } from "./themes.ts";
import { RadioScene } from "./radio/scene.tsx";

const shell = css({
  minHeight: "100vh",
  "& *": { boxSizing: "border-box" },
});
const header = css({
  fontFamily: "system-ui, sans-serif",
  fontSize: "14px",
  color: "#202124",
  background: "white",
  borderBottom: "1px solid #dedfe2",
  padding: "0 24px",
  minHeight: "60px",
  display: "flex",
  alignItems: "center",
  gap: "40px",
  "& strong": { fontSize: "16px", letterSpacing: "-0.025em" },
  "& nav": { display: "flex", alignSelf: "stretch", gap: "24px" },
  "& a": {
    color: "inherit",
    display: "flex",
    alignItems: "center",
    textDecoration: "none",
    borderBottom: "2px solid transparent",
  },
  '& a[aria-current="page"]': { borderColor: "#24292f", fontWeight: 600 },
  "& :focus-visible": { outline: "2px solid #0969da", outlineOffset: "3px" },
  "@media (max-width: 600px)": { padding: "0 16px", gap: "24px" },
});
const main = css({
  maxWidth: "1280px",
  margin: "0 auto",
  padding: "32px 24px 64px",
  display: "grid",
  gap: "28px",
  "@media (max-width: 600px)": { padding: "24px 16px" },
});
const grid = css({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "24px",
  alignItems: "start",
  "@media (max-width: 760px)": { gridTemplateColumns: "1fr" },
});
const comparison = css({
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "16px",
  "@media (max-width: 1000px)": { gridTemplateColumns: "1fr" },
});
const muted = css({ margin: 0, color: "var(--hui-muted)", fontSize: "14px" });

export const Scenes = clientEntry(
  import.meta.url,
  function Scenes(handle: Handle<{ theme: ThemeName; scene: string }>) {
    let theme = handle.props.theme;
    let access: "pending" | "allowed" | "denied" = "pending";
    let board: string | null = null;
    return () => (
      <div mix={[themeStyles(themes[theme]), themeRoot, shell]}>
        <header mix={header}>
          <strong>Harrhy UI</strong>
          <nav aria-label="Workbench">
            <a href="/">Explorer</a>
            <a href="/?view=scenes" aria-current="page">
              Scenes
            </a>
          </nav>
        </header>
        <main mix={main}>
          <div>
            <h1
              mix={css({
                margin: "0 0 8px",
                fontSize: "28px",
                lineHeight: "1.2",
              })}
            >
              Scenes
            </h1>
            <p mix={muted}>Compositions with local data.</p>
          </div>
          <nav
            aria-label="Scenes"
            mix={css({
              "& a": { color: "inherit", textUnderlineOffset: "6px" },
              "& [aria-current=page]": {
                fontWeight: 650,
                textDecorationThickness: "2px",
              },
            })}
          >
            <Inline>
              <a
                href="/?view=scenes&scene=radio"
                aria-current={
                  handle.props.scene === "radio" ? "page" : undefined
                }
              >
                Radio
              </a>
              <a
                href="/?view=scenes&scene=forms"
                aria-current={
                  handle.props.scene === "forms" ? "page" : undefined
                }
              >
                Forms
              </a>
              <a
                href="/?view=scenes&scene=themes"
                aria-current={
                  handle.props.scene === "themes" ? "page" : undefined
                }
              >
                Themes
              </a>
            </Inline>
          </nav>
          {handle.props.scene === "radio" ? (
            <RadioScene />
          ) : handle.props.scene === "forms" ? (
            <>
              <Inline>
                <label htmlFor="scene-theme">Theme</label>
                <Select
                  id="scene-theme"
                  defaultValue={theme}
                  options={[
                    { value: "clean", label: "Clean" },
                    { value: "tactile", label: "Radio" },
                    { value: "brutalist", label: "Artbin" },
                  ]}
                  onValueChange={(value) => {
                    theme = value as ThemeName;
                    handle.update();
                  }}
                  mix={css({ width: "auto" })}
                />
              </Inline>
              <div mix={grid}>
                <Panel aria-labelledby="auth-title">
                  <Stack>
                    <div>
                      <h2
                        mix={css({ margin: 0, fontSize: "18px" })}
                        id="auth-title"
                      >
                        App consent
                      </h2>
                      <p mix={muted}>Auth composition · synthetic account</p>
                    </div>
                    <div>
                      <strong>Ref wants to access your profile</strong>
                      <p>
                        Share your display name with this app. Your email stays
                        private.
                      </p>
                    </div>
                    <Inline>
                      <Badge>Profile: read</Badge>
                      <Badge>Fixture account</Badge>
                    </Inline>
                    {access === "pending" ? (
                      <Inline>
                        <Button
                          variant="primary"
                          mix={on("click", () => {
                            access = "allowed";
                            handle.update();
                          })}
                        >
                          Allow access
                        </Button>
                        <Button
                          mix={on("click", () => {
                            access = "denied";
                            handle.update();
                          })}
                        >
                          Deny
                        </Button>
                      </Inline>
                    ) : (
                      <Stack>
                        <Notice
                          role="status"
                          tone={access === "allowed" ? "success" : "neutral"}
                        >
                          {access === "allowed"
                            ? "Access allowed locally. No permissions changed."
                            : "Access denied. Nothing shared."}
                        </Notice>
                        <Button
                          mix={on("click", () => {
                            access = "pending";
                            handle.update();
                          })}
                        >
                          Reset consent
                        </Button>
                      </Stack>
                    )}
                  </Stack>
                </Panel>
                <Panel aria-labelledby="ref-title">
                  <Stack>
                    <div>
                      <h2
                        mix={css({ margin: 0, fontSize: "18px" })}
                        id="ref-title"
                      >
                        Create a board
                      </h2>
                      <p mix={muted}>Ref composition · browser validation</p>
                    </div>
                    <form
                      mix={[
                        css({ display: "grid", gap: "16px" }),
                        on("submit", (event) => {
                          event.preventDefault();
                          board = String(
                            new FormData(event.currentTarget).get("title"),
                          );
                          handle.update();
                        }),
                      ]}
                    >
                      <Field
                        id="board-title"
                        label="Board title"
                        description="Only visible to you. Maximum 80 characters."
                      >
                        <Input
                          name="title"
                          required
                          maxLength={80}
                          placeholder="Evening sketches…"
                        />
                      </Field>
                      <Field id="board-description" label="Description">
                        <Textarea
                          name="description"
                          rows={3}
                          placeholder="What belongs on this board?"
                        />
                      </Field>
                      <label>
                        <Checkbox name="private" defaultChecked /> Keep this
                        board private
                      </label>
                      <Inline>
                        <Button type="submit" variant="primary">
                          Create board
                        </Button>
                        <Button
                          type="reset"
                          mix={on("click", () => {
                            board = null;
                            handle.update();
                          })}
                        >
                          Reset
                        </Button>
                      </Inline>
                    </form>
                    <Notice role="status" tone={board ? "success" : "neutral"}>
                      {board
                        ? `“${board}” created in memory.`
                        : "No boards yet."}
                    </Notice>
                  </Stack>
                </Panel>
              </div>
            </>
          ) : (
            <section aria-labelledby="themes-title">
              <Stack>
                <h2
                  mix={css({ margin: 0, fontSize: "18px" })}
                  id="themes-title"
                >
                  Theme comparison
                </h2>
                <div mix={comparison}>
                  {(Object.keys(themes) as ThemeName[]).map((name) => (
                    <div
                      data-comparison={name}
                      mix={[
                        themeStyles(themes[name]),
                        themeRoot,
                        css({ padding: "12px" }),
                      ]}
                    >
                      <Panel>
                        <Stack>
                          <h3 mix={css({ margin: 0, fontSize: "16px" })}>
                            {name === "clean"
                              ? "Clean"
                              : name === "tactile"
                                ? "Radio"
                                : "Artbin"}
                          </h3>
                          <Field id={`${name}-name`} label="Collection name">
                            <Input placeholder="Evening sketches…" />
                          </Field>
                          <Inline>
                            <Button variant="primary">Save collection</Button>
                            <Button disabled>Export</Button>
                          </Inline>
                          <Notice tone="success">All changes saved</Notice>
                        </Stack>
                      </Panel>
                    </div>
                  ))}
                </div>
              </Stack>
            </section>
          )}
          <p mix={muted}>
            Fixtures only. No accounts, persistence or production requests.
          </p>
        </main>
      </div>
    );
  },
);
