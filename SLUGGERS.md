# Sluggers handoff

Updated November 17, 2026. The owner has named the new app **Harry Sluggers**.
`apps/harry-sluggers` is a read-only Remix 3 website over the same sanitized
historical PostgreSQL database, with six selectable curated Sluggers styles.
It does not migrate or write historical tables, replace the original runtime,
or implement authentication and editing. Building and publishing an image is
separate from production deployment.

The multi-league, Auth and import directions below remain future product work;
they do not authorize restructuring the historical database for this phase.

## Direction and settled decisions

- Rebuild the original Sluggers Super Draft league website in current Remix 3.
- Establish a distinctive, usable Sluggers visual foundation using Harrhy's
  existing UI primitives before implementing the broader website.
- Design for multiple leagues from the beginning. The owner's group is the
  first tenant, not an application-wide singleton.
- Use `https://auth.jackharrhy.dev` for identity. If Discord OAuth is desirable,
  add it as a supported provider on Auth's login screen, not as a second
  Sluggers-specific login system. Adding the provider remains separate work.
- Keep the league operator's Sluggers Stat Tracker external. Accept its existing
  exports first; consider cleaner output and optional submission later.
- Do not rebuild Dolphin management, launchers, capture instrumentation, or the
  Starworks platform. Use the original product as the behavior/data reference.

An earlier discussion suggested single-league-first and left the login provider
open. Those suggestions are superseded by the multi-tenant and Auth
requirements above.

## Receiving agent: start in your own worktree

1. Read Harrhy's root `AGENTS.md`, its worktree guidance, and relevant local
   skills. Fetch Harrhy and create your own task worktree from current
   `origin/main`; do not edit a checkout used by another agent.
2. Inside **that worktree's own `tmp/` directory**, clone the reference repo:

   ```sh
   # Run from your new Harrhy worktree root.
   mkdir -p tmp
   git clone https://github.com/jackharrhy/sluggers-super-draft.git tmp/sluggers-super-draft
   ```

   Keep this clone local and untracked. Verify the worktree's ignore rules;
   use a worktree-local exclusion if necessary rather than committing the clone.
   Do not use another agent's reference clone or the machine's shared `/tmp`.

3. Read the reference repo's `AGENTS.md` and the original app's local guidance.
   Record the reference commit you actually inspect; it may have advanced since
   this handoff. The planning reference was Sluggers `main` at `3c60135`.
4. Read `packages/ui/README.md`, `apps/ui/README.md`,
   `packages/identity/README.md`, and Harrhy's Remix skill at
   `.agents/skills/remix/SKILL.md`. Follow the installed Remix guides and current
   workspace versions rather than remembered React or Remix 2 APIs.
5. Begin with the UI/theme milestone below. Treat later phases as a roadmap,
   not permission to deploy, migrate production data, fork the tracker, or
   implement the whole platform in one pass.

Keep dependencies, generated files, test fixtures, and development servers
isolated to your worktree. Follow Harrhy's current review/check workflow for
implementation changes. Do not copy the old repository wholesale into Harrhy.

## What the existing project is

Sluggers Super Draft is a Mario Super Sluggers league website for the Lil Slug
Crew. The repository now preserves two distinct projects:

- `apps/sluggers-super-draft/`: the canonical original single-tenant league app,
  using React Router v7 SSR, Express, PostgreSQL/Drizzle, and Tailwind CSS 4.
  It retains source, assets, database migrations, a chemistry editor, and tickets.
- `experiments/starworks-platform/`: a separate experimental multi-league Remix
  app plus Python/Dolphin runner and shared schemas. It is an archive/reference,
  not the replacement app's foundation or runtime dependency.

The original app is more than a scoreboard. Its product inventory includes:

- League/conference standings, schedules, match days, results, match detail,
  locations, and video/stream links.
- Teams, human owners, rosters, captains, batting orders, and fielding positions.
- Drafting, trades, and league activity/events.
- Character pages, character statistics, chemistry views, and leaderboards.
- Per-match player statistics and commissioner/admin editing.
- Discord identity/integration and account/admin workflows.

Distinguish human users from the game's characters: old code calls the latter
“players.” Do not accidentally make a character record into an identity account.
Some old screens are unfinished experiments, not requirements to reproduce.

