import { css, on, type Handle } from "remix/component";
import {
  Breadcrumbs,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  NavigationMenu,
  NavigationMenuLink,
  Progress,
  TableContainer,
  Table,
  TableCaption,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Heading,
  Text,
  Stack,
  Field,
  Input,
  Checkbox,
} from "@harrhy/ui/native";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
} from "@harrhy/ui/interactive";
import { checkboxLabelStyles } from "@harrhy/ui/recipes";
import { themeRoot, themeStyles } from "@harrhy/ui/theme";
import { themes, type ThemeName } from "./themes.ts";
import { HighlightedCode } from "./highlight.tsx";

export const expandedStories = [
  {
    id: "progress",
    name: "Progress",
    group: "Feedback",
    summary: "Known, unknown and complete native progress.",
  },
  {
    id: "breadcrumbs",
    name: "Breadcrumbs",
    group: "Navigation",
    summary: "An ordered path with a current page.",
  },
  {
    id: "navigation-menu",
    name: "NavigationMenu",
    group: "Navigation",
    summary: "Native route links, not a popup menubar.",
  },
  {
    id: "table",
    name: "Table",
    group: "Content",
    summary: "Compose a caption, headers, rows and totals.",
  },
  {
    id: "collapsible",
    name: "Collapsible",
    group: "Content",
    summary: "Native details and summary; works without scripts.",
  },
  {
    id: "accordion",
    name: "Accordion",
    group: "Content",
    summary: "Official grouped disclosure with keyboard navigation.",
  },
  {
    id: "menu",
    name: "Menu",
    group: "Overlays",
    summary: "Official action menu with typeahead and focus return.",
  },
  {
    id: "typography",
    name: "Typography",
    group: "Content",
    summary: "Heading and Text parts, composed into app content.",
  },
] as const;
export type ExpandedStoryId = (typeof expandedStories)[number]["id"];
export function isExpandedStory(id: string): id is ExpandedStoryId {
  return expandedStories.some((story) => story.id === id);
}

