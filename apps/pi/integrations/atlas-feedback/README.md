# Atlas feedback adapter

A trusted server-only plugin for the Atlas Node app. It declares `atlas.feedback` version 1 through
the trusted stimulus API (`@p2/app/v1/server`). Stimuli own the immutable outbox; workers own native admission and settlement.
It never sends through conversations tools, opens worker stores, or borrows owner credentials.

## Installation and operator window

Install `atlas-feedback/` explicitly as a real directory in `<P2_DATA_DIR>/plugins/`, using the matching
base p2 build. Follow the [operator cutover](../README.md) when replacing the previous built-in. This
package has only a server facet. Once installed, absent configuration returns 503; the base alone has
no Atlas routes. No host/network route changes or dependency installation are required. Exact receipt
links rely on p2's explicit conversation routing, including `/c/1`.

The operator authorizes the recipient role with `recipients: "top-level"`. The adapter derives recipients from the
native session catalog, including idle/stopped sessions, and provisions native subscriptions on catalog GET. Each
binding is deterministic for resource/session/current-main conversation. Registration validates native
private/unarchived/writable policy; no sharing grants are changed. Subagents and one-shot conversations have no
session catalog rows and never become recipients. New eligible sessions need no per-agent configuration or code.

Existing explicitly authorized subscription IDs remain available for original-binding retries/readback. For a current
main already covered by an explicit subscription, the adapter retains that binding unchanged. A main switch creates
a separate binding, never revises or retires an old one: native frozen events retain their original conversation.

Write private `<P2_DATA_DIR>/atlas-feedback.json` (0600), read afresh on each request:

```json
{
  "token": "<dedicated random app-only secret, at least 32 characters>",
  "resource": "<same stable instance identity>",
  "articleOrigin": "https://<same canonical Atlas host>",
  "subscriptions": ["<previously approved subscription id, retained for history>"],
  "recipients": "top-level",
  "defaultSessionId": "<stable default root session UUID>",
  "piOrigin": "https://<canonical private Pi host>"
}
```

`resource` is permanent instance identity, not a credential or user-entered label. Keep approved subscription IDs in
this list for old-binding retries/readback; removing one revokes app access to its history too unless it is a
role-derived binding. `recipients` is optional: without it only the explicit subscriptions are authorized.
`defaultSessionId` is external configuration, not a title match or a hardcoded roster. Revising or disabling
a subscription keeps its old event identity and receipts. Token rotation does not change target keys or identities.
Never put the token in source, a subscription, a URL, browser data or logs. Give the Atlas Node server the dedicated
secret through private server configuration. No owner key/auth/settings edits are needed. Optional `piOrigin` must
be an exact HTTPS origin; configure the actual private owner-facing Pi origin, not a share link. It supplies receipt links and confers no viewing authority.

## Private app-to-Pi API

Every request supplies `Authorization: Bearer <dedicated secret>`. Owner cookies alone confer no authority. Requests
with `Origin` or `Sec-Fetch-Site` are refused: these endpoints are server-to-server only. Pi's normal Host admission
still applies. Atlas owns exact browser Origin/CSRF checks and its temporary trusted Tailnet ingress; Pi independently
authenticates this app credential and confines resources/targets. Do not expose credentials to the browser.

### GET /atlas-feedback/targets

```json
{"targets":[{"sessionId":"<stable root UUID>","key":"<opaque sha256 key>","revision":1,"label":"Actual session title","glyph":{"paths":[]}}],"defaultSessionId":"<configured UUID or null>","eligibleCount":1,"omittedPrivacyCount":0,"unavailable":[]}
```

Only authorized, enabled bindings for this source/version/resource/origin whose sessions remain private/unarchived
and whose current main conversations pass native writable validation appear. Labels are always session titles,
never branch labels; selection identity is `sessionId`, while Send freezes the returned `key`/`revision`. Never
rewrite an existing batch with a newer binding. Native validation may start an idle/stopped worker but never submits
input. Disabled bindings are not automatically re-enabled. Archived sessions are omitted. Shared sessions are omitted
without identity or sharing details; only `omittedPrivacyCount` is returned. Private unarchived sessions that cannot
be offered appear in `unavailable` as `{sessionId,label,reason}` (`binding-disabled` or `not-writable`). A known failed
worker is unavailable without restarting it; other root validation gets a five-second budget. A timed-out root is
not verified writable and does not prevent healthy roots from appearing. Other infrastructure failures remain
errors, not fabricated eligibility.

`glyph` is always `{"paths":[]}`: Pi has no glyphs, and Atlas's bridge still requires the field. Clients draw nothing for it.
No cwd, project path or authentication details are returned. The default may be unavailable: clients must show
that fact rather than silently choosing another recipient.

### POST /atlas-feedback/batches

Content-Type must be exactly `application/json`; the complete UTF-8 body is limited to 24,576 bytes.