### Useful reference entry points

Paths below are relative to `tmp/sluggers-super-draft/`:

- `apps/sluggers-super-draft/README.md` and `AGENTS.md`: setup and conventions.
- `apps/sluggers-super-draft/app/routes.ts`: public and administrative feature
  inventory; follow individual routes for actual behavior.
- `apps/sluggers-super-draft/database/schema.ts` and migrations: relationships,
  existing IDs, single-tenant assumptions, and recorded historical data.
- `apps/sluggers-super-draft/app/utils/matches.server.ts`: match lifecycle,
  freezing lineups, scores, and persisted player statistics.
- `apps/sluggers-super-draft/app/routes/admin-match-stats.tsx`: manually editable
  statistics and existing terminology.
- `apps/sluggers-super-draft/app/routes/admin.matches.tsx`: match administration
  and existing schedule JSON handling; this is not a tracker workbook importer.
- `apps/sluggers-super-draft/public/`: team logos and character imagery. Inspect
  provenance/usage before copying; availability does not imply redistribution
  permission for every asset.

Selectively consult Starworks for lessons already discussed by the owner:
`experiments/starworks-platform/docs/game-adapter/tracker-parity-ledger.md`
and `experiments/starworks-platform/PRIOR_ART.md`. This is permission to inspect
that limited prior art, not a request to revive its runner or inspect all emulator
research. Its older telemetry claims are not proof of current tracker capability.

## First milestone: Sluggers UI and theme

Use `apps/ui/`'s existing explorer/composition workbench to prove a coherent
Sluggers treatment with representative fixture data. Avoid scaffolding a complete
Sluggers backend just to establish the design.

### Ownership and implementation boundaries

- `@harrhy/ui/native`: existing native controls, fields, buttons, notices,
  surfaces, and layout primitives.
- `@harrhy/ui/interactive`: existing dialogs, tabs, and select compositions where
  the interaction warrants them.
- `@harrhy/ui/theme`: semantic tokens and theme composition. Inspect current
  `ThemeTokens`, `cleanTheme`, and `composeTheme` before adding an API.
- Sluggers owns sports layouts, typography/art direction, imagery, team colors,
  scoreboards, dense statistics, route behavior, validation, and auth.

Create a Sluggers theme expression using the current theme system. During the
workbench phase it can live with the Sluggers scenes; keep product-specific
composition outside the shared package. Eventually the app owns its treatment.
Promote a missing primitive to the shared library only when it is genuinely
reusable. Do not introduce a generic sports design framework or restyle other
Harrhy consumers to make this theme work.

The inspected UI package used Remix `3.2.0` and `remix/component`; recheck on
arrival. Remix 3 components are not React components. Old React hooks,
`@dnd-kit`, React widgets, and Starworks' beta-era `remix/ui` imports cannot be
ported by changing import paths. Prefer native forms and a small amount of
focused browser interaction. Follow Harrhy's `css(...)` styling convention.

### Representative scenes

1. **League overview / standings:** league and season context, conference
   grouping, team identities, wins/losses, relevant standings columns, upcoming
   fixtures, and meaningful links. Include a second tenant fixture to expose
   hardcoded league assumptions.
2. **Match / box score:** home/away mapping, scheduled versus final states,
   score hierarchy, frozen lineups, batting and pitching tables, source/completion
   warnings, and a clear unknown-stat treatment.
3. **Team / lineup editing:** captain, roster portraits, batting order, defensive
   assignments, validation, save/pending/error states. Provide keyboard-friendly
   reorder controls; drag-and-drop must not be the only way to edit.
4. **Tracker import review:** chosen league/season/match, detected export details,
   mapping resolution, missing data, duplicate/replacement warning, preview,
   and an unmistakable publication confirmation.

Make this feel like a Mario Super Sluggers league, not a generic SaaS dashboard.
Explore typography, compact sports tables, score hierarchy, character/team
imagery, and purposeful color; the palette is not fixed by this document. Team
branding must coexist with a consistent product theme. Favor readable data and
real workflows over decorative card grids or a marketing landing page.