export function ExpandedStory(
  handle: Handle<{ story: ExpandedStoryId; theme: ThemeName }>,
) {
  let value = "42";
  let unknown = false;
  let multiple = false;
  let disabled = false;
  let result = "No action selected.";
  return () => {
    const { story, theme } = handle.props;
    const progress = unknown ? null : Number(value);
    const accordionProps = multiple
      ? { type: "multiple" as const, defaultValue: ["storage"] }
      : { defaultValue: "storage" };
    const content =
      story === "progress"
        ? `<Progress aria-label="Upload" value={${progress}} />`
        : story === "breadcrumbs"
          ? `<Breadcrumbs>\n  <BreadcrumbList>\n    <BreadcrumbItem><BreadcrumbLink href="/?view=scenes&scene=radio">radio</BreadcrumbLink></BreadcrumbItem>\n    <BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbLink href="/?view=scenes&scene=radio">rooms</BreadcrumbLink></BreadcrumbItem>\n    <BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbPage>Evening radio</BreadcrumbPage></BreadcrumbItem>\n  </BreadcrumbList>\n</Breadcrumbs>`
          : story === "navigation-menu"
            ? `<NavigationMenu aria-label="Collections">\n  <NavigationMenuLink href="/?component=navigation-menu" aria-current="page">Browse</NavigationMenuLink>\n  <NavigationMenuLink href="/?component=table">Recent uploads</NavigationMenuLink>\n</NavigationMenu>`
            : story === "table"
              ? `<TableContainer tabindex={0} role="region" aria-label="Upload table">\n  <Table>\n    <TableCaption>Synthetic uploads</TableCaption>\n    <TableHeader><TableRow><TableHead>File</TableHead><TableHead>Size</TableHead></TableRow></TableHeader>\n    <TableBody><TableRow><TableHead scope="row">moss.png</TableHead><TableCell>128 KB</TableCell></TableRow><TableRow><TableHead scope="row">slate.png</TableHead><TableCell>96 KB</TableCell></TableRow></TableBody>\n    <TableFooter><TableRow><TableHead scope="row">Total</TableHead><TableCell>224 KB</TableCell></TableRow></TableFooter>\n  </Table>\n</TableContainer>`
              : story === "collapsible"
                ? `<Collapsible>\n  <CollapsibleTrigger>Archive contents</CollapsibleTrigger>\n  <CollapsibleContent>Two images, ready to review.</CollapsibleContent>\n</Collapsible>`
                : story === "accordion"
                  ? `<Accordion ${multiple ? 'type="multiple" defaultValue={["storage"]}' : 'defaultValue="storage"'}>\n  <AccordionItem value="storage"><Heading level={3}><AccordionTrigger>Storage</AccordionTrigger></Heading><AccordionContent>Files stay in your archive.</AccordionContent></AccordionItem>\n  <AccordionItem value="sharing"${disabled ? " disabled" : ""}><Heading level={3}><AccordionTrigger>Sharing</AccordionTrigger></Heading><AccordionContent>Share a link when you are ready.</AccordionContent></AccordionItem>\n</Accordion>`
                  : story === "menu"
                    ? `<Menu label="Collection actions">\n  <MenuTrigger>Actions</MenuTrigger>\n  <MenuContent onSelect={(item) => { result = item.label; handle.update(); }}>\n    <MenuItem name="rename">Rename</MenuItem>\n    <MenuItem name="download">Download</MenuItem>\n    <MenuItem name="delete" disabled>Delete</MenuItem>\n  </MenuContent>\n</Menu>\n<output aria-live="polite">{result}</output>`
                    : `<Stack>\n  <Heading level={2}>No uploads yet</Heading>\n  <Text tone="muted">Choose files to start your collection.</Text>\n</Stack>`;
    const names =
      story === "progress"
        ? "Progress"
        : story === "breadcrumbs"
          ? "Breadcrumbs, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator"
          : story === "navigation-menu"
            ? "NavigationMenu, NavigationMenuLink"
            : story === "table"
              ? "TableContainer, Table, TableCaption, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell"
              : story === "collapsible"
                ? "Collapsible, CollapsibleTrigger, CollapsibleContent"
                : story === "accordion"
                  ? "Accordion, AccordionItem, AccordionTrigger, AccordionContent"
                  : story === "menu"
                    ? "Menu, MenuTrigger, MenuContent, MenuItem"
                    : "Stack, Heading, Text";
    const interactive = story === "accordion" || story === "menu";
    const themeName =
      theme === "clean"
        ? "cleanTheme"
        : theme === "tactile"
          ? "tactileTheme"
          : "brutalistTheme";
    const source = `import { ${names} } from "@harrhy/ui/${interactive ? "interactive" : "native"}";\n${story === "accordion" ? 'import { Heading } from "@harrhy/ui/native";\n' : ""}import { ${themeName}, themeStyles, themeRoot } from "@harrhy/ui/theme";\n${story === "menu" ? '\n// Inside an app-owned clientEntry; result starts as "No action selected."\n' : interactive ? "\n// Render inside an app-owned clientEntry and boot Remix run().\n" : ""}\n<section mix={[themeStyles(${themeName}), themeRoot]}>\n${content
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n")}\n</section>`;
    return (
      <section aria-label="Component workbench" mix={layout}>
        <Heading level={2}>Preview</Heading>
        <div
          data-preview={story}
          data-theme={theme}
          mix={[themeStyles(themes[theme]), themeRoot, preview]}
        >
          {story === "progress" && (
            <Stack>
              <Progress aria-label="Upload" value={progress} />
              <Text tone="muted">
                {unknown
                  ? "Waiting for a total…"
                  : `${Math.max(0, Math.min(100, Number(value)))}% uploaded`}
              </Text>
            </Stack>
          )}
          {story === "breadcrumbs" && (
            <Breadcrumbs>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/?view=scenes&scene=radio">
                    radio
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbLink href="/?view=scenes&scene=radio">
                    rooms
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbPage>Evening radio</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumbs>
          )}
          {story === "navigation-menu" && (
            <NavigationMenu aria-label="Collections">
              <NavigationMenuLink
                href="/?component=navigation-menu"
                aria-current="page"
              >
                Browse
              </NavigationMenuLink>
              <NavigationMenuLink href="/?component=table">
                Recent uploads
              </NavigationMenuLink>
            </NavigationMenu>
          )}
          {story === "table" && (
            <TableContainer
              tabindex={0}
              role="region"
              aria-label="Upload table"
            >
              <Table>
                <TableCaption>Synthetic uploads</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Size</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableHead scope="row">moss.png</TableHead>
                    <TableCell>128 KB</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead scope="row">slate.png</TableHead>
                    <TableCell>96 KB</TableCell>
                  </TableRow>
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableHead scope="row">Total</TableHead>
                    <TableCell>224 KB</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </TableContainer>
          )}
          {story === "collapsible" && (
            <Collapsible>
              <CollapsibleTrigger>Archive contents</CollapsibleTrigger>
              <CollapsibleContent>
                Two images, ready to review.
              </CollapsibleContent>
            </Collapsible>
          )}
          {story === "accordion" && (
            <Accordion key={String(multiple)} {...accordionProps}>
              <AccordionItem value="storage">
                <Heading level={3}>
                  <AccordionTrigger>Storage</AccordionTrigger>
                </Heading>
                <AccordionContent>Files stay in your archive.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="sharing" disabled={disabled}>
                <Heading level={3}>
                  <AccordionTrigger>Sharing</AccordionTrigger>
                </Heading>
                <AccordionContent>
                  Share a link when you are ready.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
          {story === "menu" && (
            <Stack>
              <Menu label="Collection actions">
                <MenuTrigger>Actions</MenuTrigger>
                <MenuContent
                  onSelect={(item) => {
                    result = item.label;
                    handle.update();
                  }}
                >
                  <MenuItem name="rename">Rename</MenuItem>
                  <MenuItem name="download">Download</MenuItem>
                  <MenuItem name="delete" disabled>
                    Delete
                  </MenuItem>
                </MenuContent>
              </Menu>
              <output aria-live="polite">{result}</output>
            </Stack>
          )}
          {story === "typography" && (
            <Stack>
              <Heading level={2}>No uploads yet</Heading>
              <Text tone="muted">Choose files to start your collection.</Text>
            </Stack>
          )}
        </div>
        <div data-workbench-controls mix={controls}>
          {story === "progress" && (
            <>
              <Field id="progress-value" label="Progress (0–100)">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={value}
                  disabled={unknown}
                  mix={on("input", (event) => {
                    value = event.currentTarget.value;
                    handle.update();
                  })}
                />
              </Field>
              <label mix={checkboxLabelStyles}>
                <Checkbox
                  checked={unknown}
                  mix={on("change", (event) => {
                    unknown = event.currentTarget.checked;
                    handle.update();
                  })}
                />
                Unknown total
              </label>
            </>
          )}
          {story === "accordion" && (
            <>
              <label mix={checkboxLabelStyles}>
                <Checkbox
                  checked={multiple}
                  mix={on("change", (event) => {
                    multiple = event.currentTarget.checked;
                    handle.update();
                  })}
                />
                Allow multiple panels
              </label>
              <label mix={checkboxLabelStyles}>
                <Checkbox
                  checked={disabled}
                  mix={on("change", (event) => {
                    disabled = event.currentTarget.checked;
                    handle.update();
                  })}
                />
                Disable Sharing
              </label>
            </>
          )}
          <Text tone="muted">
            {story === "menu"
              ? "Use arrows, Home/End, typeahead and Escape. Selection is local to this fixture."
              : story === "accordion"
                ? "Use arrows and Home/End between triggers; Enter or Space toggles a panel."
                : story === "collapsible"
                  ? "Native details/summary; no hydration required."
                  : story === "navigation-menu"
                    ? "Ordinary links with aria-current. No popup navigation semantics are claimed."
                    : story === "typography"
                      ? "Apps compose empty states and section headings from these parts; no shared EmptyState wrapper."
                      : story === "breadcrumbs"
                        ? "The Radio scene also composes these parts in its original title bar."
                        : story === "table"
                          ? "A native table, not a sorting/filtering DataTable engine."
                          : "Native progress; an unknown total omits the value attribute."}
          </Text>
        </div>
        <div data-source>
          <Heading level={2}>Code</Heading>
          <HighlightedCode
            label="Example source"
            source={source}
            language="tsx"
          />
        </div>
      </section>
    );
  };
}
const layout = css({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: "1.5rem",
  minWidth: 0,
  "& > *": { minWidth: 0 },
  "& h2": { fontSize: "1rem" },
});
const preview = css({
  padding: "2rem",
  "& > *": { maxWidth: "38rem", marginInline: "auto" },
  "@media (max-width: 600px)": { padding: "1.25rem" },
  minHeight: "12rem",
  minWidth: 0,
  border: "1px solid var(--hui-border)",
  "& h2": { fontSize: "1.5rem" },
  "& h3": { fontSize: "1rem" },
});
const controls = css({ display: "grid", gap: "1rem", maxWidth: "36rem" });
