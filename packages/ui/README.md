# @harrhy/ui

Reusable Remix 3 native components, scoped semantic themes and part recipes. Apps own routing, validation, authentication, mutations, typography choices and client-entry boundaries. The [internal showcase](../../apps/ui/README.md) exercises components without connecting to production Auth or Ref.

## Entry points

- `@harrhy/ui`: compatible legacy styles only, safe for current Worker consumers.
- `@harrhy/ui/native`: native controls (including Button with optional async action), fields, surfaces and layout.
- `@harrhy/ui/interactive`: native modal and official tabs/select/accordion/menu compositions.
- `@harrhy/ui/code`: native SSR code blocks and caller-prepared unified diffs.
- `@harrhy/ui/theme`: semantic token types, composition and theme mixins.
- `@harrhy/ui/recipes`: host-element recipes for imperative or custom composition.
- `@harrhy/ui/styles`: original `createUiTheme` and `ui*Styles` exports.

Existing Auth/Ref imports retain their original CSS and geometry. Separate native/interactive subpaths keep browser DOM host types and headless interactions out of current Cloudflare Worker consumers; the package root does not eagerly import a component barrel. The new `--hui-*` contract is deliberately independent of legacy `--ui-*` variables. No global control reset, font download, icon set or app shell is installed.

## Native forms

```tsx
import { Button, Field, Input, Stack } from "@harrhy/ui/native";

<form method="post" action="/account/email">
  <Stack>
    <Field
      id="email"
      label="Email"
      description="Used for recovery."
      error={errors.email}
    >
      <Input name="email" type="email" autocomplete="email" required />
    </Field>
    <Button type="submit" name="intent" value="save" variant="primary">
      Save email
    </Button>
  </Stack>
</form>;
```

`Button` defaults to `type="button"`; submission must be explicit. `ButtonLink` requires a real `href`; it does not invent disabled-link semantics. Both forward native Remix host props and `mix`. Caller mixins run after recipe mixins; CSS order is **not** an override mechanism. Override theme variables or supply deliberate selectors/layers.

### Optional Button action

There is one public `Button`. Ordinary buttons keep native submit/reset behavior with no pending policy. Inside an app-owned `clientEntry(...)`, opt into an async command with all three props together:

```tsx
<Button action={save} pendingLabel="Saving…" onError={reportError}>
  Save changes
</Button>
```

`save({signal})` returns a Promise. The props form a typed union: action mode requires `pendingLabel` and `onError`, permits only `type="button"`, and cannot accidentally submit/reset a form. No Promise detection runs on arbitrary native event mixins. A private composition owns idle/pending state, repeat guards, retained focus, `aria-busy`/`aria-disabled`, and a polite announcement after one second. Caller `preventDefault()` vetoes dispatch; a disabled fieldset is respected. Unmounting or leaving action mode aborts the signal and clears timers; late settlements cannot update disposed state. Callers must honor the signal before side effects. Errors go to the required owner's callback and allow retry; business outcomes stay app-owned. Do not throw from `onError`.

`Field` owns one control's ID, label, description and server-error relationships. Use `Input`, `Textarea` or interactive `Select` inside it; the field ID takes precedence over a control's ID. Authored `aria-describedby` IDs are deduplicated and merged with field IDs. A supplied error marks the control invalid; no error preserves caller `aria-invalid`. Errors are not automatic live alerts: server rendering or focused invalid controls should not announce the same error twice. Controllers own validation, error text and focus-on-submit policy. Native required/type validation remains active for Input/Textarea, not the interactive Select. Use `fieldset`/`legend` for groups, and a native wrapping label with `checkboxLabelStyles` from `/recipes` for `Checkbox` (16px visible square, 24px label target, first-line multiline alignment). `Input` is the text-like control recipe; use Range for native sliders and app-owned recipes for file controls rather than applying Input to specialized media controls.

`Range` fixes `type="range"`, preserves native arrows/Home/End and value events, and provides a 24px minimum hit area, themed accent and visible focus. Label it using a wrapping label, `aria-label` or `aria-labelledby`. Apps own units, displayed values and commit policy; it does not synthesize slider interaction or pointer scrubbing.

`Panel`, `Stack`, `Inline`, `Notice` and `Badge` provide small semantic/spacing compositions. `Notice` has no forced live-region role; add `role="status"` or `role="alert"` only when the update needs announcement. Panel renders a section; name it with a heading or ARIA label when it is a navigable region.

## Compositional content and navigation

The native entry also exports:

- `Heading` (`level` 1–6, default 2) and `Text` (`tone="muted"` optionally). They forward native host props/mixins; apps own hierarchy, sizes and content. Compose empty states, item rows and section headings from these parts rather than adopting an app-shaped shared wrapper.
- `Progress` uses native `<progress>`. Supply an accessible name and `value: number | null`; null/non-finite values omit the value attribute (unknown total). Finite values clamp to 0–max; max defaults to 100 and invalid maxima fall back to 100. Apps own visible labels, units, completion announcements and task state. Native indeterminate behavior works without a client runtime.
- `Breadcrumbs`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbPage`, `BreadcrumbSeparator` compose nav/ol/li/anchor/current-page/span semantics. Put each separator **inside** the following item; separators are hidden from accessibility APIs. Apps own the path, links and optional truncation. Both Artbin and the Radio showcase use these parts; production Radio is unchanged.
- `NavigationMenu` and `NavigationMenuLink` are named native route navigation with `aria-current="page"` supplied by the app. They are intentionally ordinary links, **not** a popup navigation-menu/menubar widget or roving-focus toolbar.
- `TableContainer`, `Table`, `TableCaption`, `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead`, `TableCell` retain native table structure. TableHead defaults to column scope; set `scope="row"` for row headers. Container only provides bounded horizontal overflow; add a name, `role="region"` and `tabindex={0}` when keyboard scrolling is needed. Sorting, selection, pagination and data models remain app-owned.
- `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` render native details/summary/div. Use native `open`, `name` and toggle events; summary must be the first child. This is not the SDK imperative Collapsible controller. It works without hydration; use Accordion for an interactive grouped widget.

No EmptyState, Item or SectionHeading wrapper is exported. Theme tokens apply to these small parts without installing an app shell.

## Theme composition

```tsx
import {
  cleanTheme,
  composeTheme,
  themeRoot,
  themeStyles,
} from "@harrhy/ui/theme";

const accountTheme = themeStyles(
  composeTheme(cleanTheme, {
    fontUi: '"My local font", system-ui, sans-serif',
    accent: "#244753",
    controlHeight: "2.75rem",
  }),
);

