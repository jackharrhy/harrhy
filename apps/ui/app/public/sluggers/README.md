# Sluggers UI proposal — owner review

Status: planning only. No scene code, app scaffold, shared API change or backend is delivered. Mode: Operate (lineup/import) and Read (standings/results).

## Source and visual authority

- Harrhy base: `d50f151` from freshly fetched `origin/main`. Directive: root `SLUGGERS.md`, read in full. Separate branch/worktree: `plan/sluggers-ui`, `.worktrees/sluggers`.
- Original reference: `jackharrhy/sluggers-super-draft` at `3c6013531c304c82f1a6bf741c833479b9621416`, cloned into this worktree's ignored `tmp/sluggers-super-draft`. Reference-only; no copied implementation or assets.
- Original `apps/sluggers-super-draft/app/app.css`: blue field, white ink, slate cell surfaces, red/teal secondary colors; NewCezanne body, Rodin statistics, Bolt/Happiness display. The proposed direction preserves blue league identity and compact score hierarchy, not the translucent cells, tiny field labels or animated background.
- Original `app/components/StandingsTable.tsx`: conference/team identity, W/L, win-loss difference, run differential and weekly results. `Lineup.tsx`: nine defensive locations and captain identity. `app/utils/matches.server.ts`: explicit `freezeMatchLineups` when entering live play; match appearances must not follow future roster edits.
- Current `packages/ui/README.md`, `apps/ui/README.md`, local Radio theme and installed Remix rendering/interactivity guides establish the implementation boundary: Remix 3.2.0, not React Router 7 / React hooks. Existing primitives already cover most of this proposal.

## Proposed direction: the league scorebook

A compact blue league masthead over an opaque, readable score sheet. The nine-slot batting strip is the distinctive recurring device: lineup order in the editor, frozen appearances in a result, mapped characters during import. Human managers are separate from game characters.

Proposed palette, subject to browser contrast verification:

- Blue `#174ca1` for the masthead and primary action; white text.
- Canvas `#edf2f8`, sheet `#ffffff`, ink `#17243b`, secondary ink `#526079`.
- Controls outlined `#74829a`; focus `#9c3900` on light surfaces, a white ring on the blue masthead.
- Team colors appear only beside their names; they do not override action, warning or focus meaning. Status always includes words.

Typography: system UI initially, with heavy short headings and tabular numerical figures. Body/table 14–16px, metadata 12–13px, section headings 18px, page heading 24–28px, paired match scores 36–40px. No external font requests. Do not copy the archive's FOT, Aurea or ITC font binaries: redistribution rights are unproven. A licensed display face can be reviewed separately if system-heavy headings feel too plain. Initial team/character slots use named, original text identifiers, explicitly placeholders rather than faux Nintendo art. Legacy logos and portraits remain a provenance gate, not assumed reusable assets.

Use flat surfaces, 6px panel/4px control corners, restrained row rules and no dashboard KPI-card row. Dense statistics retain a real table with right-aligned numbers. Longer names wrap in the identity column rather than disappearing behind ellipses.

## Four compositions

All names, dates and results below are synthetic. Every fixture object carries explicit league/season IDs; each team and match belongs to that scope. League A and B both contain a team called Fireballs with different IDs. A manager may appear in both with different fixture roles. This demonstrates context, not server authorization.

### 1. League overview

Question: where does my team stand, and what do we play next?

```text
SLUGGERS       Lil Slug Crew / Season 1       [Change league]
Standings       Fixtures       Teams

Mushroom conference                 Next fixture
Team                 W L  +/-  RD   Fireballs at Shell Club
Fireballs            2 0   +2  +5   Match day 3 · Scheduled
Shell Club           1 1    0  -1   [View match]
Star Nine            0 2   -2  -4
```

W/L totals balance (three completed games); RD sums to zero. Add the second conference in the full fixture and derive displayed summaries from its rows. Show weekly result links inside the table where relevant, not an invented percentage metric. Empty season keeps its heading and says “No completed matches this season”; upcoming fixtures remain useful. Switching to Harbor League changes all labels/rows/links, even with overlapping team names.