Exercise narrow mobile and desktop widths, long names, full rosters, zero and
unknown values, empty seasons, incomplete imports, and signed-out/admin states.
Use semantic tables with useful headers, visible focus, labeled controls, and
non-color-only statuses. Verify overflow and keyboard behavior in a real browser.

### Completion evidence

- A coherent Sluggers theme and the four working fixture compositions.
- Browser screenshots at representative mobile/desktop sizes and notes on
  interaction/accessibility checks, not screenshots alone.
- Applicable UI package/workbench checks, plus consumer checks if shared APIs
  changed. No regressions to existing themes or legacy exports.
- A short explanation of theme ownership, any actual shared-component gaps,
  and unresolved product questions before expanding into application work.

## Multi-tenancy from the outset

Do not build a global current league into the schema or authorization model and
promise to retrofit isolation later. Keep the platform small while making tenant
boundaries explicit:

- A league is a tenant. Seasons belong to leagues; standings, schedules, roster
  history, drafts, trades, and match results have explicit league/season context.
- Global identity is separate from league membership. A person can belong to
  multiple leagues and have different local roles in each.
- Define commissioner/member/team-manager permissions locally. Do not turn an
  old global `admin` flag into unrestricted access across every league.
- Resolve the league from an explicit route context (a league slug is a likely
  starting point); validate membership and object ownership on the server.
  Hiding links or trusting a submitted `leagueId` is not authorization.
- Scope reads, mutations, imports, file retrieval, background work, uniqueness
  constraints, caches, and any submission credentials to the correct tenant.
  Use relational constraints to prevent cross-league references where practical.
- A shared character catalog may be global; roster membership and historical
  participation are not. Team names/abbreviations should not need global
  uniqueness merely because the old single-league schema did.
- Prove isolation with two leagues, overlapping team names, a multi-league user,
  and explicit tests that a member of A cannot read restricted imports or mutate
  objects in B. Public standings can be public by policy, not by accident.

Decide the minimal model for persistent team identity versus season participation
before migrating. Freeze match appearances so future trades or roster edits
cannot rewrite history. Multi-tenancy does not require self-service provisioning,
billing, a generalized permission engine, or Starworks' broad platform machinery.

## Central identity: auth.jackharrhy.dev

Integrate via the existing `@harrhy/identity` patterns and Auth project
configuration. Read its README and current consumers rather than inventing an
OAuth callback or token-validation implementation.

Auth establishes who a principal is; Sluggers enforces tenant membership
and domain permissions. Use stable issuer/subject identity mappings. Do not link
old Discord accounts by display name, username, or unverified matching email.
Plan an explicit verified linking/admin-assisted migration for existing users.
Do not expose old impersonation/admin conveniences without reviewing their
authorization and audit behavior.

Discord can remain useful for league/community integration. If offered as a
login provider, it belongs on Auth's login screen and should return the
same Harrhy identity model. Provider setup, secrets, and production configuration
are not part of the initial UI pass. Use Harrhy's `HARRHY_AUTH_*` conventions.

## Tracker integration without taking over tracking

Upstream: <https://github.com/isThatC2/Sluggers-Stat-Tracker>.
The operator is expected to keep running it as-is. During planning we inspected
`README.md`, `outputter.py`, and `stat_tracker.py` on `main`; verify the actual
operator release and gather real exports before writing a parser.

At inspection it exports an `.xlsx` workbook plus `.log`, not a structured JSON
result. Workbook sections include `Game Info`, `Stats`, and `Pitching`, with
formula cells and configurable team branding. Capture may start late or end
early. Do not assume filenames, display names, cached formulas, or file presence
alone establish match identity or completeness.

### Stage 1: existing exports

Operator selects a scheduled match, uploads a workbook and optional log, previews
the interpretation, resolves team/character mappings, reviews warnings, then
explicitly confirms publication. The log is supporting evidence initially, not
the primary structured-statistics source.

Import rules:

- Preserve original uploads and provenance: uploader, tenant, target match,
  timestamps, parser version, and interpretation. Protect restricted originals;
  publishing a box score need not publish the raw log.
- Treat uploaded files as untrusted. Bound file size and parser work, including
  archive expansion, and do not execute workbook formulas or follow external
  workbook links.
- Separate upload/parse/review from published match data. Publish atomically;
  previews must not change standings.
