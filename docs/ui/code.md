# Code rendering and optional syntax preparation

## Boundary

`@harrhy/ui/code` renders native Remix SSR code and caller-prepared unified diff rows. It imports no syntax engine and requires no hydration. Source text is escaped, optional colors accept only six-digit hex, and prepared tokens must reproduce the source exactly or the complete plain source renders. Named focusable overflow bounds geometry, not source length. Apps own diff computation, clipboard actions and source limits.

The owner approved a hard migration from direct Shiki consumers to standalone **`@pierre/highlights` 0.5.1**. This is not `@pierre/diffs`: Diffs 1.6.4 itself depends on Shiki and brings an unrelated imperative renderer/worker lifecycle. No React adapter, browser Markdown viewer or virtualized diff engine is introduced.

## Optional entry points

```ts
import { highlightCode, highlightCodeHtml } from "@harrhy/ui/highlight";
import { rehypeHighlight } from "@harrhy/ui/rehype-highlight";

const tokens = highlightCode(source, {
  language: "tsx",
  theme: "github-light", // or github-dark
});
```

`highlightCode` returns readonly `{text, color?, italic?, bold?}` tokens for native CodeBlock or individual CodeDiff rows. It preserves source using original UTF-16 offsets, including CRLF, tabs, astral characters and final newlines. Invalid token offsets/content fall back to complete plain source. Unsupported languages become text. Sources over 20,000 UTF-16 units or containing a line over 2,000 units skip syntax work, never truncate. Engine initialization/runtime errors are not swallowed. Only the two selected theme modules are imported, not the theme barrel.

`highlightCodeHtml` serializes escaped source and trusted color spans in `pre.hui-highlight.github-light` (or github-dark) containing code. It is not an author-HTML sanitizer. It never uses upstream borrowed HTML bytes or arbitrary HTML/style attributes.

`rehypeHighlight({theme?, languageAliases?})` transforms plain-text `pre > code` fences into safe HAST text/span nodes. Inline code is untouched. Run it **after host author-HTML sanitization** and before serialization and exact text projection. It adds pinned theme foreground/background styles and the same pre classes, retains code language metadata, and neither sanitizes nor broadens the host's HTML policy. App-specific component fences and email preview isolation stay app-owned.

The native/root entries never import either optional adapter. Server-only Markdown consumers must not send the engine to browsers.

## Runtime proof and costs

The actual published 0.5.1 tarball was inspected, rather than assuming source-tree metadata equals npm. Integrity:

```text
sha512-c2WF6sgwgKdxXU6FpWDLWUYHRca/cJy+3QJkWAqYqEAFxqlPf8eSH0ehHcFFjKBmT+9KBl9H7q6z7HMRU7+m6g==
```

It has no declared runtime dependencies. Its default entry synchronously compiles embedded WASM; its conditional `workerd` entry imports precompiled `highlights.wasm`. Worker bundlers must honor that condition and package the WASM module. Node import, real Chromium and actual Miniflare/workerd execution of the upstream token API succeeded before integration. These prototype results do not replace consumer checks or deployed performance measurements.

Measured equivalent minified engine-only prototypes (not app transfer totals):

<!-- prettier-ignore -->
| Graph | Raw bytes | Gzip bytes |
| --- | --- | --- |
| Previous Explorer Shiki core/JS engine/TSX/GitHub light | 352856 | 73679 |
| Highlights default browser graph | 432235 | 189832 |
| Highlights workerd JS | 28119 | 11196 |
| Separate Worker WASM | 303015 | 144028 |

Highlights bundles 152 languages: browser transfer is a regression against the previous single-grammar graph, not an automatic performance win. Prototype Chromium initialization was 34.5ms; Node import/init 17.7ms and 34 small synthetic TSX preparations 4.9ms. These are not Atlas's real 34-page catalog benchmark. Compare integration against Atlas's already-fixed approximately 0.8–1s cold baseline, not its former eager-all-grammars incident.

A strict `script-src 'self'` browser CSP rejects the default entry's WASM compilation. Hosts choosing browser highlighting must explicitly support it (typically `wasm-unsafe-eval`); this migration does not relax Artbin/Auth or email-preview CSP. Native rendering and server-prepared tokens need no browser WASM permission.

## Licensing and verification

Highlights is Apache-2.0 with distributed `LICENSE.md` and `NOTICE.md`; the GitHub themes derive from the pinned Zed GitHub Classic theme listed in that notice. Keep dependency notices in distributions. No upstream implementation or assets are copied into the native renderer. See [third-party notices](../../packages/ui/THIRD_PARTY_NOTICES.md).

Package tests exercise exact UTF-16 reconstruction, both themes, unknown languages, complete large-input fallback, HTML escaping and fence-only HAST transformation alongside native SSR contracts. Actual browser/Worker integration and app checks must still verify each host's asset graph and CSP. Automated checks do not establish assistive-technology or WCAG conformance.

Integration evidence: the actual shared adapter passes workerd execution with a build-graph assertion excluding Remix/native and the browser-WASM entry. Explorer hydrated source/copy/XSS/long-line contracts pass; Garden server and production browser navigation/CSP tests pass; Lists Bun typecheck, 190 tests and browser asset build pass (three external Compose tests intentionally skipped). Atlas owner measured the actual 34-page overlay catalog at 739ms versus fixed Shiki803ms, total1392ms versus1151ms (single cold runs, not a speedup claim). All source digests and normalized search text match; four exact annotation projections now correctly retain fenced final newlines previously dropped by Shiki. Prior projection evidence should become stale, not be silently reanchored.