Desktop: standings take roughly two thirds, fixture list one third. Tablet/mobile: fixtures become a short upcoming row above the full-width standings. Keep the statistical table in its own named, focusable horizontal scroll region, never page overflow. Row headings retain the team identity.

### 2. Match and box score

Question: what happened, and how trustworthy is the recorded result?

```text
Lil Slug Crew / Season 1 / Match day 2
FINAL · incomplete capture
Fireballs (away)      4 — 2      Shell Club (home)
Capture ended early. Missing values are “—”, not zero.

Frozen appearances · recorded for this match
Batting:  Character       AB  H  HR  RBI
          Mario           4  0   0    0
          Luigi           —  —   —    —
Pitching: Character      Outs H  BB   SO
          Peach          12  2   0    3
```

Provide scheduled, complete-final and incomplete-final scenarios. Scheduled has no fabricated score or batting totals. Separate result lifecycle from evidence completeness: “Final” must not imply every stat was captured. Render unknowns with a caption defining “— = not recorded”; literal zero remains zero. Frozen lineup fixture remains unchanged when the editable team fixture changes. Pitching work is stored as outs; any innings display is a validated presentation conversion, never decimal arithmetic. Do not relabel tracker bobbles as errors. Source notice describes evidence without exposing raw restricted logs.

### 3. Team and lineup editor

Question: can I submit a legal nine-character batting/defensive lineup?

```text
Fireballs / Season 1             Unsaved changes
Captain [Mario]
Order  Character          Defense      Move
1      Mario · Captain    [P]          [Down]
2      Luigi              [SS]         [Up] [Down]
…
9      Peach              [CF]         [Up]
[Save lineup]             Nine unique assignments required
```

Nine slots, nine unique characters, exactly one captain from the roster and one assignment per defensive position. The full roster remains available, not just a three-row mockup. A field diagram is secondary/read-only; the ordered list is authoritative. Native Up/Down buttons work with keyboard/touch and announce “Luigi moved to slot 1”; retain focus on the moved character's control. Do not port dnd-kit or require drag. Local states: clean → dirty → saving → saved/error, edits retained on failure, repeat save guarded, retry available. Validation points to the first affected control and an error summary. Signed-out/member scenario explains read-only access without pretending to enforce real permissions.

### 4. Mock tracker review

Question: am I publishing the right interpretation to the right match?

```text
MOCK REVIEW · no upload or parser
Lil Slug Crew / Season 1 / Fireballs at Shell Club
Sample export · Game Info / Stats / Pitching
Away brand “Custom Red”  → [Fireballs]
Home brand “Shells”      → [Shell Club]
Character mapping       8 resolved / 1 unresolved
Warning: this match already has a published result.
[Review batting / pitching preview]
[Review replacement…]
```

Use prepared parsed fixture data only; no file picker, workbook execution, parser or remote request. Unresolved mapping and impossible home/away pairs block confirmation. Review → confirmation → simulated publishing → published/error; duplicate mode requires explicit replacement acknowledgement naming the old result. Confirmation names league, season, match, home/away, missing fields and replacement consequence. Cancel changes nothing. A review preview never changes fixture standings. Publication atomically swaps the local mock result only after confirmation; reload resets everything. Banner and button outcome explicitly say “simulation”.

## Reuse and component gaps

<!-- prettier-ignore -->
| Need | Existing part / app responsibility |
| --- | --- |
| Standings and batting/pitching | Native Table parts and named keyboard-scrollable TableContainer; Sluggers owns columns, numeric formatting and context |
| Score hierarchy and context | Heading, Text, Breadcrumbs, Badge; Sluggers owns scoreboard layout |
| Inputs, errors and notices | Field, Input, Notice, Checkbox; app owns validation and announcement policy |
| Reorder, save and retry | Button, optionally its async action contract; app owns fixture transitions and reorder focus |
| Mapping/captain/defense choices | Official interactive Select with stable IDs/options; app validates and explicitly remounts when resetting |
| Publication confirmation | Native Dialog wrapper; app controls open/busy, Escape policy and mutation guard |
| Evidence disclosure | Native Collapsible or official Accordion; no custom accordion engine |

