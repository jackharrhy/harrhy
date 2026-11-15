import { clientEntry, css, on } from "remix/component";
import type { Handle } from "remix/component";
import {
  Badge,
  Button,
  ButtonLink,
  Checkbox,
  Field,
  Inline,
  Input,
  Notice,
  Panel,
  Select,
  Stack,
  Textarea,
} from "@harrhy/ui/native";
import {
  ActionButton,
  Dialog,
  Tabs,
  TabList,
  Tab,
  TabPanel,
} from "@harrhy/ui/interactive";
import {
  brutalistTheme,
  cleanTheme,
  composeTheme,
  tactileTheme,
  themeRoot,
  themeStyles,
} from "@harrhy/ui/theme";

const themes = {
  clean: cleanTheme,
  tactile: tactileTheme,
  brutalist: brutalistTheme,
};
export type ThemeName = keyof typeof themes;
export interface ShowcaseProps {
  theme: ThemeName;
  query: string;
  submitted: boolean;
}
const shell = css({
  margin: 0,
  minHeight: "100vh",
  "& *": { boxSizing: "border-box" },
  "& h1": { fontSize: "1.75rem", lineHeight: "1.2", margin: "0 0 0.75rem" },
  "& h2": { fontSize: "1.125rem", margin: "0 0 0.5rem" },
  "& h3": { fontSize: "1rem", margin: "0 0 0.5rem" },
  "& p": { margin: "0 0 0.75rem", maxWidth: "70ch" },
  "& a": { color: "inherit", textUnderlineOffset: "0.2em" },
  "& summary": { cursor: "pointer", padding: "0.75rem 0" },
  "& pre": {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    fontFamily: "var(--hui-font-code)",
    fontSize: "0.8125rem",
    margin: "0.75rem 0",
    padding: "1rem",
    background: "var(--hui-canvas)",
    border: "1px solid var(--hui-border)",
  },
});
const header = css({
  padding: "1rem max(1.25rem, calc((100vw - 1240px) / 2))",
  borderBottom: "1px solid var(--hui-border)",
  background: "var(--hui-surface)",
  display: "flex",
  gap: "1rem",
  justifyContent: "space-between",
  flexWrap: "wrap",
  alignItems: "center",
});
const main = css({
  maxWidth: "1280px",
  margin: "0 auto",
  padding: "2rem 1.25rem 4rem",
  display: "grid",
  gap: "2rem",
});
const grid = css({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "1.25rem",
  alignItems: "start",
  "@media (max-width: 760px)": { gridTemplateColumns: "1fr" },
});
const compareGrid = css({
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "1rem",
  "@media (max-width: 1000px)": { gridTemplateColumns: "1fr" },
});
const muted = css({ color: "var(--hui-muted)", fontSize: "0.875rem" });
const code = `import { Field, Input, Button } from "@harrhy/ui/native";\n\n<Field id="board-title" label="Board title"\n  description="Only visible to you.">\n  <Input name="title" required />\n</Field>\n<Button type="submit" variant="primary">Create board</Button>`;
const themeCode = `import { composeTheme, tactileTheme, themeStyles, themeRoot } from "@harrhy/ui/theme";\nimport { Button } from "@harrhy/ui/native";\n\nconst roomTheme = composeTheme(tactileTheme, {\n  controlHeight: "2.75rem",\n});\n<section mix={[themeStyles(roomTheme), themeRoot]}>\n  <Button variant="primary">Join room</Button>\n</section>`;

