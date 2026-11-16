# @harrhy/mcp

The canonical HTTP MCP boundary for Artbin, Lists, Maps, Ref and TeaCMS. Import from `@harrhy/mcp`; there is no `/native` alias or separate custom protocol engine. Browser tools use the independent `@harrhy/webmcp` package.

## Transport

`src/index.ts` exports `Server`, `specTypeSchemas` and SDK result/descriptor types from official `@modelcontextprotocol/server` 2.4.0, plus `createNativeHandler(factory, { maxRequestBytes, requestTimeoutMs })`. The official SDK owns negotiation, lifecycle, SSE/JSON responses, protocol dispatch and native stateless legacy compatibility (`legacy: "stateless"`). Real-client fixtures cover Executor SDK 1.32.1 and current client 2.4.0 pinned to 2026-07-28.

The boundary reads actual stream bytes with a size limit and a default ten-second input deadline, rejects batches and marks responses no-store. Apps authenticate and validate origins before calling it, and retain their own scopes, audiences, ACLs, catalog visibility and error policies. Existing controllers capture their authorized Remix context in closures; the package creates no ambient context container.

## Typed tools

`defineTool({ name, input, output?, description?, annotations? })` derives an official descriptor from Standard Schema and Standard JSON Schema contracts. Existing Zod or `@harrhy/json-schema` schemas supply validation and discovery from one definition. Schemas must support the draft-2020-12 converter. The input converter describes wire input; the handler receives validated, transformed output.

`bindTool(definition, handler, { invalidInput, invalidOutput })` returns an async callable accepting unknown input. The handler returns an SDK `CallToolResult`, keeping text formatting and structured-result wrapping explicit. When an output schema is declared, successful structured content is required, validated and projected to its parsed value; error results bypass successful-output validation. Apps choose safe validation errors and catch or mask business exceptions themselves. Dispatch and `server.projectCallToolResult(result, definition.descriptor.outputSchema)` remain explicit SDK calls, not another RPC engine.

TeaCMS uses definitions and bound handlers for its two published-content reads; its selected-site store is captured in a closure. Other apps retain existing schemas and validation/error behavior while importing the same canonical transport.

## Checks

Run `npm run check --workspace @harrhy/mcp` and all five consumer checks from the root. Tests include both actual SDK clients, typed input transformations, output validation/projection, app-owned expected/masked errors, stream byte budgets and deadlines. `__tests__/binding.types.ts` includes compile-negative inference fixtures in the typecheck.

## Origin and MIT license

The earlier implementation ported [Sergio Xalambrí’s mcp](https://github.com/sergiodxa/monorepo/tree/7582e46f150b052ba145945661ac9937f5f26f27/packages/mcp) at revision `7582e46`. Its custom protocol engine has been removed. The small definition/binding API retains the declaration/typed-handler idea, with official SDK transport rather than that engine. Historical attribution follows.

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
