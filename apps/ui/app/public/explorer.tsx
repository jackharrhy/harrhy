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
import {
  ActionButton,
  Select,
  Dialog,
  Tabs,
  TabList,
  Tab,
  TabPanel,
} from "@harrhy/ui/interactive";
import { themeRoot, themeStyles } from "@harrhy/ui/theme";
import { CodeBlock, CodeDiff } from "@harrhy/ui/code";
import type { DiffLine } from "@harrhy/ui/code";
import { themes } from "./themes.ts";
import type { ThemeName } from "./themes.ts";

export const stories = [
  {
    id: "button",
    name: "Button",
    group: "Actions",
    summary: "An action, with a clear priority.",
  },
  {
    id: "action",
    name: "ActionButton",
    group: "Actions",
    summary: "Async work with retained focus and cancellation.",
  },
  {
    id: "field",
    name: "Field",
    group: "Forms",
    summary: "One control, its label, help and validation.",
  },
  {
    id: "select",
    name: "Select",
    group: "Forms",
    summary: "A themed choice with official Remix UI keyboard interaction.",
  },
  {
    id: "checkbox",
    name: "Checkbox",
    group: "Forms",
    summary: "An independent, labelled choice.",
  },
  {
    id: "textarea",
    name: "Textarea",
    group: "Forms",
    summary: "Room for a longer answer.",
  },
  {
    id: "notice",
    name: "Notice",
    group: "Feedback",
    summary: "Feedback that belongs beside the task.",
  },
  {
    id: "badge",
    name: "Badge",
    group: "Feedback",
    summary: "A short, non-interactive label.",
  },
  {
    id: "dialog",
    name: "Dialog",
    group: "Overlays",
    summary: "A focused task with native focus containment.",
  },
  {
    id: "tabs",
    name: "Tabs",
    group: "Navigation",
    summary: "Related panels, with arrow-key navigation.",
  },
  {
    id: "panel",
    name: "Panel",
    group: "Layout",
    summary: "A named surface for related content.",
  },
  {
    id: "code",
    name: "CodeBlock",
    group: "Code",
    summary: "Selectable source. No runtime highlighter.",
  },
  {
    id: "diff",
    name: "CodeDiff",
    group: "Code",
    summary: "Prepared changes, readable without color.",
  },
] as const;
export type StoryId = (typeof stories)[number]["id"];
const chrome = css({
  color: "#202124",
  background: "#fff",
  minHeight: "100vh",
  fontFamily: "system-ui, sans-serif",
  fontSize: "14px",
  lineHeight: "1.5",
  "& *": { boxSizing: "border-box" },
  "& a": { color: "inherit", textUnderlineOffset: "3px" },
  "& aside input, & aside button, & [data-workbench-controls] input, & [data-source] button":
    {
      font: "inherit",
    },
  "& header :focus-visible, & aside :focus-visible, & [data-workbench-controls] :focus-visible, & [data-source] :focus-visible":
    { outline: "2px solid #0969da", outlineOffset: "3px" },
  "& ::selection": { background: "#d9eaff", color: "#12243b" },
  "& h1": {
    fontSize: "28px",
    lineHeight: "1.2",
    letterSpacing: "-0.025em",
    margin: "0 0 8px",
    fontWeight: 650,
  },
  "& h2": { fontSize: "14px", margin: 0, fontWeight: 600 },
  "& p": { margin: 0 },
  "& code, & pre": {
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
  },
});
const topbar = css({
  display: "flex",
  alignItems: "center",
  gap: "40px",
  borderBottom: "1px solid #dedfe2",
  minHeight: "60px",
  padding: "0 24px",
  "& strong": { letterSpacing: "-0.025em", fontSize: "16px" },
  "& nav": { display: "flex", alignSelf: "stretch", gap: "24px" },
  "& a": {
    display: "flex",
    alignItems: "center",
    textDecoration: "none",
    borderBottom: "2px solid transparent",
  },
  '& a[aria-current="page"]': { borderColor: "#24292f", fontWeight: 600 },
  "@media (max-width: 600px)": { padding: "0 16px", gap: "24px" },
});
const workspace = css({
  display: "grid",
  gridTemplateColumns: "220px minmax(0, 1fr)",
  minHeight: "calc(100vh - 60px)",
  "@media (max-width: 760px)": { gridTemplateColumns: "1fr" },
});
const rail = css({
  padding: "24px 16px",
  borderRight: "1px solid #dedfe2",
  background: "#fafafa",
  "& form": { display: "flex", gap: "4px", marginBottom: "24px" },
  "& input": {
    minWidth: 0,
    width: "100%",
    border: "1px solid #c5c8ce",
    borderRadius: "6px",
    padding: "6px 8px",
    background: "white",
  },
  "& button": {
    border: "1px solid #c5c8ce",
    borderRadius: "6px",
    background: "white",
    cursor: "pointer",
  },
  "& h2": { fontSize: "12px", color: "#59616b", margin: "20px 10px 6px" },
  "& a": {
    display: "block",
    padding: "6px 10px",
    borderRadius: "6px",
    textDecoration: "none",
    marginBottom: "2px",
    "&:hover": { background: "#eceef0" },
  },
  '& a[aria-current="page"]': {
    background: "#e5e9ee",
    color: "#182c48",
    fontWeight: 600,
  },
  "@media (max-width: 760px)": {
    padding: "12px 16px",
    borderRight: 0,
    borderBottom: "1px solid #dedfe2",
    "& nav": { display: "none" },
    "& form": { marginBottom: "8px" },
  },
});
const mobile = css({
  display: "none",
  "@media (max-width: 760px)": {
    display: "block",
    "& summary": { cursor: "pointer", padding: "8px 0" },
  },
});
const contentStyle = css({
  padding: "36px 40px 60px",
  minWidth: 0,
  maxWidth: "1500px",
  "@media (max-width: 1000px)": { padding: "28px 24px" },
  "@media (max-width: 600px)": { padding: "24px 16px" },
});
const introStyle = css({ color: "#59616b", maxWidth: "70ch" });
const toolbar = css({
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  padding: "12px 16px",
  borderBottom: "1px solid #dedfe2",
  background: "#fafafa",
});
const bench = css({
  border: "1px solid #dedfe2",
  borderRadius: "8px",
  overflow: "hidden",
  marginTop: "28px",
});
const specimenLayout = css({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 260px",
  "@media (max-width: 1100px)": { gridTemplateColumns: "1fr" },
});
const stage = css({
  minHeight: "320px",
  padding: "40px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 0,
  "& > div": { width: "100%", maxWidth: "380px" },
  "@media (max-width: 600px)": { padding: "28px 20px", minHeight: "260px" },
});
const controls = css({
  borderLeft: "1px solid #dedfe2",
  background: "#fafafa",
  padding: "20px",
  display: "grid",
  alignContent: "start",
  gap: "16px",
  "& label": { display: "grid", gap: "6px", fontSize: "13px" },
  "& label:has(input[type=checkbox])": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  "& input:not([type=checkbox]), & textarea": {
    width: "100%",
    minWidth: 0,
    color: "#202124",
    background: "white",
    border: "1px solid #c5c8ce",
    borderRadius: "5px",
    padding: "6px 8px",
  },
  "& input[type=checkbox]": {
    accentColor: "#24292f",
    width: "16px",
    height: "16px",
  },
  "@media (max-width: 1100px)": {
    borderLeft: 0,
    borderTop: "1px solid #dedfe2",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    "& h2": { gridColumn: "1 / -1" },
  },
  "@media (max-width: 450px)": { gridTemplateColumns: "1fr" },
});
const source = css({
  borderTop: "1px solid #dedfe2",

  "& button": {
    border: "1px solid #c5c8ce",
    borderRadius: "5px",
    padding: "4px 10px",
    background: "white",
    cursor: "pointer",
  },
});

