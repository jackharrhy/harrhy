# Code and diff rendering research

## Scope and decision checkpoint

This work is an additive shared UI explorer slice, not an editor, Markdown pipeline replacement or production migration. Existing consumers remain unchanged. The baseline is native Remix SSR rendering with escaped source text and caller-prepared diff rows. The owner-requested live highlighting consumer now justifies an optional safe prepared-token contract. The Explorer uses the existing Shiki 4.6.0 family through an app-owned synchronous SSR/browser adapter; no second highlighter, editor platform, diff algorithm, worker pool or WebAssembly is added. The reconciled implementation is `code.tsx`, exported by the integrating workspace as `@harrhy/ui/code`. It adds no dependencies.

## Actual Harrhy inventory

Inspected at baseline `6d0376f`:

- **Atlas:** `apps/atlas/app/content/markdown.ts` uses pinned `@shikijs/rehype` 4.6.0, `github-light`, lazy loading and text default/fallback. Author HTML is sanitized **before** trusted highlighting styles are generated. `app/ui.tsx` owns native Remix prose mixins: monospace code and horizontally scrollable bordered pre. README documents fenced-code highlighting and a server-only document presentation with no runtime asset server. This is already a working syntax-highlighting pipeline, not an unimplemented opportunity.
- **Garden:** `apps/garden/app/content/markdown.ts` uses `@shikijs/rehype` ^4.6.0, `github-dark`, `component` alias to text and text fallback. It rewrites `shiki` classes to `astro-code`; its separate component-fence path is app-specific. It caches Markdown rendering promises by body.
- **Lists:** `apps/lists/src/services/source-highlighter.ts` calls Shiki ^4.6.0 `codeToHtml` with `github-light` for template source: HTML/MJML use HTML grammar, text uses text. Existing tests assert Shiki HTML output. Its plain email previews also include escaped preformatted text, not a diff viewer.
- **4orm:** `app/browser/codemirror.ts` upgrades settings textareas marked `data-codemirror` using CodeMirror 6 HTML/CSS/Markdown grammars. This is editing behavior, not a code-display component.
- **Marky:** ProseMirror/Yjs editor dependencies; not a shared syntax-highlight/diff integration.
- **Artbin:** `app/actions/cli-page.tsx` renders plain native pre/code CLI examples; `app/actions/file-page.tsx` displays `data.textContent` inside a pre for file previews. Neither imports a syntax highlighter. Auth/CMS-edge and several other apps render inline code identifiers; 4orm settings also render plain iframe embed examples.
- No existing shared code/diff component or Pierre import was found by repository search. Existing inline code/plain pre elements are not evidence of a highlighter dependency.

## Verified upstream sources

Research fetched `https://diffs.com/` and verified its GitHub links target `https://github.com/pierrecomputer/pierre`. Source inspection is pinned to **`9d8bdc2b48fd9d25286149598ad1590a2a8f4970`**, not an assumed relationship between similarly named packages. File links below are relative to that immutable tree:

- [Diffs package](https://github.com/pierrecomputer/pierre/tree/9d8bdc2b48fd9d25286149598ad1590a2a8f4970/packages/diffs): manifest, README, `src/components`, `src/ssr`, `src/worker`.
- [Highlights package](https://github.com/pierrecomputer/pierre/tree/9d8bdc2b48fd9d25286149598ad1590a2a8f4970/packages/highlights): manifest, README, `lib/default.ts`, `lib/workerd.ts`, `tsdown.config.ts`, LICENSE.md and NOTICE.md.
- [Theme](https://github.com/pierrecomputer/pierre/tree/9d8bdc2b48fd9d25286149598ad1590a2a8f4970/packages/theme) and [Theming](https://github.com/pierrecomputer/pierre/tree/9d8bdc2b48fd9d25286149598ad1590a2a8f4970/packages/theming): manifests and license files.

No upstream agent skill was installed or executed. No upstream implementation, font, sprite or theme was copied. Registry metadata was queried separately; a source-tree package version is not proof that an npm tarball is byte-identical to that commit. Observed npm integrity values:

```text
@pierre/diffs@1.6.4
sha512-RsKoruCOp50qaDM3a7BQan5K77xMkGWT1NF01fiYP1PfT3v4CvIjwytNk5WjZG0BesBkMOP2UbrBIDigB1k0ug==
@pierre/highlights@0.5.1
sha512-c2WF6sgwgKdxXU6FpWDLWUYHRca/cJy+3QJkWAqYqEAFxqlPf8eSH0ehHcFFjKBmT+9KBl9H7q6z7HMRU7+m6g==
```

## Options and constraints

### Pierre Diffs 1.6.4

Apache-2.0 (`packages/diffs/LICENSE.md`). Vanilla imperative File/FileDiff, virtualized variants, CodeView and optional React bindings; React is not required by the vanilla entry. Defaults to Shiki's JavaScript regex engine; also supports optional Shiki WASM and Highlights backends. Depends on Shiki, `diff`, HAST serialization, LRU, Pierre theme/theming and Highlights. This is much more than a line-diff function.

`/ssr` exposes `preloadFile`, `preloadDiffHTML`, `preloadFileDiff`, `preloadMultiFileDiff`, `preloadPatchDiff`, `preloadPatchFile` and `renderHTML`: source builds HAST/styles, includes sprite markup and returns prerendered HTML. It is not native Remix JSX. A future adapter must prove both that exact SSR dependency graph works under the deployment runtime and that client options match the SSR snapshot. Do not import React adapters into Remix or assume a Node SSR pass proves Cloudflare compatibility.

Browser rendering uses custom elements/shadow-root styling and imperative instances. A Remix client boundary must own instantiation, prop updates and `File.cleanUp()` on disposal; an exclusively owned WorkerPoolManager must call `terminate()`. A shared pool must instead be owned above individual file instances. Late asynchronous work and removal need browser regression coverage. Imported entry points and worker URLs must be checked against the host asset graph/CSP.

Virtualized files can reduce large-file DOM work but are not equivalent to a complete accessible document: offscreen lines, selection/copy, browser find, keyboard navigation and AT reading order need explicit tests. Split layouts need a meaningful narrow-screen stacked mode. Native focusable overflow and text plus/minus indicators are a safer small baseline. Upstream `src/utils/createPreElement.ts` intentionally does not focus the pre because an inner `[data-code]` owns scrolling; a host must not assume focusing the outer pre provides keyboard access. Upstream capability claims do not establish WCAG conformance.

Npm reports **11,457,889 bytes unpacked** for 1.6.4. This includes distributions/maps/entry points, **not** a measured browser transfer size. Dynamic languages/themes, worker chunks, treeshaking and host bundling determine shipped size; do not quote the unpacked number as bundle cost.

### Pierre Highlights 0.5.1

Apache-2.0 (`LICENSE.md`), with important `NOTICE.md` theme attribution/provenance covering MIT and Apache-derived theme data. Keep the distributed notices if packaging or adapting upstream assets; selecting an arbitrary third-party theme requires its own provenance check. The current code copies nothing.

152 built-in languages; WAT-based highlighter emitting HTML bytes or themed tokens, with stream/edit support. Import initializes WASM synchronously. `lib/default.ts` constructs `new WebAssembly.Module` from embedded bytes; the conditional `workerd` export statically imports `.wasm` and passes the precompiled module to init. The deployment bundler must honor that condition and package the WASM module; a generic browser bundle or runtime compilation assumption is unsafe for Workers.

HTML bytes can share WASM memory: decode immediately or `.slice()` before the next highlighter call. Token output is preferable to introducing a raw-HTML escape hatch in shared UI. Main-thread synchronous highlighting still consumes CPU; avoid doing it during every component render. Consider server preparation or a dedicated worker only after measuring workload and resource lifetime.

Manifest WASM metadata: **303,015 bytes raw / 142,794 gzip**, excluding JS glue/themes. Npm package unpacked size is **1,923,753 bytes** for 0.5.1, not browser bundle size. Browser WASM compilation/instantiation and Worker deployment are additional costs over the dependency-free renderer; no measured runtime bundle is claimed here.

### Pierre Theme 2.0.0 / Theming 1.0.2

Both Apache-2.0 according to manifests and license files; Theme also distributes NOTICE.md. Theme exports Shiki/editor palettes, including color-vision variants; Theming provides general color/theme helpers and optional React entry points. Neither provides the needed native code/diff semantics. Adding them solely to restyle a small code surface would duplicate Harrhy's semantic theme system.

## Integration boundary

A lean native component should render safe text, use existing `--hui-*` theme values, preserve tabs/newlines, expose focusable named overflow and avoid hidden browser work. The app owns syntax preparation, diff computation/parsing, source limits and raw-file downloads. Large input must never be silently truncated by shared UI; callers should choose a small preview with an explicit omission notice and a full-source link. Scrolling bounds geometry, not CPU/DOM memory.

A future Pierre client island is justified by concrete needs such as large virtualized diffs, inline word differences, annotation/line selection or editable files. It needs its own opt-in entry, measured chunk sizes, SSR/Worker integration proof, disposal tests and manual AT verification before production adoption. Existing Atlas/Garden/Lists pipelines should not migrate merely because a shared display component exists.

## Public API and Explorer integration

`package.json` exports `"./code": "./code.tsx"` without new dependencies. The legacy package root does not import it. The renderer needs only `@harrhy/ui` and `remix`. The Explorer additionally allows its four pinned Shiki packages, with transitive browser dependencies resolved by the asset server. Only TSX and Github-light are imported, not a full grammar bundle.

```tsx
import { CodeBlock, CodeDiff } from "@harrhy/ui/code";
import type { CodeBlockProps, CodeDiffProps, DiffLine } from "@harrhy/ui/code";

// Every Explorer story passes the exact current source, including current props.
<CodeBlock label="Button example source" language="tsx" source={storySource} />;

// Optional caller-prepared syntax tokens must exactly reproduce source.
// The Explorer prepares these with its app-owned Shiki adapter.
const tokens = [{ text: "const", color: "#b92d3b" }, { text: " x = 1;" }];
<CodeBlock label="Prepared example" source="const x = 1;" tokens={tokens} />;

// Dedicated CodeBlock story; source is text, never HTML to execute.
<CodeBlock
  label="Button example"
  language="tsx"
  source={`<Button type="submit" variant="primary">Save</Button>\n`}
/>;

// Dedicated CodeDiff story. Rows are prepared by the caller, not computed here.
const exampleLines = [
  { kind: "context", text: "export {", oldLine: 1, newLine: 1 },
  { kind: "remove", text: "  OldButton,", oldLine: 2 },
  { kind: "add", text: "  Button,", newLine: 2 },
  { kind: "context", text: "};", oldLine: 3, newLine: 3 },
] satisfies readonly DiffLine[];
<CodeDiff label="Native action export" lines={exampleLines} />;
```

`CodeBlockProps` requires string `label` and string `source`; optional string `language` is descriptive metadata. Optional readonly `tokens: {text: string; color?: string}[]` accepts caller-prepared syntax tokens only when concatenation exactly equals `source`; stale/mismatched tokens fall back to complete plain text. Colors are restricted to six-digit hex. The Explorer adapter uses Shiki offsets to preserve CRLF/tabs/final newlines, a 64-source cache, 20k-character/2k-line limits with complete plain fallback, and darker Github-light accents for all three global light theme surfaces. SSR and live browser rendering share this adapter, so there are no out-of-order asynchronous results. `CodeDiffProps` requires string `label` and readonly `lines`. `DiffLine` is a discriminated union:

- `context`: `text`, optional `oldLine` and `newLine`.
- `remove`: `text`, optional `oldLine` only.
- `add`: `text`, optional `newLine` only.

Each diff row describes one line without its line terminator; the renderer adds a newline for readable selection. Line numbers should be positive integers prepared by the caller; omitted numbers leave the gutter blank. Text is escaped by Remix, including code that resembles HTML. No trusted-HTML or arbitrary CSS/token callback is accepted. Optional token support was considered and deferred because there is no prepared-token consumer in this iteration; a future real consumer should drive that contract rather than a speculative second highlighting model.

Labels must be meaningful, nonempty names; visible captions and named keyboard-focusable overflow remain useful without client scripts. Callers own surrounding spacing and the nearest semantic theme. Both views cap scroll height at 28rem and preserve long lines/tabs; they never truncate input, so callers must bound expensive workloads before rendering. Diff gutters are visually readable old/new columns and hidden from AT in favor of explicit per-row context/added/removed and line-number text. A displayed diff is not a machine-applicable patch or a source-only clipboard format. Use CodeBlock for exact source copying; applications own clipboard controls and any empty-state explanation. Both components read live handle.props, so Explorer control updates can change source or rows without a special lifecycle API.

No browser APIs are accessed at import/render; no events, timers, requests, workers or external instances exist to dispose. This is SSR-safe native Remix, not proof that all optional upstream highlighters run in Workers.

## Validation evidence

- UI workspace typecheck and all 17 package tests pass, including escaped code/metadata, native SSR without hydration markers, changed-line semantics without color, caller input immutability, empty input, and a preserved 100k-character long line.
- Headless Chromium renders clean/tactile/brutalist at 375px and 1280px: no document horizontal overflow, named pre can receive focus, long source scrolls internally, height stays bounded, and diff rows stay single-line height. Screenshots inspected for the clean narrow fixture; Explorer integration still owns final in-app visual/interactive checks.
- Neutral-platform minified esbuild bundle of `code.tsx`: approximately 9.8 KiB including its Remix runtime graph. This is an isolated prototype measurement, not incremental app transfer cost; app graph deduplication and compression will differ. No new dependency, Node builtin, WASM or browser worker asset is required.
- Impeccable mechanical detector reports no findings for `code.tsx`. Automated checks do not establish screen-reader/WCAG conformance.
- Ref consumer check passes: build, generated Worker types, typecheck, 22 tests and Wrangler deploy **dry-run**. No live backend writes.
- Auth typecheck and 104 tests pass. Its full browser sequence exceeded the 120-second command budget after the authorization, Radio, access-management and WebGL-gallery fixtures passed. The remaining `ui-polish.mjs` fixture was then rerun from the Auth workspace and passed (responsive layout, appearance controls, hold/reload, reduced motion and WebGL fallback).
