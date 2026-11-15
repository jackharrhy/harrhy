# TeaCMS MCP

The Node app serves read-only MCP at `POST /tea/mcp` on each registered site host. It uses the official SDK-backed `@harrhy/mcp/native` boundary with stateless Streamable HTTP, including existing 2025 clients (Executor's SDK 1.32.1) and native 2026 clients. `list_published_pages` and `get_published_page` read the selected site's published content, never drafts or previews.

Without `TEA_MCP_TOKEN`, the endpoint returns 404. Set a long random token through your secret manager and send `Authorization: Bearer <token>`. One token grants read access to every site in this Node process. Keep it private and out of tracked files. Editor login does not authorize MCP.

In Auth mode, the shared token is ignored. Each site publishes
`/.well-known/oauth-protected-resource/tea/mcp`; the resource is the site's
`/tea/mcp` URL. A human token must have the CMS project audience, admin grant,
and admin role scope. The immutable subject must match `TEA_AUTH_OWNER_SUBJECT`
under `TEA_AUTH_ISSUER`; service and acted tokens are rejected. The initial Central
Auth registry release is owner-only, not project-wide admission. The app introspects every request using its dedicated
resource credentials. Browser cookies and service tokens do not grant MCP
access. The tools remain read-only. The SDK owns negotiation and request/stream lifetime;
input is limited to 64 KiB with a ten-second read deadline, and batches are rejected.

TeaCMS selects the site from the hostname before routing MCP. The route uses the public site's request-scoped `ContentStore`. A future write-capable MCP needs separate scoped credentials and per-tool authorization.

The Cloudflare app [`@harrhy/cms-edge`](../../apps/cms-edge/README.md) has no MCP endpoint yet. Its D1/R2 storage is separate from the Node app's SQLite store.
