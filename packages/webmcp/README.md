# @harrhy/webmcp

Frontend-only registration for the experimental browser WebMCP API. Worldview is the first consumer. This is not an HTTP MCP transport and has no production dependencies. The [browser inventory](../../docs/WEBMCP.md) records the existing tools and ownership boundaries.

Import `registerWebMcpTools`, `WebMcpTool`, and `WebMcpAnnotations` from `@harrhy/webmcp`. Call `registerWebMcpTools(document, tools, { signal })`. The synchronous result exposes `supported`, `ready`, and `dispose()`. Capability detection uses `document.modelContext.registerTool`; unsupported browsers register nothing. `supported` does not mean registration succeeded or permission was granted: await `ready` to observe success or rejection.

Registration failure aborts all tools in this registration. Disposal, the supplied signal, and the document window's `pagehide` abort registrations and block subsequent executions, including when a host fails to honor registration cancellation. Invocation signals are combined with registration cancellation; asynchronous tools must honor their signal before committing work. Cancellation cannot undo a completed mutation. Dispose explicitly on route exit or logout. After back/forward-cache restoration, the app must register again; the package does not silently reactivate tools.

Apps own schemas, input validation, live state, authorization, confirmation, transactions, and result serialization. Native annotations are `readOnlyHint`, `untrustedContentHint`, `consequentialHint`, and `debugging`; these hints are not security boundaries. No cross-origin exposure option, shared registry, polyfill, HTTP server, or SDK client is provided.

The current [draft](https://webmachinelearning.github.io/webmcp/) exposes `Document.modelContext` and signal-based registration, not `navigator.modelContext`, `provideContext`, or `unregisterTool`. Browser support is experimental (Chrome 149 origin trial/testing flag; Edge 150 trial), not universal. Tests use a fake browser surface and do not establish native browser availability.

Run `npm run check --workspace @harrhy/webmcp` and the Worldview check after changes. Implementation is `src/index.ts`; tests live in `__tests__/`.
