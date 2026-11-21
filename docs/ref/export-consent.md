# Ref export authorization

On the existing `/mcp` connection, a human with the granted and requested `boards-read` capability can export all shared boards and their referenced media in bulk. There is no new scope or consent prompt. `boards-write` alone does not allow export. Board tokens cannot use the admin archive listing, HTTP start/status or restore routes; only the owner-bound GET download accepts either authorized token family.

## Dedicated archive connection

For export without granting other board tools, configure a separate MCP connection to the **canonical Ref origin** at `/mcp/archive`. Start with no saved board token or configured board scopes. Its RFC 9728 metadata at `/.well-known/oauth-protected-resource/mcp/archive` and its bearer challenge both name one requestable scope set:

```
openid urn:zitadel:iam:org:project:id:<Ref project ID>:aud urn:zitadel:iam:org:projects:roles urn:zitadel:iam:org:project:role:admin urn:zitadel:iam:org:project:role:archive-read
```

Clients can use the 401 challenge's `scope`, or request the complete `scopes_supported` from this resource's metadata. Clients such as Pi's MCP transport combine previously granted scopes with a 403 `insufficient_scope` challenge during step-up. Stepping up a board connection by adding archive scopes would produce an invalid mixed request. Keep `/mcp` for boards. No restore, board, profile, email or offline scope is needed for export. Use a delegated OAuth client with its own registered callback and PKCE; the Ref browser client ID is not an archive MCP client. The issuer must already support the requested vocabulary, client and grant.

## What Allow means

Jack Auth resolves a client ID found in its effective application registry as **direct**, before looking at the requested audience or scopes. Adding archive scopes to a registered app's login does not turn it into delegated consent. For a client **not** in that registry, an authorization request targeting Ref must pass the delegated policy. Auth checks the selected account's active grant for both `admin` and `archive-read`, shows **Allow access?** for Ref with the client callback origin and **Administrator, archive-read**, and accepts an explicit Allow or Deny. Approval checks the request and grants again. The policy test in `apps/auth/__tests__/ref-delegation.test.mjs` contrasts the two paths; `apps/auth/__tests__/browser/authorization.mjs` uses a synthetic unlisted client and issuer to exercise the existing-session consent screen.

This is approval of the client's **archive-read capability**, which includes reading all shared boards and media. It is not approval of an individual export, download, destination or assistant action. Ref introspects the bearer and enforces the subject, audience, role grants and scopes; it rejects Ref's own configured browser client. Introspection does not contain a signed consent receipt or the Auth registry. Ref cannot attest that an arbitrary bearer from another client traversed the delegated UI. A native or fixture token, or a tool confirmation in an MCP host, is not evidence of such a click.

`export_start {}` starts a job. `export_status {id}` checks a job for the authorized subject. A ready result contains `downloadUrl`, never archive bytes. The URL has no token and grants no authority: fetch it with an `Authorization: Bearer` header and current board-read or dedicated archive authorization for the same subject. Do not put the token in a URL or tool argument. A browser session alone does not authorize a download.
