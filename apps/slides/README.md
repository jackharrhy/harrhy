# @harrhy/slides

Slides is a single-presenter deck with private browser authoring. Audience members open `/` without signing in. The presenter advances with the keyboard or mobile clicker. The audience follows a read-only Cap’n Web subscription, with HTTP polling if disconnected.

## Edit and publish

Sign in and choose **Edit deck**. Insert a slide, edit its text, attach an image or MP4 where supported, and **Save slide to draft**. Open the editor again to continue. **Publish saved draft** changes what the audience sees without a build or deploy. **Discard draft edits** restores the published document; neither publishing nor discarding includes unsaved form input. Stale tabs receive a conflict rather than overwriting another save.

- `deck-cell.ts` owns one SQLite draft, published snapshot and playback position per deck. `HARRHY_SLIDES_DECK_ID` selects the DO for this origin (default `default`); there is no public directory or user-selected namespace. A new deck receives the small synthetic seed in `deck.ts` once.
- `editor.tsx` uses native forms under the same owner session, write flag and exact-origin mutation checks as the presenter controls. A stable slide ID survives rename and reorder. Publishing keeps the current slide if it exists, otherwise selects the first, and resets action modes. `render.ts` renders the published snapshot; `player.ts` reloads the rendered deck on a new published revision. Navigation sends the revision it was rendered against.
- SQLite holds references, not files. `MEDIA` is an R2-compatible bucket. Uploaded JPEG, PNG, WebP and MP4 bytes are type/signature checked and stored under deck-scoped immutable keys. Public media reads require a current published reference; the draft preview route requires the presenter session. Discard/removal detaches references, **not** a promise of byte erasure. The first slice retains deduplicated uploads (including superseded/abandoned uploads) in a bounded pool: 8 MiB per file, 128 MiB and 256 unique keys per deck. No GC, revision-history UI or distributed catalog. Deck text is capped at 256 KiB, 100 slides.
- `viewer-session.ts` uses `@harrhy/live-state/channel`; `player.ts` uses its matching `watch`. The public, same-origin `/watch` socket exposes only start/stop for one published deck, never presenter commands or draft content. A persistent stream ID scopes reconnects. Its SQLite cursor advances in the same transaction as navigation, actions or publication, independently of the published document revision. The reader resumes at an acknowledged cursor or receives the latest snapshot. The tradeoff is a standard, non-hibernating socket with a 150 ms in-memory change check, a 128-viewer cap and a two-second ack deadline; no replay history or per-tick SQL.
- `editor.tsx` uses the shared native Field, Input, Textarea, Panel and Stack. Selects stay native so forms need no hydration. Image placement uses percentages of a fixed slide, not the pixel-world camera, pan/zoom or connectors used by Ref and Clank. There is no shared drag interaction to extract from this form.
- `build.ts` builds the player, stylesheet and font, not presentation content. No host writer, source hash, private build input or operator layout endpoint is used.

### Scope of the draft

Native slide kinds are text, typed cover, stretch poster, image, video and overlapping windows. The editor supports adding, editing, moving, removing and publishing slides, replacing media and setting image x/y/width percentages. Keyboard navigation, fullscreen, the clicker previews/timer and shared slide actions remain.

**Not ported:** the on-slide drag/rotate/resize inspector, arbitrary layers/opacity, extra dropped-image slots, and the workshop-specific timeline, highlighted editor/terminal scenes, theme artwork and per-element layouts. The archived `examples/workshop-talk.json` is unchanged and not loaded. There is no import/export or legacy storage migration. The old rehearsal's deck, screenshot BLOBs and position are not read. Use a **new isolated store** for review; do not point this draft at the existing experience.

## Local checks

From the repo root with Node 26 and workspace dependencies installed:

```sh
pnpm --filter @harrhy/slides run check
CELLD_BIN=/absolute/qualified/celld CHROME_BIN=/absolute/chrome pnpm --filter @harrhy/slides run test:native
```

The native check verifies the [pinned binary](../../docs/celld-runtime.md), builds a temporary loopback fixture with synthetic authorization, saves a draft with media, restarts, publishes, checks stale writes and audience visibility, then removes the fixture. Set `CHROME_BIN` for the two-browser-context test; omit it for HTTP-only checks. These checks neither authenticate against Jack Auth nor use existing Celld stores. For read-only local browsing, run `pnpm --filter @harrhy/slides run dev` in a disposable checkout with the qualified Celld on PATH.

## Presenter sign-in

Register a Jack Auth browser client with PKCE S256 and exact callback `https://<slides-origin>/auth/callback`. Set `HARRHY_AUTH_ISSUER` to `https://auth.jackharrhy.dev` and provision `HARRHY_AUTH_CLIENT_ID`, `HARRHY_AUTH_PROJECT_ID`, `HARRHY_AUTH_ORGANIZATION_ID`, and `HARRHY_AUTH_OWNER_SUBJECT` (Jack's exact OIDC subject). Set `HARRHY_SLIDES_ORIGIN` to the exact HTTPS origin, with no trailing slash, and supply a random `HARRHY_SLIDES_SESSION_SECRET` of at least 32 bytes through operator-managed configuration. Do not commit it. Incomplete settings disable sign-in and leave the audience page read-only.

Configure the owner subject out of band. Network access alone does not grant presenter access: the verified subject must match and have the `slides-presenter` grant in the configured project and organization.

Leave `HARRHY_SLIDES_PRESENTER_WRITES` unset while verifying the normal owner session: sign-in and sign-out work but no one can change the slide. Set it to exactly `1` only after that succeeds.

Run Celld behind a trusted TLS proxy that replaces `X-Forwarded-Host` and `X-Forwarded-Proto`; bind the Worker listener to loopback and use `--trust-forwarded-headers`. Proxy `/`, `/watch` (including WebSocket upgrades), `/position`, `/edit`, `/edit/media/`, `/media/`, `/allo.woff2` and `/auth/` routes. Keep Celld's operator port private. The presenter signs in at the deck and advances it with the keyboard. Sign out ends the local presenter session, not the issuer session. This app has no production route configured.

Keep preview content synthetic or cleared for the rehearsal audience. Never add private chats, session inventories, credentials, hostnames or company data. Use the approved private preview registry for rehearsal, not a production deployment.
