# @harrhy/mcp

Harrhy's MCP boundaries. CMS uses the existing Remix 3 handler and tool/resource definitions at the default export. Artbin uses the additive `@harrhy/mcp/native` entry point for the official SDK's modern transport and native stateless legacy compatibility. Apps keep authentication, origin policy and operation execution in their own routes.

`src/index.ts` is the public entry point. `createHandler` owns parsing and protocol responses; `maxRequestBytes` and `requestTimeoutMs` bound JSON input. Tool and protocol errors use `createToolError`, `createForbiddenError`, and `createInvalidArgumentsError`. Schemas come from [`@harrhy/json-schema`](../json-schema/README.md), results from [`@harrhy/result`](../result/README.md), and optional request log enrichment from [`@harrhy/logger`](../logger/README.md).

`@harrhy/mcp/native` exports `createNativeHandler(factory, { maxRequestBytes, requestTimeoutMs })`. The factory creates an SDK server; the SDK owns discovery, negotiation and protocol dispatch, including existing 2025 clients. The boundary reads actual stream bytes with a size limit and a default ten-second input deadline, accepts one request per HTTP body (no batches), and marks responses no-store. Authenticate and validate request origins before calling it. This does not change CMS's existing protocol handler.

Run `npm run check --workspace @harrhy/mcp` from the root, plus the CMS and Artbin workspace checks when changing this package.

---

## Origin and MIT license

This package ports [Sergio Xalambrí’s mcp](https://github.com/sergiodxa/monorepo/tree/7582e46f150b052ba145945661ac9937f5f26f27/packages/mcp) at revision `7582e46`.

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
