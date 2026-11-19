# Browser WebMCP inventory

Worldview is the existing browser consumer. The editor initializes its tools on normal editor startup, not only in a debug build. Registration lives in `apps/worldview/app/assets/editor-webmcp.ts`; contract, read, edit, and document modules beside it own schemas and actions. The frontend-only `@harrhy/webmcp` package owns capability detection, registration, and cancellation. HTTP MCP and its SDK dependencies remain separate in `@harrhy/mcp`.

## Existing Worldview tools

All names retain the `tea_maps_` prefix:

- Reads: `inspect_editor`, `list_objects`, `list_issues`, `list_materials`, `get_map_source`.
- View and edits: `frame_view`, `set_tool`, `select`, `translate_selection`, `rotate_selection`, `scale_selection`, `shear_selection`, `create_box`, `create_point_entity`, `apply_material`, `edit_entity_property`, `duplicate_selection`, `delete_selection`, `history`.
- Documents: `open_project_map`, `replace_map_source`.

Worldview owns Zod validation, live editor state, document identity and revision checks, unsaved-source checks, hosted room permissions, confirmations, and transaction/history behavior. Registration does not grant permission or bypass those checks. Source replacement needs destructive confirmation; project map opening follows the existing unsaved-work flow.

The GPU test's `document.modelContext` shim exercises app integration; it is not evidence that a particular installed browser supports native WebMCP. Unit tests exercise registration cancellation and the app's schema/staleness/confirmation guards without production data.

## Other surfaces

The bounded repository inventory found no other existing browser `modelContext` registration. Gurgur's `server/src/dev-mcp.ts` is a loopback development HTTP MCP server with eleven development tools, not a browser API or a public rollout. Ref's new browser adapter is independently owned by the Ref workspace; it should reuse the shared package rather than mirror its HTTP catalog blindly. Ref is not migrated by this change.

## Browser contract

The current [WebMCP draft](https://webmachinelearning.github.io/webmcp/) and [Chrome imperative API documentation](https://developer.chrome.com/docs/ai/webmcp/imperative-api) use secure-context `document.modelContext.registerTool(tool, { signal })`. Aborting the registration signal unregisters the tool. Execution receives input and an invocation signal. Native annotations include `readOnlyHint`, `untrustedContentHint`, `consequentialHint`, and `debugging`; HTTP MCP's destructive/idempotent/open-world hints are not native browser fields.

Support is experimental: Chrome 149 documents an origin trial or testing flag, and Edge 150 an origin trial. Safari and Firefox positions do not establish shipping support. This change enables no flags, installs no polyfill or browser extension, and grants no cross-origin exposure. Unsupported browsers retain the ordinary editor.

The package has no global registry or shared application context. Apps pass tools and their document, dispose on route exit or logout, and honor cancellation before asynchronous mutations. Page exit cancels registration. A page restored from the back/forward cache needs app-driven registration again; there is no automatic reactivation. See the [package README](../packages/webmcp/README.md) for the API and checks.
