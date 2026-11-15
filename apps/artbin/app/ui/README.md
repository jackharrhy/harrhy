# artbin UI system

This app-owned composition layer is the source of truth for recurring archive interface patterns. It consumes `@harrhy/ui` native components, recipes and semantic theme tokens; archive behavior stays here. The live reference is available at `/dev/kitchen-sink`.

## Foundations

- `styles.ts` owns document-level tokens and low-level Remix `css()` descriptors used by interactive client entries.
- `primitives.tsx` owns actions, feedback, fields, layout headers, status, progress, tables, metadata, and disclosure components.
- `navigation.tsx` owns tabs and breadcrumbs.
- `media-card.tsx` owns folder and asset cards.
- `modal.tsx` composes the shared native Dialog for upload flows, including backdrop dismissal and focus restoration when the app unmounts it.
- Optional self-hosted font CSS/binaries and OFL provenance live in `packages/ui`; the app document loads them explicitly. No app imports assets from the showcase.

Route tabs remain native links with `aria-current`. Form selects remain native for no-script editing, validation and reset. Do not replace either with a widget solely for visual consistency.

## Composition rules

1. Use a shared component when the interface has the same meaning as an existing kitchen sink example.
2. Keep route-local `css()` descriptors for domain-specific layout only.
3. Add a new shared component when the same visual or interaction pattern appears in a second route.
4. Add every new shared visual state to the kitchen sink in the same change.
5. Keep behavior in the component that owns it. Do not pass browser event handlers through server-rendered route data.

The kitchen sink deliberately renders production components such as `FileCollection`, `SearchBar`, `ModelViewer`, `UploadControl`, and `LuckyButton`. This keeps the reference page honest and makes visual drift visible during development.