export const Explorer = clientEntry(
  import.meta.url,
  function Explorer(
    handle: Handle<{ story: StoryId; theme: ThemeName; query: string }>,
  ) {
    let theme = handle.props.theme;
    return () => {
      const { story, query } = handle.props;
      const selected = stories.find((item) => item.id === story)!;
      const filtered = stories.filter((item) =>
        item.name.toLowerCase().includes(query.toLowerCase()),
      );
      return (
        <div mix={[themeStyles(themes.clean), chrome]}>
          <a
            href="#component"
            mix={css({
              position: "absolute",
              left: "-10000px",
              "&:focus": {
                left: "16px",
                top: "12px",
                background: "white",
                zIndex: 10,
                padding: "8px",
              },
            })}
          >
            Skip to component
          </a>
          <header mix={topbar}>
            <strong>Harrhy UI</strong>
            <nav aria-label="Workbench">
              <a href="/" aria-current="page">
                Explorer
              </a>
              <a href="/?view=scenes">Scenes</a>
            </nav>
            <span
              mix={css({
                marginLeft: "auto",
                color: "#59616b",
                fontSize: "12px",
                "@media (max-width: 450px)": { display: "none" },
              })}
            >
              Remix 3
            </span>
          </header>
          <div mix={workspace}>
            <aside mix={rail} aria-label="Components">
              <form method="get" action="/">
                <input
                  name="q"
                  type="search"
                  aria-label="Find a component"
                  placeholder="Find a component…"
                  defaultValue={query}
                />
                <button type="submit">Find</button>
                <input type="hidden" name="component" value={story} />
                <input type="hidden" name="theme" value={theme} />
              </form>
              <nav aria-label="Component navigation">
                {[...new Set(stories.map((item) => item.group))].map(
                  (group) => (
                    <div>
                      <h2>{group}</h2>
                      {filtered
                        .filter((item) => item.group === group)
                        .map((item) => (
                          <a
                            href={`/?component=${item.id}&theme=${theme}&q=${encodeURIComponent(query)}`}
                            aria-current={
                              item.id === story ? "page" : undefined
                            }
                          >
                            {item.name}
                          </a>
                        ))}
                    </div>
                  ),
                )}
              </nav>
              {filtered.length === 0 && (
                <p>
                  No components found. <a href="/">Clear search</a>
                </p>
              )}
              <details mix={mobile}>
                <summary>Component: {selected.name}</summary>
                <div aria-label="Mobile component navigation">
                  {filtered.map((item) => (
                    <a
                      href={`/?component=${item.id}&theme=${theme}&q=${encodeURIComponent(query)}`}
                      aria-current={item.id === story ? "page" : undefined}
                    >
                      {item.name}
                    </a>
                  ))}
                </div>
              </details>
            </aside>
            <main id="component" mix={contentStyle}>
              <h1>{selected.name}</h1>
              <p mix={introStyle}>{selected.summary}</p>
              <details
                aria-label="Official upstream inventory"
                mix={css({
                  marginTop: "20px",
                  fontSize: "12px",
                  color: "#59616b",
                })}
              >
                <summary>
                  Official Remix UI: 10 modules · Select/Tabs adopted
                </summary>
                <p>
                  10 installed subpaths. Popover and Listbox support Select
                  internals. Others are available upstream, not Harrhy adapters.
                  Dialog stays native: upstream has no Dialog.
                </p>
                <ul
                  mix={css({
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "6px 16px",
                    padding: 0,
                    margin: "8px 0 0",
                    listStyle: "none",
                  })}
                >
                  {[
                    "accordion",
                    "anchor",
                    "animation",
                    "combobox",
                    "listbox",
                    "menu",
                    "popover",
                    "select",
                    "tabs",
                    "toggle",
                  ].map((name) => (
                    <li>
                      <a
                        href={`https://github.com/remix-run/remix/tree/main/packages/ui/src/${name}`}
                      >
                        {name}
                      </a>{" "}
                      —{" "}
                      {name === "select" || name === "tabs"
                        ? "adopted"
                        : name === "popover" || name === "listbox"
                          ? "Select internals"
                          : "upstream only"}
                    </li>
                  ))}
                </ul>
              </details>
              {(story === "select" || story === "tabs") && (
                <p mix={introStyle}>
                  Uses official Remix UI {selected.name} with Harrhy theme
                  recipes.
                </p>
              )}
              <Story
                key={story}
                story={story}
                theme={theme}
                onThemeChange={(next) => {
                  theme = next;
                  handle.update();
                }}
              />
              <p
                mix={css({
                  color: "#59616b",
                  fontSize: "12px",
                  marginTop: "20px",
                })}
              >
                Local fixtures. No saved data or production requests.
              </p>
            </main>
          </div>
        </div>
      );
    };
  },
);

