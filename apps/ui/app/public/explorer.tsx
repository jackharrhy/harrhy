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
  Range,
  Stack,
  Textarea,
} from "@harrhy/ui/native";
import {
  Select,
  Dialog,
  Tabs,
  TabList,
  Tab,
  TabPanel,
} from "@harrhy/ui/interactive";
import { themeRoot, themeStyles } from "@harrhy/ui/theme";
import { CodeDiff } from "@harrhy/ui/code";
import { checkboxLabelStyles } from "@harrhy/ui/recipes";
import { HighlightedCode } from "./highlight.tsx";
import type { DiffLine } from "@harrhy/ui/code";
import { WorkbenchHeader } from "./workbench.tsx";
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
    id: "field",
    name: "Field",
    group: "Forms",
    summary: "One control, its label, help and validation.",
  },
  {
    id: "select",
    name: "Select",
    group: "Forms",
    summary: "Choose one value from a short list.",
  },
  {
    id: "range",
    name: "Range",
    group: "Forms",
    summary: "A native slider with themed focus and a usable hit area.",
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
    summary: "Selectable source with Shiki syntax highlighting.",
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
  color: "var(--hui-ink)",
  background: "var(--hui-canvas)",
  minHeight: "100vh",
  fontFamily: "var(--hui-font-body)",
  fontSize: "14px",
  lineHeight: "1.5",
  "& *": { boxSizing: "border-box" },
  "& a": { color: "inherit", textUnderlineOffset: "3px" },
  "& aside input, & aside button, & [data-workbench-controls] input, & [data-source] button":
    {
      font: "inherit",
    },
  "& header :focus-visible, & aside :focus-visible, & [data-workbench-controls] :focus-visible, & [data-source] :focus-visible":
    { outline: "2px solid var(--hui-focus)", outlineOffset: "3px" },
  "& ::selection": {
    background: "var(--hui-selected-surface)",
    color: "var(--hui-selected-ink)",
  },
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
const workspace = css({
  display: "grid",
  gridTemplateColumns: "220px minmax(0, 1fr)",
  minHeight: "calc(100vh - 60px)",
  "@media (max-width: 760px)": { gridTemplateColumns: "1fr" },
});
const rail = css({
  padding: "24px 16px",
  borderRight: "1px solid var(--hui-border)",
  background: "var(--hui-surface)",
  "& form": { display: "flex", gap: "4px", marginBottom: "24px" },
  "& input": { minWidth: 0, width: "100%" },
  "& h2": {
    fontSize: "12px",
    color: "var(--hui-muted)",
    margin: "20px 10px 6px",
  },
  "& a": {
    display: "block",
    padding: "6px 10px",
    borderRadius: "var(--hui-control-radius)",
    textDecoration: "none",
    marginBottom: "2px",
    "&:hover": { background: "var(--hui-hover-surface)" },
  },
  '& a[aria-current="page"]': {
    background: "var(--hui-selected-surface)",
    color: "var(--hui-selected-ink)",
    fontWeight: 600,
  },
  "@media (max-width: 760px)": {
    padding: "12px 16px",
    borderRight: 0,
    borderBottom: "1px solid var(--hui-border)",
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
const introStyle = css({ color: "var(--hui-muted)", maxWidth: "70ch" });
const toolbar = css({
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  padding: "12px 16px",
  borderBottom: "1px solid var(--hui-border)",
  background: "var(--hui-surface)",
});
const bench = css({
  border: "1px solid var(--hui-border)",
  borderRadius: "var(--hui-panel-radius)",
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
  borderLeft: "1px solid var(--hui-border)",
  background: "var(--hui-surface)",
  padding: "20px",
  display: "grid",
  alignContent: "start",
  gap: "16px",
  "& label": { display: "grid", gap: "6px", fontSize: "13px" },
  "& label:has(input[type=checkbox])": {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minHeight: "24px",
    cursor: "pointer",
  },
  "@media (max-width: 1100px)": {
    borderLeft: 0,
    borderTop: "1px solid var(--hui-border)",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    "& h2": { gridColumn: "1 / -1" },
  },
  "@media (max-width: 450px)": { gridTemplateColumns: "1fr" },
});
const source = css({ borderTop: "1px solid var(--hui-border)" });

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
        <div mix={[themeStyles(themes[theme]), themeRoot, chrome]}>
          <a
            href="#component"
            mix={css({
              position: "absolute",
              left: "-10000px",
              "&:focus": {
                left: "16px",
                top: "12px",
                background: "var(--hui-surface)",
                zIndex: 10,
                padding: "8px",
              },
            })}
          >
            Skip to component
          </a>
          <WorkbenchHeader
            theme={theme}
            page="explorer"
            onThemeChange={(next) => {
              theme = next;
              handle.update();
            }}
          />
          <div mix={workspace}>
            <aside mix={rail} aria-label="Components">
              <form method="get" action="/">
                <Input
                  name="q"
                  type="search"
                  aria-label="Find a component"
                  placeholder="Find a component…"
                  defaultValue={query}
                />
                <Button type="submit">Find</Button>
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
              <Story key={story} story={story} theme={theme} />
              <p
                mix={css({
                  color: "var(--hui-muted)",
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
  let rangeValue = "0.65";
  let actionMode = false;
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
      story === "range"
        ? `<label>Volume<Range name="volume" min="0" max="1" step="0.01" defaultValue="${rangeValue}"${disabled ? " disabled" : ""} /></label>`
        : story === "code"
          ? `<CodeBlock label="Collection action" language="${language}"\n  source={${JSON.stringify(shownSource)}} />`
          : story === "diff"
            ? '<CodeDiff label="Action label revision" lines={lines} />'
            : story === "button"
              ? actionMode
                ? `// save receives { signal }; honor it before side effects.\n<Button action={save} pendingLabel="Saving…"${disabled ? " disabled" : ""}\n  variant="${variant}" onError={reportError}>{${JSON.stringify(label)}}</Button>`
                : `<Button variant="${variant}"${disabled ? " disabled" : ""}>{${JSON.stringify(label)}}</Button>`
              : story === "field"
                ? `<Field id="collection" label="Collection name"${description ? '\n  description="Only visible to you."' : ""}${error ? '\n  error="Enter a collection name."' : ""}>\n  <Input name="name"${disabled ? " disabled" : ""} required />\n</Field>`
                : story === "dialog"
                  ? '<Dialog open={open} title="Rename collection"\n  onClose={() => { open = false; handle.update(); }}>\n  {/* labelled form and explicit close actions */}\n</Dialog>'
                  : story === "tabs"
                    ? `<Tabs defaultActiveTab="${activeTab}">\n  <TabList aria-label="Collection">\n    <Tab name="overview">Overview</Tab>\n    <Tab name="activity"${disabled ? " disabled" : ""}>Activity</Tab>\n  </TabList>\n  <TabPanel name="overview">Collection details</TabPanel>\n  <TabPanel name="activity">No changes yet.</TabPanel>\n</Tabs>`
                    : story === "notice"
                      ? `<Notice tone="${tone}">{${JSON.stringify(label)}}</Notice>`
                      : story === "badge"
                        ? `<Badge>{${JSON.stringify(label)}}</Badge>`
                        : story === "checkbox"
                          ? `<label mix={checkboxLabelStyles}><Checkbox name="private"${checked ? " defaultChecked" : ""}${disabled ? " disabled" : ""} /> Private collection</label>`
                          : story === "select"
                            ? `<Field id="visibility" label="Visibility">\n  <Select name="visibility" defaultValue="private"${disabled ? " disabled" : ""}\n    options={[{ value: "private", label: "Private" }, { value: "shared", label: "Shared" }, { value: "public", label: "Public", disabled: true }]} />\n</Field>`
                            : story === "textarea"
                              ? `<Field id="notes" label="Notes">\n  <Textarea name="notes" rows={3}${disabled ? " disabled" : ""} />\n</Field>`
                              : '<Panel aria-labelledby="collection-title">\n  <Stack>\n    <h2 id="collection-title">Evening sketches</h2>\n    <p>Reference images for the next drawing session.</p>\n  </Stack>\n</Panel>';
    const imports = ["code", "diff"].includes(story)
      ? "@harrhy/ui/code"
      : ["dialog", "tabs", "select"].includes(story)
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
    const example = `import { ${stories.find((item) => item.id === story)!.name}${story === "diff" ? ", type DiffLine" : story === "field" ? ", Input" : story === "textarea" ? ", Field" : story === "panel" ? ", Stack" : story === "tabs" ? ", TabList, Tab, TabPanel" : ""} } from "${imports}";\n${story === "select" ? 'import { Field } from "@harrhy/ui/native";\n' : ""}${story === "checkbox" ? 'import { checkboxLabelStyles } from "@harrhy/ui/recipes";\n' : ""}import { ${themeImport}, themeStyles, themeRoot } from "@harrhy/ui/theme";\n\n${declaration}<section mix={[themeStyles(${themeImport}), themeRoot]}>\n${content
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n")}\n</section>`;
    return (
      <section mix={bench} aria-label="Component workbench">
        <div mix={toolbar}>
          <h2>Preview</h2>
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
                <Stack>
                  <HighlightedCode
                    label="Collection action"
                    language={language}
                    source={shownSource}
                  />
                  <Inline>
                    <Button
                      mix={on("click", async () => {
                        try {
                          await navigator.clipboard.writeText(shownSource);
                          copied = "Source copied exactly.";
                        } catch {
                          copied = "Select the source to copy.";
                        }
                        handle.update();
                      })}
                    >
                      Copy source
                    </Button>
                  </Inline>
                </Stack>
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
                    {actionMode ? (
                      <Button
                        variant={variant}
                        disabled={disabled}
                        action={run}
                        pendingLabel="Saving…"
                        onError={() => {
                          resultFailed = true;
                          result =
                            "Could not save. Turn off simulated failure and try again.";
                          handle.update();
                        }}
                      >
                        {label}
                      </Button>
                    ) : (
                      <Button
                        variant={variant}
                        disabled={disabled}
                        mix={on("click", () => {
                          resultFailed = false;
                          result = "Changes saved in this fixture.";
                          handle.update();
                        })}
                      >
                        {label}
                      </Button>
                    )}
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
              {story === "range" && (
                <label mix={css({ display: "grid", gap: "8px" })}>
                  <span>Volume</span>
                  <Range
                    name="volume"
                    min="0"
                    max="1"
                    step="0.01"
                    value={rangeValue}
                    disabled={disabled}
                    mix={on("input", (event) => {
                      rangeValue = event.currentTarget.value;
                      handle.update();
                    })}
                  />
                  <output>{Math.round(Number(rangeValue) * 100)}%</output>
                </label>
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
                      { value: "public", label: "Public", disabled: true },
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
                <label mix={checkboxLabelStyles}>
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
                  <Textarea
                    aria-label="Source"
                    rows={6}
                    value={codeSource}
                    mix={[
                      css({
                        "--hui-font-control": "var(--hui-font-code)",
                        "--hui-control-text-size": "0.875rem",
                      }),
                      on("input", (event) => {
                        codeSource = event.currentTarget.value;
                        handle.update();
                      }),
                    ]}
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
                  <Checkbox
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
                  <Checkbox
                    checked={lineNumbers}
                    mix={on("change", (event) => {
                      lineNumbers = event.currentTarget.checked;
                      handle.update();
                    })}
                  />{" "}
                  Line numbers
                </label>
                <label>
                  <Checkbox
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
                <Input
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
                <Checkbox
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
                  <Checkbox
                    checked={error}
                    mix={on("change", (event) => {
                      error = event.currentTarget.checked;
                      handle.update();
                    })}
                  />{" "}
                  Error
                </label>
                <label>
                  <Checkbox
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
            {story === "button" && (
              <label>
                <Checkbox
                  checked={actionMode}
                  mix={on("change", (event) => {
                    actionMode = event.currentTarget.checked;
                    result = "";
                    handle.update();
                  })}
                />{" "}
                Async action
              </label>
            )}
            {story === "button" && actionMode && (
              <label>
                <Checkbox
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
                <Checkbox
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
                ? "Shiki TSX highlighting; text stays plain. Large sources fall back to complete plain text."
                : story === "diff"
                  ? "Caller-prepared rows. Changes remain readable without color."
                  : story === "tabs"
                    ? "Use arrows, Home and End inside the tab list."
                    : story === "dialog"
                      ? "Escape closes; focus returns to the trigger."
                      : story === "button" && actionMode
                        ? "1.2s fixture. Repeated activation is guarded."
                        : story === "select"
                          ? "Arrows or type to choose. Escape closes."
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
              borderTop: "1px solid var(--hui-border)",
              minWidth: 0,
            })}
          >
            <summary>
              Headless source: {story === "select" ? "Select" : "Tabs"}
            </summary>
            <p mix={descriptionCss}>
              Unstyled composition.{" "}
              <a href={`https://ui.remix.run/patterns/${story}/`}>
                Official pattern and examples
              </a>
            </p>
            <HighlightedCode
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
            <Button
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
            </Button>
          </div>
          <div mix={css({ padding: "20px", minWidth: 0 })}>
            <HighlightedCode
              label="Code example"
              language="tsx"
              source={example}
            />
          </div>
          <span role="status">{copied}</span>
        </div>
      </section>
    );
  };
}
const descriptionCss = css({
  fontSize: "12px",
  color: "var(--hui-muted)",
  maxWidth: "35ch",
});
