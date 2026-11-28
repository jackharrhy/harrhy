import { space } from "@harrhy/ui/styles";
import { checkboxLabelStyles } from "@harrhy/ui/recipes";
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
import { WorkbenchHeader } from "./workbench.tsx";
import {
  sceneLabel,
  WorkbenchWorkspace,
  workbenchShell,
} from "./workspace.tsx";
import { displayStyles, themeRoot } from "@harrhy/ui/theme";
import { themes, themeLabels } from "./themes.ts";
import { type ThemeName, type Density, workbenchTheme } from "./themes.ts";
import { RadioScene } from "./radio/scene.tsx";
import { SluggersScene } from "./sluggers/scene.tsx";

const shell = css({
  "& *": { boxSizing: "border-box" },
});
const main = css({
  maxWidth: "80rem",
  margin: "0 auto",
  padding: `${space(4)} ${space(3)} ${space(8)}`,
  display: "grid",
  gap: space(3.5),
  "@media (max-width: 37.5rem)": { padding: `${space(3)} ${space(2)}` },
});
const grid = css({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: space(3),
  alignItems: "start",
  "@media (max-width: 47.5rem)": { gridTemplateColumns: "1fr" },
});
const comparison = css({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: space(2),
  "@media (max-width: 62.5rem)": { gridTemplateColumns: "1fr" },
});
const muted = css({
  margin: 0,
  color: "var(--hui-muted)",
  fontSize: "0.875rem",
});

export const Scenes = clientEntry(
  import.meta.url,
  function Scenes(
    handle: Handle<{ theme: ThemeName; scene: string; density: Density }>,
  ) {
    let theme = handle.props.theme;
    let density = handle.props.density;
    let access: "pending" | "allowed" | "denied" = "pending";
    let board: string | null = null;
    return () => (
      <div
        mix={[workbenchTheme(theme, density), themeRoot, workbenchShell, shell]}
      >
        <WorkbenchHeader
          density={density}
          onDensityChange={(next) => {
            density = next;
            handle.update();
          }}
          theme={theme}
          page="scenes"
          title={sceneLabel(handle.props.scene)}
          onThemeChange={(next) => {
            theme = next;
            handle.update();
          }}
        />
        <WorkbenchWorkspace
          density={density}
          scene={handle.props.scene}
          theme={theme}
        >
          <main mix={main}>
            <div>
              <h1
                mix={css({
                  margin: `0 0 ${space(1)}`,
                  fontSize: "1.75rem",
                  lineHeight: "1.2",
                })}
              >
                Scenes
              </h1>
              <p mix={muted}>Compositions with local data.</p>
            </div>
            {handle.props.scene === "radio" ? (
              <RadioScene theme={theme} density={density} />
            ) : handle.props.scene === "sluggers" ? (
              <SluggersScene theme={theme} />
            ) : handle.props.scene === "forms" ? (
              <>
                <div mix={grid}>
                  <Panel aria-labelledby="auth-title">
                    <Stack>
                      <div>
                        <h2
                          mix={css({ margin: 0, fontSize: "1.125rem" })}
                          id="auth-title"
                        >
                          App consent
                        </h2>
                        <p mix={muted}>Auth composition · synthetic account</p>
                      </div>
                      <div>
                        <strong mix={displayStyles}>
                          Ref wants to access your profile
                        </strong>
                        <p>
                          Share your display name with this app. Your email
                          stays private.
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
                          mix={css({ margin: 0, fontSize: "1.125rem" })}
                          id="ref-title"
                        >
                          Create a board
                        </h2>
                        <p mix={muted}>Ref composition · browser validation</p>
                      </div>
                      <form
                        mix={[
                          css({ display: "grid", gap: space(2) }),
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
                        <label mix={checkboxLabelStyles}>
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
                      <Notice
                        role="status"
                        tone={board ? "success" : "neutral"}
                      >
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
                    mix={css({ margin: 0, fontSize: "1.125rem" })}
                    id="themes-title"
                  >
                    Theme comparison
                  </h2>
                  <div mix={comparison}>
                    {(Object.keys(themes) as ThemeName[]).map((name) => (
                      <div
                        data-comparison={name}
                        mix={[
                          workbenchTheme(name, density),
                          themeRoot,
                          css({ padding: space(1.5) }),
                        ]}
                      >
                        <Panel>
                          <Stack>
                            <h3 mix={css({ margin: 0, fontSize: "1rem" })}>
                              {themeLabels[name]}
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
          </main>
        </WorkbenchWorkspace>
      </div>
    );
  },
);