const upstreamSelectSource = `import type { Handle } from "remix/component";
import * as select from "@remix-run/ui/select";
import * as popover from "@remix-run/ui/popover";

function Trigger(handle: Handle) {
  const context = handle.context.get(select.Context);
  return () => (
    <button id="visibility-trigger" type="button"
      aria-describedby={context.selectedId}
      mix={[
        select.trigger(),
        select.onSelectChange((event) => console.log(event.value)),
      ]}>
      {context.displayedLabel}
    </button>
  );
}

function Visibility() {
  return () => (
    <select.Context name="visibility" defaultValue="private" defaultLabel="Private">
      <Trigger />
      <popover.Context>
        <div mix={select.popover()}>
          <div aria-labelledby="visibility-trigger" mix={select.list()}>
            <div mix={select.option({ value: "private", label: "Private" })}>Private</div>
            <div mix={select.option({ value: "shared", label: "Shared" })}>Shared</div>
          </div>
        </div>
      </popover.Context>
      <input mix={select.hiddenInput()} />
    </select.Context>
  );
}`;

const upstreamTabsSource = `import * as tabs from "@remix-run/ui/tabs";

function CollectionTabs() {
  return () => (
    <tabs.Context defaultActiveTab="overview">
      <div mix={tabs.root()}>
        <div aria-label="Collection" mix={tabs.list()}>
          <button type="button" mix={tabs.tab({ name: "overview" })}>Overview</button>
          <button type="button" mix={tabs.tab({ name: "activity" })}>Activity</button>
        </div>
        <div mix={tabs.panel({ name: "overview" })}>Collection details</div>
        <div mix={tabs.panel({ name: "activity" })}>No changes yet.</div>
      </div>
    </tabs.Context>
  );
}`;