```json
{
  "payloadVersion":1,
  "target":{"key":"<returned key>","revision":1},
  "batchId":"<stable persisted app batch id>",
  "payloadDigest":"<lowercase sha256>",
  "comments":[{
    "id":"<stable comment id>",
    "articleUrl":"https://<canonical Atlas host>/article",
    "sourceSha256":"<sha256 of the exact UTF-8 article source>",
    "annotationProjectionSha256":"<sha256 of UTF-8 rendered annotation text projection>",
    "quote":{"exact":"Selected text","prefix":"Before ","suffix":" after","start":7,"end":20},
    "comment":"Separate owner-authored free-text comment"
  }]
}
```

`payloadDigest` is lowercase SHA-256 of UTF-8 canonical JSON of **comments only**: recursively sort object keys
lexically; preserve array order, strings and numbers; no whitespace or Unicode normalization. The fixed schema's
implementation is `payloadDigest` in `contract.server.ts`. Positions are zero-based UTF-16 offsets into the app's
rendered annotation-text projection, end-exclusive (`end-start === exact.length`). `annotationProjectionSha256`
identifies that exact projection separately from raw Markdown `sourceSha256`. Atlas must preserve both source and
projection that justify the evidence; Pi does not fetch articles or certify quote authenticity.
Article URLs must already equal `new URL(url).href`, have the configured exact origin, and contain no credentials
or query/fragment. The configured articleOrigin must itself be an exact HTTP(S) origin with no path. Canonical
article paths are preserved exactly; normalized dot segments or other noncanonical URL spellings are rejected.
Evidence is JSON-structured untrusted source, separate from the free-text comment; there is no intent enum.

All wire objects reject unknown fields, including nested quote objects. `payloadVersion` is exactly 1 (independent
of source version 1). A batch holds 1–32 comments with unique IDs (1–128 characters each). Quote exact and comment
text are 1–4096 characters; prefix/suffix at most 256 each; canonical article URLs at most 2048. Offsets are safe
integers. The total encoded 24 KiB budget still applies and is usually the tighter limit.

Atlas persists exact body/identity before attempting Send. Pi recomputes the digest and publishes the exact batch ID
as stimulus event ID, fixed to source/version/subscription/revision. Response:

```text
{ batchId, payloadDigest, binding:{key,revision}, receipt: EventReadback, chatUrl?: string }
```

Identical concurrent/restarted retries retain the same immutable envelope, even after the binding is revised or
disabled or the session switches main. When no native event has been recorded, a binding must still point to the
current main; an old-main key returns 409 rather than starting a new batch on a retained branch. A frozen app batch
must keep its original binding even when refused; never silently retarget or mint a replacement identity.
Changed content under the same identity returns 409. New events on a retired/unavailable binding return
409; unknown/non-approved target keys return 404; schema/evidence errors 400; wrong credential 401; browser ingress
403; oversized bodies 413. Unexpected infrastructure failures remain server errors, not fabricated conflicts.
Never mint a replacement batch ID to hide an uncertain request.

### GET /atlas-feedback/receipt?key=...&revision=...&batchId=...

Use the **original** key/revision/batch ID, not the current target revision. Response:

```text
{ batchId, binding:{key,revision}, receipt: EventReadback, chatUrl?: string }
```

`EventReadback` is the actual `plugins/stimuli/contract.ts` union, not an app-invented success state:

- `missing`: no saved event at that binding identity; does not rule out a late in-flight commit.
- `recorded`: persisted intent; inspect `event.phase` (including closed/unattempted).
- `unknown`: native admission may be in flight or uncertain.
- `admitted`: authoritative native receipt; inspect phase for `settled` and outcome `done`/`unanswered`.

`chatUrl` is present only when `receipt.state` is `admitted` and `piOrigin` is configured. Its explicit
`/s/<session>/c/<conversation>` path comes from the immutable saved envelope, never the current binding or latest
main. Conversation 1 is explicit too. Missing, recorded and uncertain receipts never supply a success link. The
link is an ordinary private Pi route: existing owner authentication is still required, and no share link is created.
An admitted receipt supports “Sent” (native input accepted), not a claim that the requested work succeeded. A saved
initial `recorded` response is not current admission status; use receipt GET with the original identity to refresh it.

The exact native envelope is `receipt.event.envelope`; it includes full source/version/subscription/revision/event
identity, event/config digests and frozen native target/text. `recorded`, `admitted`, and even native `done` do not
assert business success. Atlas retains its submitted payloadDigest; receipt GET does not synthesize one from rendered
text. External native attribution is `{kind:"external",id:"atlas.feedback",title:"Atlas feedback"}`, never owner input.

## Verification

From `apps/p2`:

```sh
node --import ./src/source.ts --test test/p2/atlas-feedback.test.ts
npm run check
```

Tests use disposable real stores, synthetic targets and the fake model. They cover ingress credentials and Origin,
allowlist/privacy, bounds/resource policy, strict unknown fields/payload version, projection/content digest
conflicts, concurrent retries, one native external
entry, retirement, original-binding settlement readback, sharing revocation, and server restart. No real-agent input,
real subscriptions, auth keys, host routes or runtime reloads are part of testing.
