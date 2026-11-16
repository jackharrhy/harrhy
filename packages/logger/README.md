# @harrhy/logger

Harrhy's shared request and job event accumulator. CMS and CMS Edge open request records; Ref's logging pilot opts into JSON output and app-owned context. `@harrhy/mcp` does not automatically enrich these records: apps instrument their validated SDK handlers.

`src/index.ts` exports `createLogger`, `createLog`, `Log`, `currentLog` and `jsonSink`. Hosts use `logger.request(request, handler)` for HTTP method/status, or `logger.open(kind).run(handler)` for custom request/job boundaries. `@harrhy/logger/middleware` exposes the active record as `context.log`. Ambient context uses Node `AsyncLocalStorage`; Workers need Node compatibility. Browser bundles must not import it.

All emitted records include completion `timestamp`, `kind`, `outcome` and `duration_ms`. Configure service/environment/version at startup. Default output remains console objects for existing consumers; explicitly select `sink: jsonSink` for one JSON string per line on stdout/stderr. Sink/serialization errors cannot replace an application result or exception. A failed custom sampling predicate retains the event. This is best-effort output, not a buffered delivery guarantee.

The package still adds no URL/query, headers, bodies, correlation IDs, error message or stack by default. `fail` records error type, scalar code and retriable flag. Apps add useful safe diagnostics/context explicitly. `logger.request` records status but does not classify returned error responses: app boundaries must set error/degraded outcomes before sampling. Ref's app-owned policy and tests are described in [its guide](../../apps/ref/README.md#logging-pilot).

Run `npm run check --workspace @harrhy/logger`. Changes also need CMS, CMS Edge and Ref consumer checks; run MCP's check when changing its integration. There is no Shell MCP workspace in this checkout.

---

## Origin and MIT license

This package ports [Sergio Xalambrí’s logger](https://github.com/sergiodxa/monorepo/tree/7582e46f150b052ba145945661ac9937f5f26f27/packages/logger) at revision `7582e46`.

MIT License

Copyright (c) 2026 Sergio Xalambrí

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
