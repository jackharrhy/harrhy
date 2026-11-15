# Radio scene port

App-local synthetic port of the actual Radio room presentation at Harrhy `6d0376f9977e05fff020add9b896cad312590c5f`. This is not a production Radio client or a second shared UI kit.

## Source map

- `player.tsx` adapts `apps/radio/app/assets/radio-room-components.tsx`: whole player, queue, native track menus, rename, keyboard/drag reorder, seek and calibration.
- `styles.ts`, `desktop-styles.ts`, `theme.ts` preserve the source room and desktop presentation.
- `header.tsx` adapts the original Radio header; links stay inside the synthetic scene.
- `text-fit.ts` retains Radio's existing Pretext fitting, using the same dependency rather than another fitter.
- `visualizer.tsx` contains only Radio's deterministic SVG preview. No analyser, canvas drawing loop or audio runtime.
- `model.ts` owns fresh synthetic scenarios and synchronous local actions through a small presentation interface. No cast to RadioClient, storage, sockets, audio context, media URLs, auth or upload API.
- `scene.tsx` owns scenario controls, reset and ResizeObserver lifetime.

Deliberate changes: remove file selection and production visualizer paths; “upload track” adds synthetic metadata only. Restore keyboard focus after rename commit/cancel and deletion; provide a local announcement. Playing changes fixture state but does not advance time or load audio. Scenario controls expose empty/offline/syncing/upload/failed/buffering/calibration states without a server. Existing Radio source and runtime remain untouched.

## Font provenance

`material-symbols-rounded.woff2` is the exact local Radio asset, originally supplied by `@material-symbols/font-400` 0.49.0. The package's Apache-2.0 license is preserved in `MATERIAL-SYMBOLS-LICENSE.txt`. The scene-only `fonts.css` declares the face; no remote font request. No glyph/theme/implementation is copied from Primer, Geist or Pierre.

The narrow font asset extension and Pretext package are explicitly allowed by the showcase asset server. The parent app owns hosting and controls. Browser tests must prove no non-asset requests, no WebSocket/audio/storage creation, local keyboard interactions and responsive geometry.

## Shared-library adoption

Before the polish pass, only `scene.tsx` used @harrhy/ui: Inline, Select and Button around scenario/reset controls. The player itself was bespoke. The current boundary is component/file based, not a line-count percentage:

- `scene.tsx`: shared Inline, Select and Button own scenario controls.
- `player.tsx`: all five transport/calibration actions use shared Button (native button semantics, variant, disabled and focus recipes); seek and volume use shared Range; inline rename uses shared Input. Range was added to the library for this genuine native-control need, not as a Radio widget.
- `theme.ts`: `radioControlsTheme` maps the actual desktop skin to the shared public token contract. `styles.ts` retains icon glyphs, compact geometry and layout, removing duplicated transport base button styles. Native ranges retain the original local track/thumb artwork over shared target/focus/disabled treatment.
- Queue rows, reorder handles, native details menus, upload action, header, listeners, visualizer and title fitter remain app-owned source-derived presentation. Their track lifecycle, calibration/seek commit logic and synthetic model are business composition, not generic package APIs.

This is partial, meaningful shared-control adoption, not a claim that the whole Radio scene is library-built. There is no generic queue/menu/toolbar abstraction yet: no independent consumer needs that policy. The production Radio app is unchanged. Slider and calibration hit areas are at least 24px high; touch and screen-reader testing remain manual follow-up work.