No shared component addition is justified yet. A scoreboard, roster portrait, position map, import stepper and unknown-stat formatter belong locally, not in a sports UI framework. Select's no-JS/required/reset limitations are real: SSR can only submit its default hidden value. The workbench will label interactive editing as requiring JavaScript; owner validation is explicit. If the later production flow requires no-script choice editing, propose an app-owned native select fallback for review rather than claiming the official adapter already supports it or changing the shared library now.

## Implementation plan after approval

1. Add only local `theme.ts`, `fixtures.ts`, and a small `SluggersScene(handle)` composition under this directory. Start with one file for the four related views; split only if readability needs it. Use `composeTheme(cleanTheme, …)`, one `themeStyles(...)` and `themeRoot` scope. Static styles use Remix `css(...)`; only runtime values use inline style.
2. Keep workbench's three global themes unchanged. Sluggers is a nested product-owned scope, following Radio's ownership boundary, not a fourth global theme.
3. At one explicit integration checkpoint, HarrhyUI owns `app/router.tsx` scene allowlisting and `app/public/scenes.tsx` imports/navigation/rendering. Sluggers must not edit those files or `packages/ui`. Existing recursive source watching and asset mounts should suffice; verify rather than adding infrastructure.
4. Coordinate app-local browser tests with HarrhyUI before writing outside this directory. Add fixture tests only for consequential transitions/formatting and browser contracts for reorder, mapping/confirmation, theme isolation and responsive scrolling.
5. Run `npm run check --workspace @harrhy/ui-app` on the integrated head. Run package/consumer checks only if a separately agreed shared API changes. No such change is planned.

## Evidence required before claiming the milestone complete

- Screenshots of all four compositions at 390, 768 and 1440px, including long names and a full nine-slot roster; inspect rendered output and fix overflow, not screenshots alone.
- Keyboard-only: named table scrolling; Select arrows/typeahead/Escape; Up/Down focus retention and spoken position update; Dialog initial focus, Escape/cancel and return to mounted trigger; repeat submit protection and error retry.
- Empty season; scheduled score; complete/incomplete final; real 0 beside null; duplicate import; unresolved mapping; read-only manager state; save/publish failure. Verify no page-level horizontal overflow and no clipped focus outlines.
- Existing Clean/Radio/Artbin scopes unchanged. No non-asset network requests, browser storage, account client, audio, workbook upload or backend mutation. Browser results do not constitute WCAG or screen-reader conformance.

## Owner decision / later gates

Review this visual proposal before implementation: approve the blue scorebook direction and placeholder art approach, or identify the aspect that should change. The four scenes, multi-league context and mock-only boundary are settled. No backend implementation is blocked on this review because none is in scope.

Later, obtain actual completed/incomplete exports and operator release before designing a parser; settle team/season continuity and publication/correction policy before schema/migration work. Keep PostgreSQL as baseline, existing central Auth integration patterns and explicit tenant permissions. No Discord provider setup, tracker fork, Dolphin/runtime work, migration, deployment or merge is authorized here.

## Approved implementation update

Owner approved building four compositions, original fonts and screenshot comparisons against the old UI. This supersedes the system-font-only proposal above; no backend scope was added.

Entry points: `scene.tsx` exports `SluggersScene(handle: Handle<{theme: string}>)`; `theme.ts` owns the nested theme; `fixtures.ts` owns synthetic data and validation; `fonts.css` names original type roles. HarrhyUI owns Scenes registration and the scene-only stylesheet link. No shared API changes.

### Private font provenance

Private preview uses NewCezanne Pro M (body), NewRodin Pro EB (statistics), and ITC Bolt Bold (display), from pinned original app `public/fonts/`. Converted with FontTools to WOFF2, subset to U+0000–024F, U+2000–206F and U+2190–21FF with layout features retained. Rights remain unresolved; owner explicitly requested their use while this is sorted out. This is not license clearance or permission for public redistribution. Binaries remain local/ignored, not committed to public Harrhy. Source falls back to system fonts unless private assets are provisioned. No remote font service.

Run existing `npm run check --workspace @harrhy/ui-app` after integration. Local scenes use memory only; league changes reset review/lineup state. Publication is explicitly simulated. Owner review documents are delivered as native private Markdown artifacts, not workspace file panes.
