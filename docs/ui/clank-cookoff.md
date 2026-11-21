# Reading a Clank run

In the UI showcase, open **Scenes → Clank cook-off**. The fixture asks why a print proof has the wrong trim marks. Read the operator's request, open the file receipt, inspect the code and compare the output dimensions. Switch themes mid-run: neither the transcript nor the clock resets. The Overview lists only the current run’s facts.

## Pi as the visual reference

- [Pi's web shell and transcript](../../apps/pi/src/web/style.css): the bar is 52px high; its title is 15px/600. The user message sits on the right with 8px × 12px padding. The reply is unboxed. Use 16px horizontal insets and a centered reading column here, rather than a second title band or speaker cards.
- [Pi’s session rows](../../apps/pi/plugins/sessions/sidebar/style.css): a 28px desktop target, neutral fill on selection, one line for the title. Move identifiers and times out of the list. On a phone, increase targets to 44px and show one of Sessions, Transcript or Overview at a time.
- The light shell uses Pi’s background `#fbfaf8`, text `#1d1b19`, rule `#e7e4df`, prompt `#f0ede8` and code `#f5f3f0`. The same neutral ink draws the focus outline. The only chromatic mark is the check next to “Complete”. Muted text is slightly darker than Pi’s to keep contrast on the selected surface.
- [Pi icons](../../apps/pi/src/web/icons.tsx) use currentColor outlines on a 24-unit grid with 2-unit strokes; [activity rows](../../apps/pi/src/web/activity/activity.css) have no idle background. Here the 16px tool glyph accompanies a native disclosure, not a separate button.

Clean and Artbin keep their existing theme tokens over exactly the same content. The Pi-derived Harrhy recipe stays in the showcase.

## Interaction references

- [P2 run-state model](../../apps/pi/plugins/sessions/sidebar/run-state.ts) separates what an agent is doing from how its previous run ended. Retain a short tool receipt in the conversation; don't make a file read look like the whole job passed. [P2 Markdown](../../apps/pi/src/web/Markdown.tsx) memoizes settled blocks and renders tokens as elements.
- [Pine desktop](https://github.com/pmndrs/pine/blob/6105688a4d8c62c5f0ef4dcaed7ce8c058035cd1/docs/references/desktop.md) keeps the current conversation beside its work. [Pine's code pane](https://github.com/pmndrs/pine/blob/6c6ee3ba9e05599d7f99c7b1ab38d9e888905ae1/src/tui/code-pane.ts) distinguishes files, changes and output. The right column answers “what did this run examine?” without copying the text stream.
- [Harness Desktop](https://github.com/MSpiechowicz/harness-useful-desktop) separates session browsing and change review. [Codex review](https://developers.openai.com/codex/app/review/) distinguishes last-turn and working-tree changes. Keep the Overview narrow and label its scope; a read receipt isn't a working-tree diff. These were source/documentation references, not connected accounts or runtime tests.
- Use [Lucide](https://lucide.dev/) at 16px for actions and state. Its strokes remain legible beside a filename without an icon font, React wrapper or standalone unlabeled button. Keep the hit target larger than the drawing.

## Replay comparison

**Try it:** from the finished first session, Step 18 times for a partial TypeScript fence; switch between Tail and Words. After 19 more steps there is a partial table. Resume finishes exactly the same text. Replay sends eight characters per tick; this is a local deterministic transport, not an inference benchmark.

- **Tail** keeps completed blocks, displays the current block literally, and settles it at a blank line outside a fence or at end-of-message. Cheap SSR with ordinary Remix nodes. Pipes and backticks stay visible longer; the final paragraph/table transition can reflow. The implementation supports only this fixture’s paragraph/fence/table dialect; nested lists, escaped pipes and late reference definitions aren't a general Markdown contract.
- **Words** is real streaming Markdown. [Pierre Words](https://diffs.com/words), pinned to 0.3.0, has a Wasm parser, HTML sessions and a DOM renderer, not only a React component. The Remix host owns its root; `createDomRenderer` owns its children and disconnects on disposal. An open fence already looks like code. The partial table becomes a real table once the separator parses; before then the header can look like prose. That transition changes line wrapping. No React root required. [Streamdown](https://github.com/vercel/streamdown) is a React alternative, not the dependency tested here. [Highlights and Diffs](https://diffs.com/docs) concern syntax and diff presentation respectively; neither is a streaming Markdown parser.
- **Untrusted content:** no HTML injection in Tail. Words has a positive element list, no raw HTML allowlist entries, all URL transforms rejected, no media, controls, islands or plugins. A browser contract checks raw button markup, a Markdown image and a link do not create active elements. Unfiltered `renderToHtml` is not a safe replacement. The fixture imports Words in its comparison graph even for Tail; a Tail-only product need not ship it.
- **Reading while output arrives:** only follow within 32px of the bottom with no selected text. In Chromium, a ten-character selection in the settled first paragraph and a manually scrolled position stayed put across ticks in both modes. A selection _in the changing block_ is not guaranteed to survive reconciliation. No cross-browser, long-history or slow-device performance claim.

**Decision:** default to settled blocks and a literal tail if tool logs are the common case. If reading long code and tables _before completion_ is central, trial Words with real token cadence and a long history before adopting it. Measure main-thread stalls, bytes and Wasm/CSP compatibility on the target host. Do not widen a production CSP on the strength of this demo.

## Reproduce

From this branch, with the repository Node/pnpm versions:

```sh
pnpm --filter harrhy --filter @harrhy/ui-app... install --frozen-lockfile
pnpm --filter @harrhy/ui-app check
HOST=127.0.0.1 PORT=19374 pnpm --filter @harrhy/ui-app start
```

Visit `http://127.0.0.1:19374/?view=scenes&scene=clank`. Add `&theme=clean` or `&theme=brutalist` for the existing tokens. Only the new scene uses Harrhy; nothing changes another app's chosen theme.

Chromium checks covered 320, 390, 768, 1024 and 1440px without horizontal page overflow. Harrhy uses a 2px ink outline for keyboard focus. Phone controls and summaries have 44px minimum targets. No screen-reader or physical-device certification is implied.