export const Showcase = clientEntry(
  import.meta.url,
  function Showcase(handle: Handle<ShowcaseProps>) {
    let theme = handle.props.theme;
    let boardState: "empty" | "saved" = "empty";
    let access: "pending" | "allowed" | "denied" = "pending";
    let copyState = "";
    let validationState: "invalid" | "help" | "plain" = "invalid";
    let dialogOpen = false;
    let asyncState = "No fixture exported.";
    let exportCount = 0;
    async function exportFixture({ signal }: { signal: AbortSignal }) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 1200);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(signal.reason);
          },
          { once: true },
        );
      });
      signal.throwIfAborted();
      exportCount++;
      asyncState = `Fixture export ${exportCount} complete. No files were uploaded.`;
      handle.update();
    }
    async function copy(text: string) {
      try {
        await navigator.clipboard.writeText(text);
        copyState = "Copied code.";
      } catch {
        copyState = "Clipboard unavailable. Select the code below to copy it.";
      }
      handle.update();
    }
    return () => (
      <div
        mix={[themeStyles(themes[theme]), themeRoot, shell]}
        data-theme={theme}
      >
        <header mix={header}>
          <strong>Harrhy / UI workbench</strong>
          <nav
            aria-label="Showcase sections"
            mix={css({ display: "flex", flexWrap: "wrap", gap: "1.25rem" })}
          >
            <a href="#patterns">Patterns</a>
            <a href="#compare">Theme comparison</a>
            <a href="#states">States</a>
            <a href="#code">Code</a>
          </nav>
        </header>
        <main mix={main}>
          <section aria-labelledby="title">
            <h1 id="title">Component workbench</h1>
            <p>
              Native controls, shared recipes, different surfaces. Try the same
              Auth and Ref patterns in three expressions.
            </p>
            <Inline>
              <label htmlFor="theme">Workbench theme</label>
              <Select
                id="theme"
                name="theme"
                value={theme}
                mix={[
                  css({ width: "auto", minWidth: "12rem" }),
                  on("change", (event) => {
                    theme = event.currentTarget.value as ThemeName;
                    handle.update();
                  }),
                ]}
              >
                <option value="clean">Clean / Auth + Ref</option>
                <option value="tactile">Tactile / Radio + PictoChat</option>
                <option value="brutalist">Brutalist / Artbin</option>
              </Select>
              <span mix={muted}>
                Local fixtures. No account, network mutation, or saved data.
              </span>
            </Inline>
          </section>
          <div id="patterns" mix={grid}>
            <Panel aria-labelledby="auth-title">
              <Stack>
                <div>
                  <h2 id="auth-title">Auth · consent</h2>
                  <p mix={muted}>
                    Illustrative permission request, not a sign-in screen.
                  </p>
                </div>
                <div>
                  <strong>Ref wants to access your profile</strong>
                  <p>
                    Share your display name with this app. Email and other
                    projects stay private.
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
                        ? "Access allowed in this fixture. No permissions were changed."
                        : "Access denied in this fixture. Nothing was shared."}
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
                  <h2 id="ref-title">Ref · create a board</h2>
                  <p mix={muted}>
                    Browser validation and local component state.
                  </p>
                </div>
                <form
                  mix={[
                    css({ display: "grid", gap: "1rem" }),
                    on("submit", (event) => {
                      event.preventDefault();
                      boardState = "saved";
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
                      placeholder="Workshop references"
                    />
                  </Field>
                  <Field id="board-description" label="Description">
                    <Textarea
                      name="description"
                      rows={2}
                      placeholder="What belongs on this board?"
                    />
                  </Field>
                  <label>
                    <Checkbox name="private" defaultChecked /> Keep this board
                    private
                  </label>
                  <Inline>
                    <Button type="submit" variant="primary">
                      Create board
                    </Button>
                    <Button
                      type="reset"
                      mix={on("click", () => {
                        boardState = "empty";
                        handle.update();
                      })}
                    >
                      Reset
                    </Button>
                  </Inline>
                </form>
                <Notice
                  role="status"
                  tone={boardState === "saved" ? "success" : "neutral"}
                >
                  {boardState === "saved"
                    ? "Board created in memory. Reload to clear this fixture."
                    : "No boards yet. Create one to test the success state."}
                </Notice>
              </Stack>
            </Panel>
          </div>
          <section aria-labelledby="compare-title" id="compare">
            <h2 id="compare-title">Same components, three expressions</h2>
            <p mix={muted}>
              Theme data changes; semantics, sizing contracts, and focus
              behavior stay shared.
            </p>
            <div mix={compareGrid}>
              {(Object.keys(themes) as ThemeName[]).map((name) => (
                <div
                  mix={[
                    themeStyles(
                      composeTheme(themes[name], { textSize: "0.9375rem" }),
                    ),
                    themeRoot,
                    css({ padding: "0.75rem" }),
                  ]}
                  data-comparison={name}
                >
                  <Panel>
                    <Stack>
                      <h3>
                        {name === "clean"
                          ? "Clean · Auth / Ref"
                          : name === "tactile"
                            ? "Tactile · Radio / PictoChat"
                            : "Brutalist · Artbin"}
                      </h3>
                      <Field id={`${name}-name`} label="Collection name">
                        <Input placeholder="Evening sketches" />
                      </Field>
                      <Inline>
                        <Button variant="primary">Save collection</Button>
                        <Button disabled>Export</Button>
                      </Inline>
                      <Notice tone="success">
                        All changes saved · example state
                      </Notice>
                    </Stack>
                  </Panel>
                </div>
              ))}
            </div>
          </section>
          <div mix={grid}>
            <Panel id="states" aria-labelledby="states-title">
              <Stack>
                <h2 id="states-title">Control states</h2>
                <Inline>
                  <Button variant="primary">Primary</Button>
                  <Button>Secondary</Button>
                  <Button variant="quiet">Quiet</Button>
                  <Button variant="danger">Delete</Button>
                  <Button disabled>Unavailable</Button>
                  <Button disabled aria-busy="true">
                    Saving…
                  </Button>
                </Inline>
                <p mix={muted}>
                  Static specimens above: hover, press, or Tab to inspect.
                  Saving and unavailable are intentionally disabled.
                </p>
                <Field
                  id="invalid-url"
                  label="Source URL"
                  description={
                    validationState === "plain"
                      ? undefined
                      : validationState === "help"
                        ? "Address format accepted in this fixture."
                        : "Use a full HTTPS address."
                  }
                  error={
                    validationState === "invalid"
                      ? "Enter an address beginning with https://."
                      : undefined
                  }
                >
                  <Input
                    name="invalid-url"
                    value={
                      validationState === "invalid"
                        ? "not-an-address"
                        : "https://example.com/reference"
                    }
                  />
                </Field>
                <Inline>
                  <Button
                    mix={on("click", () => {
                      validationState =
                        validationState === "invalid"
                          ? "help"
                          : validationState === "help"
                            ? "plain"
                            : "invalid";
                      handle.update();
                    })}
                  >
                    Cycle field validation
                  </Button>
                </Inline>
                <Field id="readonly" label="Read-only identifier">
                  <Input value="board_sketches" readOnly />
                </Field>
                <Field
                  id="disabled"
                  label="Disabled title"
                  description="Available after selecting a collection."
                >
                  <Input disabled value="No collection selected" />
                </Field>
                <Notice tone="danger">
                  Could not save. Your draft is still here; try again.
                </Notice>
                <ButtonLink href="#patterns">
                  Return to working patterns
                </ButtonLink>
              </Stack>
            </Panel>
            <Panel aria-labelledby="get-title">
              <Stack>
                <h2 id="get-title">Native GET · filter fixture</h2>
                <p mix={muted}>
                  Works without JavaScript. Submitting reloads this document;
                  nothing is persisted.
                </p>
                <form
                  method="get"
                  action="/"
                  mix={css({ display: "grid", gap: "1rem" })}
                >
                  <input type="hidden" name="theme" value={theme} />
                  <Field
                    id="query"
                    label="Find a component"
                    description="Try Button, Input, or a name with no matches."
                  >
                    <Input
                      type="search"
                      name="q"
                      defaultValue={handle.props.query}
                      maxLength={100}
                    />
                  </Field>
                  <Inline>
                    <Button type="submit" variant="primary">
                      Filter components
                    </Button>
                    <ButtonLink href="/">Clear filter</ButtonLink>
                  </Inline>
                </form>
                <div role="status">
                  {handle.props.submitted ? (
                    <>
                      <strong>
                        Results for “{handle.props.query || "all components"}”
                      </strong>
                      <p>
                        {[
                          "Button",
                          "ButtonLink",
                          "Input",
                          "Textarea",
                          "Select",
                          "Checkbox",
                          "Field",
                          "Panel",
                          "Stack",
                          "Inline",
                          "Notice",
                          "Badge",
                        ]
                          .filter((name) =>
                            name
                              .toLowerCase()
                              .includes(handle.props.query.toLowerCase()),
                          )
                          .join(", ") ||
                          "No matching components. Try Button or clear the filter."}
                      </p>
                    </>
                  ) : (
                    <p>
                      12 components. Submit a filter to inspect the native
                      request path.
                    </p>
                  )}
                </div>
              </Stack>
            </Panel>
          </div>
          <Panel aria-labelledby="interaction-title">
            <Stack>
              <h2 id="interaction-title">Managed interactions</h2>
              <Tabs defaultActiveTab="room">
                <TabList aria-label="Interaction examples">
                  <Tab name="room">Radio room</Tab>
                  <Tab name="archive">Artbin export</Tab>
                </TabList>
                <TabPanel name="room">
                  <Stack>
                    <p>
                      A controlled native modal keeps keyboard focus inside its
                      task.
                    </p>
                    <Inline>
                      <Button
                        mix={on("click", () => {
                          dialogOpen = true;
                          handle.update();
                        })}
                      >
                        Edit room name
                      </Button>
                    </Inline>
                  </Stack>
                </TabPanel>
                <TabPanel name="archive">
                  <Stack>
                    <p>
                      Local async fixture · 1.2 second delay. Repeat activation
                      is guarded while pending.
                    </p>
                    <Inline>
                      <ActionButton
                        variant="primary"
                        action={exportFixture}
                        pendingLabel="Exporting fixture…"
                        onError={() => {
                          asyncState = "Export failed. Try again.";
                          handle.update();
                        }}
                      >
                        Export fixture
                      </ActionButton>
                    </Inline>
                    <p role="status">{asyncState}</p>
                  </Stack>
                </TabPanel>
              </Tabs>
              <Dialog
                open={dialogOpen}
                title="Edit room name"
                description="This fixture does not save a real room."
                initialFocus="#room-name"
                onClose={() => {
                  dialogOpen = false;
                  handle.update();
                }}
              >
                <form
                  mix={[
                    css({ display: "grid", gap: "1rem" }),
                    on("submit", (event) => {
                      event.preventDefault();
                      dialogOpen = false;
                      handle.update();
                    }),
                  ]}
                >
                  <Field id="room-name" label="Room name">
                    <Input name="room" defaultValue="Evening radio" required />
                  </Field>
                  <Inline>
                    <Button type="submit" variant="primary">
                      Save room name
                    </Button>
                    <Button
                      mix={on("click", () => {
                        dialogOpen = false;
                        handle.update();
                      })}
                    >
                      Cancel
                    </Button>
                  </Inline>
                </form>
              </Dialog>
            </Stack>
          </Panel>
          <Panel id="code" aria-labelledby="code-title">
            <Stack>
              <h2 id="code-title">Copy a starting point</h2>
              <p mix={muted}>
                Import controls from @harrhy/ui/native and managed interactions
                from @harrhy/ui/interactive. Fields connect labels,
                descriptions, and errors to their child control.
              </p>
              <details open>
                <summary>Ref field + action</summary>
                <Button mix={on("click", () => copy(code))}>
                  Copy field example
                </Button>
                <pre>
                  <code>{code}</code>
                </pre>
              </details>
              <details>
                <summary>Compose a scoped theme</summary>
                <Button mix={on("click", () => copy(themeCode))}>
                  Copy theme example
                </Button>
                <pre>
                  <code>{themeCode}</code>
                </pre>
              </details>
              <span role="status">{copyState}</span>
            </Stack>
          </Panel>
          <footer mix={muted}>
            Internal workbench · native Remix 3 · illustrative app patterns, not
            production screens
          </footer>
        </main>
      </div>
    );
  },
);