<section mix={[accountTheme, themeRoot]}>{/* components */}</section>;
```

Compose **data first**, emit one theme mixin per scope. `ThemeTokens` describes semantic canvas/surface/elevated/ink/muted/border/accent/focus/danger/success roles, display/UI/mono typography, spacing and density, control and panel geometry, motion and component-part treatments. Background images have their own tokens: never put a gradient in a border-color token. `cleanTheme`, Radio-inspired `tactileTheme` and Artbin-inspired `brutalistTheme` are independent expressions, not behavior switches. Subtrees may each choose a theme; state and accessibility semantics do not change with appearance. Tactile textures/gradients reference Radio. Brutalist follows the live Artbin kitchen sink and `apps/artbin/app/ui/styles.ts`: Fraunces display headings/callouts, IBM Plex Sans body/controls, and IBM Plex Mono code/small details, white surfaces on #f0f0f0, #111 ink, 1px #ccc panel borders and #888 essential input borders, #222 button borders, compact square controls and no shadows. Semantic feedback retains Artbin red/green (success ink is slightly darkened to #008700 for ≥4.5:1 on its pale green surface); focus deliberately keeps a visible outline rather than copying its outline reset. Button border/density and field-label tokens allow these differences without app selectors. Artbin and the showcase explicitly self-host the optional [package font resources](fonts/README.md), with SOFT 30/WONK 1 reserved for Fraunces display text. Hosts serve `fonts.css` and its relative `fonts/*.woff2` files through their asset server; importing a theme or component never loads them. Preserve the [OFL notices](THIRD_PARTY_NOTICES.md). Radio remains unmigrated; Artbin production cutover is a separate deployment decision.

The three family roles are `fontDisplay`, `fontUi` and `fontMono`, emitted as `--hui-font-display`, `--hui-font-ui` and `--hui-font-mono`. `themeRoot` applies UI typography to body text and display typography to h1/h2/h3; `displayStyles` from `/theme` opts a short expressive callout into the same treatment. Display variation/optical sizing are separate tokens, never inherited into UI/code. The detail-part font maps to UI by default and Mono in Artbin, keeping badges, field labels and code language metadata restrained without conditional component branches. Clean/Radio retain system UI/display and their existing code stacks. The package names families but does not load assets; the shared font guide records provenance and hosts own their preload/on-use loading policy.

Recipes consume the nearest variables, so subtree overrides inherit naturally. Apply `themeRoot` for scoped typography/canvas/selection and reduced-motion tokens. Theme mixins alone only set variables. No theme provider or browser script is required. Prefer one composed theme per element: stacking conflicting `css()` mixins does not guarantee precedence. Native inputs retain browser forced-colors treatment; focus uses an outline rather than a shadow alone. Select popup padding, inner/outer radii and row gap are separate tokens: Clean uses 10/6px radii and 6px padding, Radio 5/2px and 3px, Artbin remains square. Selected rows use a persistent checkmark and selected tonal surface; navigation uses a separate hover surface and inset keyboard ring. On narrow/coarse-pointer screens, the official popover anchor places the menu below the trigger instead of overlaying its selected row. Menus are viewport-bounded, at least 160px wide when space permits, with 40px option targets; desktop keeps compact selected-row alignment. Disabled controls use readable muted ink, not compounded opacity.

## Interactive components

Apps must render these inside their own `clientEntry(...)` boundary and boot Remix `run()`. The package does not force hydration on server forms. Include `@harrhy/ui` and its pinned `@remix-run/ui` dependency in your asset server's allowed package graph as required by your host.

- **Dialog**: controlled `open`, `title`, optional `description`/`initialFocus` selector, `onClose({reason,value})` and children. Uses real `showModal()` for focus containment, inert background and native focus return. Server HTML stays closed, even when `open` is true; browser commit opens it. Owner supplies trigger, close/save actions and changes `open`; Escape requests closure rather than silently changing authoritative state. Native `method="dialog"` close is reported as `native` with its return value. There is no backdrop-dismiss default, async transaction engine, nested-modal stack or busy policy. Owners must prevent native close actions while busy and may veto Escape by keeping `open` true. Do not use `method="dialog"` for an action requiring a cancellable close request. Keep the trigger mounted for native focus return; if it disappears, the owner must focus a suitable fallback. Native dialog props/mixins are forwarded; the title relationship is library-owned.
- **Tabs**, **TabList**, **Tab**, **TabPanel**: compose official `@remix-run/ui/tabs` 0.13.1. Tabs takes `defaultActiveTab` or controlled `activeTab`/`onActiveTabChange`; each Tab/TabPanel shares a `name`. TabList requires `aria-label`. Arrow/Home/End navigation, disabled registration and active/inert panel relationships remain upstream-owned. These are widgets, not route navigation: use anchors and `aria-current` for routes. Content is present in SSR; interactive switching requires hydration.

- **Select** (interactive subpath only): uncontrolled official `@remix-run/ui/select` composition using Context, trigger, popover, list, option and hiddenInput with official popover.Context. Pass `options: readonly {value: string; label: string; disabled?: boolean; textValue?: string}[]`, optional `defaultValue`, `placeholder`, `name`, `disabled`, and `onValueChange(value)`. Remaining props/mix target the button, including ARIA labels. Field owns its ID and merges description/error IDs with the upstream selected-option description. Use unique stable string values and stable options for the mounted lifetime. The adapter derives the initial label from the matching default option. Defaults initialize upstream state once; this is not a controlled value API.

Select SSR includes a labelled button, closed native popover, options and hidden input with the default value. Without JavaScript it can submit that initial hidden value but cannot change selection; it is **not** a progressively enhanced native select. Disabled excludes its hidden input from submission. There is no native `required` validation or reset synchronization: owners validate values and explicitly remount when resetting. No `required` prop is exposed. Use a host-owned native select when no-JS editing or native constraint/reset behavior is needed. Upstream owns arrows, typeahead, selection, dismissal and Escape focus return. Its listbox intercepts Tab while open rather than providing native-select Tab traversal; this adapter does not replace that policy.

### Accordion and Menu

`Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` compose official 0.13.1 Accordion contexts/mixins. Accordion accepts the upstream controlled/uncontrolled single/multiple union; items have unique `value` and optional `disabled`. Put each trigger inside an app-selected `Heading` level. Upstream owns arrows/Home/End, disabled skipping, open state and linked ARIA/inert panels; the themed content part hides closed panels with CSS. Multiple mode accepts string arrays; single mode accepts string/null and optional `collapsible={false}`. Switching modes should remount the root when changing default values.

`Menu`, `MenuTrigger`, `MenuContent`, `MenuItem` compose official 0.13.1 menu/popover behavior. Menu takes a label; each item has a stable name and optional upstream value/label/searchValue/disabled/type/checked options. `MenuContent onSelect(item)` reports the upstream selection; owners perform commands and update checked state. Upstream owns popup positioning, arrows/Home/End, typeahead, disabled skipping, Escape, outside dismissal and focus return. This adapter exposes a single button-triggered action menu, not submenus or context menus. Items are commands, not invented links or form submission. Selection and dismissal finish asynchronously; keep the trigger mounted for focus return. Menu needs hydration and is not a no-script action fallback: keep essential actions reachable in native forms/links elsewhere. No new interaction engine or React/Radix/Base UI dependency is introduced.

### Upstream coverage inventory

Pinned 0.13.1 publishes `accordion`, `anchor`, `animation`, `combobox`, `listbox`, `menu`, `popover`, `select`, `tabs` and `toggle`. The Explorer shows underlying Select/Tabs examples alongside working themed previews; this inventory stays in developer documentation.

- Adapted: official **accordion**, **menu**, **tabs**, **select**, and supporting **popover/listbox** composition. Package tests cover Select SSR relationships, default labels/values and disabled form markup; consuming app browser tests own mounted keyboard/focus/FormData coverage.
- Not adapted: standalone popover/listbox, nested/context menus or other upstream widgets. No blanket upstream coverage is claimed.
- Dialog remains native HTML dialog: pinned UI 0.13.1 has no official Dialog API. Button action mode and Field are package-owned compositions, not upstream widgets.

## Code and diffs

`CodeBlock({label, source, language?, tokens?})` renders escaped, selectable text with a visible caption and a named keyboard-scrollable region. The caller may supply readonly `{text, color?}` tokens; only exact source reconstruction is accepted, otherwise plain source renders. Text is escaped and colors accept only six-digit hex, never HTML/arbitrary CSS. Language labels alone do not run a highlighter. `CodeDiff({label, lines})` renders caller-prepared context/remove/add rows with optional old/new line numbers, textual change markers and accessible row descriptions. Both consume the nearest semantic theme and preserve long lines without silently truncating input. They have no client lifecycle or runtime dependencies beyond Remix. Apps own source limits, diff computation, syntax preparation and clipboard actions.

The [code research and API guide](CODE.md) inventories actual Atlas/Garden/Lists highlighting and editor consumers, compares pinned Pierre packages, records licensing/notices, Worker and client boundaries, and explains the dependency-free choice. The Explorer now prepares TSX tokens using the same Shiki 4.6.0 family as existing consumers, through its app-owned SSR/browser adapter. Existing Markdown pipelines are not migrated. The code subpath stays separate from the legacy root and does not claim optional upstream highlighters run in Workers. The Explorer uses CodeBlock for every story's current source and includes dedicated CodeBlock/CodeDiff controls.

## Upstream and maintenance

Remix 3.2.0 owns rendering/lifecycle and CSS. `@remix-run/ui` is pinned **0.13.1**, MIT, compatible with component ^1.2.0, and independently unstable; review the published subpath APIs and rerun SSR/browser contracts before upgrading. No old `remix/ui` or unpublished form/toast APIs are used.

The behavior design was compared with Vercel UI SDK at immutable commit `220c1a0d7278872286a620a8e4ee4210ca46f9bd`: native/custom button semantics, retained pending focus, delayed announcements, field relationship merging, modal cancellation and stale action completions. Upstream also exposes one Button: [core state/press](https://github.com/vercel-labs/ui/blob/220c1a0d7278872286a620a8e4ee4210ca46f9bd/packages/core/src/components/button/button.ts), [React adapter](https://github.com/vercel-labs/ui/blob/220c1a0d7278872286a620a8e4ee4210ca46f9bd/packages/react/src/button.tsx), and [action/announcement helper](https://github.com/vercel-labs/ui/blob/220c1a0d7278872286a620a8e4ee4210ca46f9bd/packages/core/src/foundation/kernel/action.ts). Its returned-Promise pending/error state and delayed announcement are the behavior baseline, not a separate action component. Our explicit opt-in maps that behavior to Remix; abort-on-disposal and stale-result suppression are original extensions, not features claimed from upstream's Button action helper. Its framework-neutral core is substantial, but the required renderer bridge explicitly declares private/unstable APIs. This slice uses original native Remix implementations, not a vendored SDK kernel/adapter or copied algorithms. Therefore no SDK runtime dependency, copied source, assets or license notices are added. If a future missing utility earns selective adaptation, record exact files/commit/modifications and preserve Apache-2.0 notices at that point. Broad focus/selection engines should use official headless primitives rather than duplicate them.

## Checks

From the root, `npm ci`, then `npm run check --workspace @harrhy/ui`. Checks typecheck actual Remix props, render SSR form/field/theme/dialog/tab contracts, and retain legacy action compatibility tests. `npm run check --workspace @harrhy/ui-app` checks the consuming browser fixture, keyboard and responsive behavior. Run Auth and Ref checks for package changes. Automated checks do not establish assistive-technology or WCAG conformance.