- Detect duplicate submissions, make retries safe, and require explicit handling
  of replacements. Never silently overwrite a published result.
- Preserve missing/unknown statistics separately from zero. Explain incomplete
  capture instead of fabricating totals or quietly accepting inconsistent data.
- Derive aggregate rates from raw totals, not averages of averages or workbook
  formula caches. Store pitching work as outs with validated conversion from the
  export's actual notation; baseball innings notation is not decimal arithmetic.
- Do not equate tracker bobbles with the old site's errors. Map only fields whose
  semantics are understood and preserve unsupported source information.
- Confirm scheduled opponent and home/away mapping. Configurable tracker brand
  names are not durable league/team identifiers.
- Keep corrections attributable, with previous evidence recoverable. Avoid a
  heavyweight universal revision engine for ordinary league editing.

### Stage 2: a small structured-export contribution

After workbook import is useful, consider an upstream patch or narrow maintained
fork adding a JSON sidecar while keeping existing workbook/log output. Include
format/tracker versions, completion flags, stable character IDs where available,
raw totals, and an export ID stable across retries. Do not alter capture behavior
just to support the website.

Upstream had no declared license at inspection. Prior collaboration/attribution
is documented in the Sluggers archive, but it does not substitute for explicit
fork/redistribution permissions. Resolve provenance before vendoring or shipping
tracker code; do not assume it can be copied into Harrhy.

### Stage 3: optional “Post to website”

A later tracker action can submit the export through the **same** import/review
pipeline and return a review URL. Use narrowly scoped, tenant-bound credentials,
explicit user consent, retry-safe submission, and preserved local exports on
failure. Submission is not permission to silently publish/replace results or to
grant general commissioner access.

The website does not launch Dolphin, configure the in-game roster, read emulator
memory, manage checkpoints, lease runner stations, or ingest live emulator
telemetry. No custom launcher is required for any of these stages.

## Data migration and later implementation

Preserve the useful original domain behavior, not every old implementation.
Reuse suitable pure logic and query knowledge after reviewing assumptions;
rewrite presentation/request handling for current Remix 3.

Keep PostgreSQL as the initial planning baseline. Do not combine the frontend
migration with an unnecessary database-engine rewrite. Inventory existing data
before settling schema details. Preserve users and verified identity links,
teams/IDs where practical, matches, player statistics, drafts, trades, chemistry,
and historical match lineups. Separate character identity, roster membership,
and match appearances. Migration into the initial tenant/season needs explicit
mapping, validation, backups, rehearsal, and a cutover/rollback plan.

Likely future home: `apps/sluggers/`, with product code owned by that app and
shared packages used deliberately. This is a proposal, not an already created
workspace. Consult `docs/project-imports.md` before any approved source migration;
do not drag the archive, emulator research, or unrelated histories into the app.

Proposed sequence after the first UI milestone:

1. Obtain representative completed/incomplete tracker exports and inventory the
   real league's data, rules, and current workflows.
2. Settle the minimal tenant/season model, identity linking, and import contract.
3. Build one end-to-end path: scheduled match → upload → review → confirmed
   publication → box score and standings, with tenant isolation enforced.
4. Port the remaining original product workflows deliberately: teams/lineups,
   drafts, trades, character/chemistry pages, and commissioner tools.
5. Rehearse migration and cutover while the old site remains usable.
6. Consider structured tracker output and optional submission only after the
   unmodified-tracker workflow works.

Questions still open include the operator's exact tracker release and exports,
season/team continuity rules, commissioner publication/correction policy,
production import storage/runtime, and the visual direction after UI exploration.
Multi-tenancy, Auth, external tracking ownership, and UI-first sequencing
are settled requirements, not open questions.

## State at handoff

The source Sluggers archive was reorganized and merged before this planning;
its original app remains intact. Harrhy's origin was corrected from
`jackharrhy/tea` to `https://github.com/jackharrhy/harrhy.git` and dependencies
were installed locally. That install left an unrelated uncommitted lockfile
change; it is deliberately excluded from this documentation commit. Do not
revert or sweep unrelated working changes into implementation commits.

No Sluggers workspace, tracker fork, database migration, Auth provider, or
production deployment is being delivered by this handoff. The next useful
deliverable is the UI foundation described above.