const demoDiff: readonly DiffLine[] = [
  {
    kind: "context",
    text: 'import { Button } from "@harrhy/ui/native";',
    oldLine: 1,
    newLine: 1,
  },
  { kind: "context", text: "", oldLine: 2, newLine: 2 },
  { kind: "remove", text: "<Button>Submit</Button>", oldLine: 3 },
  {
    kind: "add",
    text: '<Button variant="primary">Save collection</Button>',
    newLine: 3,
  },
];

function Story(
  handle: Handle<{
    story: StoryId;
    theme: ThemeName;
    onThemeChange: (theme: ThemeName) => void;
  }>,
) {
  let variant: "primary" | "secondary" | "quiet" | "danger" = "primary";
  let tone: "neutral" | "success" | "danger" = "neutral";
  let label =
    handle.props.story === "badge"
      ? "Private"
      : handle.props.story === "notice"
        ? "Your draft is ready."
        : "Save changes";
  let disabled = false;
  let error = false;
  let description = true;
  let checked = true;
  let failAction = false;
  let resultFailed = false;
  let open = false;
  let result = "";
  let copied = "";
  let activeTab = "overview";
  let codeSource =
    'import { Button } from "@harrhy/ui/native";\n\n<Button variant="primary">Save collection</Button>\n';
  let language = "tsx";
  let longLine = false;
  let lineNumbers = true;
  let emptyDiff = false;
  async function run({ signal }: { signal: AbortSignal }) {
    const shouldFail = failAction;
    result = "";
    resultFailed = false;
    handle.update();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1200);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
    if (signal.aborted) return;
    if (shouldFail) throw new Error("Simulated save failure");
    result = "Changes saved in this fixture.";
    handle.update();
  }
  return () => {
    const { story, theme } = handle.props;
    const shownSource =
      codeSource +
      (longLine
        ? `\n// ${"a long line without hidden truncation. ".repeat(80)}`
        : "");
    const diffLines: readonly DiffLine[] = emptyDiff
      ? []
      : lineNumbers
        ? demoDiff
        : demoDiff.map((line) => ({ kind: line.kind, text: line.text }));
    const content =
      story === "code"
        ? `<CodeBlock label="Collection action" language="${language}"\n  source={${JSON.stringify(shownSource)}} />`
        : story === "diff"
          ? '<CodeDiff label="Action label revision" lines={lines} />'
          : story === "button"
            ? `<Button variant="${variant}"${disabled ? " disabled" : ""}>{${JSON.stringify(label)}}</Button>`
            : story === "field"
              ? `<Field id="collection" label="Collection name"${description ? '\n  description="Only visible to you."' : ""}${error ? '\n  error="Enter a collection name."' : ""}>\n  <Input name="name"${disabled ? " disabled" : ""} required />\n</Field>`
              : story === "action"
                ? `// save receives { signal }; honor it before side effects.\n<ActionButton action={save} pendingLabel="Saving…"${disabled ? " disabled" : ""}\n  onError={reportError}>Save changes</ActionButton>`
                : story === "dialog"
                  ? '<Dialog open={open} title="Rename collection"\n  onClose={() => { open = false; handle.update(); }}>\n  {/* labelled form and explicit close actions */}\n</Dialog>'
                  : story === "tabs"
                    ? `<Tabs defaultActiveTab="${activeTab}">\n  <TabList aria-label="Collection">\n    <Tab name="overview">Overview</Tab>\n    <Tab name="activity"${disabled ? " disabled" : ""}>Activity</Tab>\n  </TabList>\n  <TabPanel name="overview">Collection details</TabPanel>\n  <TabPanel name="activity">No changes yet.</TabPanel>\n</Tabs>`
                    : story === "notice"
                      ? `<Notice tone="${tone}">{${JSON.stringify(label)}}</Notice>`
                      : story === "badge"
                        ? `<Badge>{${JSON.stringify(label)}}</Badge>`
                        : story === "checkbox"
                          ? `<label><Checkbox name="private"${checked ? " defaultChecked" : ""}${disabled ? " disabled" : ""} /> Private collection</label>`
                          : story === "select"
                            ? `<Field id="visibility" label="Visibility">\n  <Select name="visibility" defaultValue="private"${disabled ? " disabled" : ""}\n    options={[{ value: "private", label: "Private" }, { value: "shared", label: "Shared" }]} />\n</Field>`
                            : story === "textarea"
                              ? `<Field id="notes" label="Notes">\n  <Textarea name="notes" rows={3}${disabled ? " disabled" : ""} />\n</Field>`
                              : '<Panel aria-labelledby="collection-title">\n  <Stack>\n    <h2 id="collection-title">Evening sketches</h2>\n    <p>Reference images for the next drawing session.</p>\n  </Stack>\n</Panel>';
    const imports = ["code", "diff"].includes(story)
      ? "@harrhy/ui/code"
      : ["action", "dialog", "tabs", "select"].includes(story)
        ? "@harrhy/ui/interactive"
        : "@harrhy/ui/native";
    const themeImport =
      theme === "clean"
        ? "cleanTheme"
        : theme === "tactile"
          ? "tactileTheme"
          : "brutalistTheme";
    const declaration =
      story === "diff"
        ? `const lines = ${JSON.stringify(diffLines, null, 2)} satisfies readonly DiffLine[];

`
        : "";
    const example = `import { ${stories.find((item) => item.id === story)!.name}${story === "diff" ? ", type DiffLine" : story === "field" ? ", Input" : story === "textarea" ? ", Field" : story === "panel" ? ", Stack" : story === "tabs" ? ", TabList, Tab, TabPanel" : ""} } from "${imports}";\n${story === "select" ? 'import { Field } from "@harrhy/ui/native";\n' : ""}import { ${themeImport}, themeStyles, themeRoot } from "@harrhy/ui/theme";\n\n${declaration}<section mix={[themeStyles(${themeImport}), themeRoot]}>\n${content
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n")}\n</section>`;
    return (
      <section mix={bench} aria-label="Component workbench">
        <div mix={toolbar}>
          <h2>Preview</h2>
          <div mix={css({ display: "grid", gap: "6px", fontSize: "13px" })}>
            <label htmlFor="preview-theme">Theme</label>
            <Select
              id="preview-theme"
              aria-label="Preview theme"
              defaultValue={theme}
              options={[
                { value: "clean", label: "Clean" },
                { value: "tactile", label: "Radio" },
                { value: "brutalist", label: "Artbin" },
              ]}
              onValueChange={(value) => {
                if (value === null) return;
                const next = value as ThemeName;
                const url = new URL(location.href);
                url.searchParams.set("theme", next);
                history.replaceState(null, "", url);
                handle.props.onThemeChange(next);
              }}
            />
          </div>
        </div>
        <div mix={specimenLayout}>
          <div
            data-preview={story}
            data-theme={theme}
            mix={[themeStyles(themes[theme]), themeRoot, stage]}
          >
            <div
              style={{
                maxWidth: ["code", "diff"].includes(story) ? "100%" : "380px",
              }}
            >
              {story === "code" && (
                <CodeBlock
                  label="Collection action"
                  language={language}
                  source={shownSource}
                />
              )}
              {story === "diff" && (
                <Stack>
                  <CodeDiff label="Action label revision" lines={diffLines} />
                  {emptyDiff && <p>No changes in this fixture.</p>}
                </Stack>
              )}
              {story === "button" && (
                <Stack>
                  <Inline>
                    <Button
                      variant={variant}
                      disabled={disabled}
                      mix={on("click", () => {
                        result = "Changes saved in this fixture.";
                        handle.update();
                      })}
                    >
                      {label}
                    </Button>
                    <Button
                      variant="quiet"
                      disabled={disabled}
                      mix={on("click", () => {
                        result = "Changes discarded in this fixture.";
                        handle.update();
                      })}
                    >
                      Cancel
                    </Button>
                  </Inline>
                  <span role="status">{result}</span>
                </Stack>
              )}
              {story === "action" && (
                <Stack>
                  <Inline>
                    <ActionButton
                      action={run}
                      disabled={disabled}
                      pendingLabel="Saving…"
                      onError={() => {
                        resultFailed = true;
                        result =
                          "Could not save. Turn off simulated failure and try again.";
                        handle.update();
                      }}
                    >
                      Save changes
                    </ActionButton>
                  </Inline>
                  {result && (
                    <Notice
                      role="status"
                      tone={resultFailed ? "danger" : "success"}
                    >
                      {result}
                    </Notice>
                  )}
                </Stack>
              )}
              {story === "field" && (
                <Field
                  id="collection"
                  label="Collection name"
                  description={description ? "Only visible to you." : undefined}
                  error={error ? "Enter a collection name." : undefined}
                >
                  <Input
                    name="name"
                    placeholder="Evening sketches"
                    disabled={disabled}
                    required
                  />
                </Field>
              )}
              {story === "select" && (
                <Field id="visibility" label="Visibility">
                  <Select
                    name="visibility"
                    defaultValue="private"
                    disabled={disabled}
                    options={[
                      { value: "private", label: "Private" },
                      { value: "shared", label: "Shared" },
                    ]}
                  />
                </Field>
              )}
              {story === "textarea" && (
                <Field id="notes" label="Notes">
                  <Textarea
                    name="notes"
                    rows={3}
                    disabled={disabled}
                    placeholder="Add a note…"
                  />
                </Field>
              )}
              {story === "checkbox" && (
                <label>
                  <Checkbox
                    name="private"
                    disabled={disabled}
                    checked={checked}
                    mix={on("change", (event) => {
                      checked = event.currentTarget.checked;
                      handle.update();
                    })}
                  />{" "}
                  Private collection
                </label>
              )}
              {story === "notice" && <Notice tone={tone}>{label}</Notice>}
              {story === "badge" && <Badge>{label}</Badge>}
              {story === "panel" && (
                <Panel aria-labelledby="collection-title">
                  <Stack>
                    <h2 id="collection-title">Evening sketches</h2>
                    <p>Reference images for the next drawing session.</p>
                    <Inline>
                      <Badge>Private</Badge>
                      <span>12 references</span>
                    </Inline>
                  </Stack>
                </Panel>
              )}
              {story === "tabs" && (
                <Tabs
                  activeTab={activeTab}
                  onActiveTabChange={(name) => {
                    activeTab = name;
                    handle.update();
                  }}
                >
                  <TabList aria-label="Collection">
                    <Tab name="overview">Overview</Tab>
                    <Tab name="activity" disabled={disabled}>
                      Activity
                    </Tab>
                  </TabList>
                  <TabPanel name="overview">
                    <p>Collection details</p>
                  </TabPanel>
                  <TabPanel name="activity">
                    <p>No changes yet.</p>
                  </TabPanel>
                </Tabs>
              )}
              {story === "dialog" && (
                <>
                  <Button
                    disabled={disabled}
                    mix={on("click", () => {
                      open = true;
                      handle.update();
                    })}
                  >
                    Rename collection
                  </Button>
                  <Dialog
                    open={open}
                    title="Rename collection"
                    initialFocus="#rename"
                    onClose={() => {
                      open = false;
                      handle.update();
                    }}
                  >
                    <form
                      mix={on("submit", (event) => {
                        event.preventDefault();
                        open = false;
                        result = `Renamed to ${String(new FormData(event.currentTarget).get("name"))}.`;
                        handle.update();
                      })}
                    >
                      <Stack>
                        <Field id="rename" label="Collection name">
                          <Input
                            name="name"
                            defaultValue="Evening sketches"
                            required
                          />
                        </Field>
                        <Inline>
                          <Button type="submit" variant="primary">
                            Save name
                          </Button>
                          <Button
                            mix={on("click", () => {
                              open = false;
                              handle.update();
                            })}
                          >
                            Cancel
                          </Button>
                        </Inline>
                      </Stack>
                    </form>
                  </Dialog>
                  <p role="status">{result}</p>
                </>
              )}
            </div>
          </div>
          <div mix={controls} data-workbench-controls="">
            <h2>Controls</h2>
            {story === "code" && (
              <>
                <label>
                  Source
                  <textarea
                    aria-label="Source"
                    rows={6}
                    value={codeSource}
                    mix={on("input", (event) => {
                      codeSource = event.currentTarget.value;
                      handle.update();
                    })}
                  />
                </label>
                <div
                  mix={css({ display: "grid", gap: "6px", fontSize: "13px" })}
                >
                  <label htmlFor="code-language">Language</label>
                  <Select
                    id="code-language"
                    aria-label="Language"
                    defaultValue={language}
                    options={[
                      { value: "tsx", label: "tsx" },
                      { value: "text", label: "text" },
                    ]}
                    onValueChange={(value) => {
                      if (value === null) return;
                      language = value;
                      handle.update();
                    }}
                  />
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={longLine}
                    mix={on("change", (event) => {
                      longLine = event.currentTarget.checked;
                      handle.update();
                    })}
                  />{" "}
                  Long line
                </label>
              </>
            )}
            {story === "diff" && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={lineNumbers}
                    mix={on("change", (event) => {
                      lineNumbers = event.currentTarget.checked;
                      handle.update();
                    })}
                  />{" "}
                  Line numbers
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={emptyDiff}
                    mix={on("change", (event) => {
                      emptyDiff = event.currentTarget.checked;
                      handle.update();
                    })}
                  />{" "}
                  No changes
                </label>
              </>
            )}
            {["button", "notice", "badge"].includes(story) && (
              <label>
                Label
                <input
                  value={label}
                  maxLength={80}
                  mix={on("input", (event) => {
                    label = event.currentTarget.value;
                    handle.update();
                  })}
                />
              </label>
            )}
            {story === "button" && (
              <div mix={css({ display: "grid", gap: "6px", fontSize: "13px" })}>
                <label htmlFor="button-variant">Variant</label>
                <Select
                  id="button-variant"
                  aria-label="Variant"
                  defaultValue={variant}
                  options={[
                    { value: "primary", label: "Primary" },
                    { value: "secondary", label: "Secondary" },
                    { value: "quiet", label: "Quiet" },
                    { value: "danger", label: "Danger" },
                  ]}
                  onValueChange={(value) => {
                    if (value === null) return;
                    variant = value as typeof variant;
                    handle.update();
                  }}
                />
              </div>
            )}
            {story === "notice" && (
              <div mix={css({ display: "grid", gap: "6px", fontSize: "13px" })}>
                <label htmlFor="notice-tone">Tone</label>
                <Select
                  id="notice-tone"
                  aria-label="Tone"
                  defaultValue={tone}
                  options={[
                    { value: "neutral", label: "Neutral" },
                    { value: "success", label: "Success" },
                    { value: "danger", label: "Danger" },
                  ]}
                  onValueChange={(value) => {
                    if (value === null) return;
                    tone = value as typeof tone;
                    handle.update();
                  }}
                />
              </div>
            )}
            {!["notice", "badge", "panel", "code", "diff"].includes(story) && (
              <label>
                <input
                  type="checkbox"
                  checked={disabled}
                  mix={on("change", (event) => {
                    disabled = event.currentTarget.checked;
                    handle.update();
                  })}
                />{" "}
                Disabled
              </label>
            )}
            {story === "field" && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={error}
                    mix={on("change", (event) => {
                      error = event.currentTarget.checked;
                      handle.update();
                    })}
                  />{" "}
                  Error
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={description}
                    mix={on("change", (event) => {
                      description = event.currentTarget.checked;
                      handle.update();
                    })}
                  />{" "}
                  Description
                </label>
              </>
            )}
            {story === "action" && (
              <label>
                <input
                  type="checkbox"
                  checked={failAction}
                  mix={on("change", (event) => {
                    failAction = event.currentTarget.checked;
                    handle.update();
                  })}
                />{" "}
                Simulate failure
              </label>
            )}
            {story === "checkbox" && (
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  mix={on("change", (event) => {
                    checked = event.currentTarget.checked;
                    handle.update();
                  })}
                />{" "}
                Checked
              </label>
            )}
            <p mix={descriptionCss}>
              {story === "code"
                ? "Language is metadata, not a highlighter."
                : story === "diff"
                  ? "Caller-prepared rows. Changes remain readable without color."
                  : story === "tabs"
                    ? "Use arrows, Home and End inside the tab list."
                    : story === "dialog"
                      ? "Escape closes; focus returns to the trigger."
                      : story === "action"
                        ? "1.2s fixture. Repeated activation is guarded."
                        : story === "select"
                          ? "Official Select: arrows/typeahead; Escape returns focus. Hydration required; no native required/reset integration."
                          : story === "field"
                            ? "Error and help IDs compose with the native label."
                            : "Tab to inspect focus. Hover and press to inspect states."}
            </p>
          </div>
        </div>
        {(story === "select" || story === "tabs") && (
          <details
            mix={css({
              padding: "16px",
              borderTop: "1px solid #dedfe2",
              minWidth: 0,
            })}
          >
            <summary>
              Underlying official API: {story === "select" ? "Select" : "Tabs"}
            </summary>
            <p mix={descriptionCss}>
              Adapter composition using @remix-run/ui 0.13.1. Theme recipes and
              Field wiring omitted; the preview above uses these upstream
              behaviors through Harrhy adapters.{" "}
              <a href={`https://ui.remix.run/patterns/${story}/`}>
                Official pattern and examples
              </a>
            </p>
            <CodeBlock
              label={`Official ${story === "select" ? "Select" : "Tabs"} composition`}
              language="tsx"
              source={
                story === "select" ? upstreamSelectSource : upstreamTabsSource
              }
            />
          </details>
        )}
        <div mix={source} data-source="">
          <div mix={toolbar}>
            <h2>Code</h2>
            <button
              type="button"
              mix={on("click", async () => {
                try {
                  await navigator.clipboard.writeText(example);
                  copied = "Copied.";
                } catch {
                  copied = "Select the source to copy.";
                }
                handle.update();
              })}
            >
              Copy code
            </button>
          </div>
          <div mix={css({ padding: "20px", minWidth: 0 })}>
            <CodeBlock label="Code example" language="tsx" source={example} />
          </div>
          <span role="status">{copied}</span>
        </div>
      </section>
    );
  };
}
const descriptionCss = css({
  fontSize: "12px",
  color: "#59616b",
  maxWidth: "35ch",
});
