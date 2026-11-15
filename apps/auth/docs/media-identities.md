# Reviewed media identity lifecycle

This feature is in development, not deployed. Services → Media identities (`/manage/media`) exposes read-only native inventory and reviewed exact-ID linking for active Auth administrators. `src/media-identities.mjs` owns mappings and audit reviews in the existing access SQLite database; `media-inventory.mjs` and `jellyfin-inventory.mjs` own bounded read-only sources. Mapping does not change directory eligibility, issuer provisioning or native permissions.

## Boundaries

An issuer subject, a portal assignment, a native account and a native session are different resources. The existing access model's `links` authorize reviewed project-role assignment; media identity mappings do not replace or modify those guards. In particular, Jellyfin and Seerr sharing directory eligibility does not establish that both native accounts are linked.

Mappings use exact `(issuer, subject)` and `(service, instance, nativeId)` tuples. Names and email are display data, not matching keys. A native account and a subject each have at most one mapping per service instance. A mapping records operator, reason and time; it grants no role, changes no native account and authorizes no login. No automatic account deletion, reassignment or reconciliation is supported.

The ledger accepts a host-owned SQLite connection. Its callers must enforce active Auth administrator membership, CSRF/Origin validation and verified organization-scoped issuer inventory. The module is not an authorization boundary exposed directly to users. Review and confirmation must each obtain read-only native inventory; unavailable/stale inventory cannot prove account absence. Reviews expire after five minutes and require the same operator, exact current active issuer subject and unchanged native account. SQL uniqueness and transactional confirmation prevent two conflicting reviews from silently replacing each other. Completed confirmation is idempotent.

## Remaining implementation layers

1. Validate deployment-specific full-roster permissions before enabling the Jellyfin reader. Add installed-contract-verified Seerr/Navidrome inventory adapters as needed; file snapshots are already supported for explicit operator-produced receipts.
2. Complete deployment recovery/backup and owner preview checks. Roster, discrepancy, review/confirmation and durable audit routes use the existing session, CSRF/Origin and administrator boundaries. Unknown/native-only records remain untouched until an explicit manual action.
3. Wire the durable onboarding foundation into reviewed account creation and a proof-bound recipient callback. `src/identity-onboarding.mjs` is currently unwired: it reserves an exact new subject at preview, requires the same actor and fresh review to create without a password or initial email delivery, then requires a separate exact-recipient confirmation to request a native invite. Creation/invitation interruption or errors become distinct uncertain states and never retry automatically. It does not invite existing/discovered users, grant access, create native accounts or persist codes/passwords. The existing immediate-create UI is not yet replaced. Verify the chosen deployment credential's authority separately; matching provider versions proves no credential permissions.
4. Add selected-service provisioning adapters with explicit least-privilege policies and read-after-write verification. An issuer invite is not native provisioning; neither implies role assignments or session revocation.
5. Exercise synthetic end-to-end browser flows and preview for owner review before a targeted Infra-owned Auth rollout. No production person mutations as part of validation.

Existing native-only household examples must remain unchanged through feature deployment, including history and watchstate. The owner will resolve them later through the UI; no identity-details question blocks implementation. Never commit their private IDs as fixtures.

Navidrome's fixed native administrator proxy remains owner-only. A generic mapping must not widen its viewer gate. Opening requires separately proven per-user least-privilege isolation and an explicit opening decision. Preserve OpenSubsonic credentials, Jellyfin passwords/QuickConnect/native clients, Seerr requests and requester permissions `160` (`REQUEST | AUTO_APPROVE`). Unsupported non-destructive offboarding remains manual-required, not a fabricated success; deleting Seerr users is not session revocation.

## Read-only inventory configuration

Infra owns production configuration and credentials. `AUTH_MEDIA_INSTANCES_FILE` optionally points to a private JSON array; absent configuration yields an honest unconfigured screen, never a production scan. Instance names/keys are explicit and stable. The browser cannot supply endpoints or credential paths.

A server-side Jellyfin reader entry:

```json
[
  {
    "service": "jellyfin",
    "instance": "reviewed-server",
    "name": "Jellyfin",
    "adapter": "jellyfin",
    "baseUrl": "http://127.0.0.1:8096",
    "tokenFile": "/run/secrets/jellyfin-inventory-token",
    "fullRosterReviewed": false
  }
]
```

Keep `fullRosterReviewed` false until Infra proves that the selected credential can enumerate the full unfiltered roster on the installed server. False fails unavailable without reading credentials or making a request. A server API key is privileged; this is **not** a claim that Jellyfin has endpoint-scoped/read-only keys. This adapter only issues `GET /Users`, with no filters, no redirects, a five-second timeout and a 1 MiB response cap. It uses server-side `Authorization: MediaBrowser Token="…"`, accepts validated PascalCase/CamelCase `UserDto` fields, and treats null/missing policy, partial/wrapped results and duplicate IDs as unavailable. Installed OpenAPI evidence supplied by Infra describes `/Users` as a top-level array, with no pagination contract and only `isHidden`/`isDisabled` filters. Do not filter or truncate an authoritative inventory. No credential reaches rendered data or audit bodies.

Alternatively configure a source with `service`, `instance`, `name`, and absolute `snapshotFile` (no `adapter`). The file contains `{service, instance, state: "available", observedAt, accounts}`. Each account has only `nativeId`, `name`, boolean `disabled` and boolean `administrator`. Source scope must match configuration. Readers strip extra fields, reject duplicate IDs/oversized files, and retain the source timestamp; five-minute-old/future/invalid snapshots do not permit linking. An unavailable source is not an empty roster. Operator-written snapshots should use atomic replacement and least-privilege file permissions. Neither source writes to a native service.

No production instance configuration or credential is committed. Local browser fixtures use temporary synthetic files, subjects and native IDs.

## Checks

`node --test apps/auth/__tests__/media-identities.test.mjs` uses synthetic issuer subjects and native IDs with in-memory SQLite. `identity-onboarding.test.mjs` covers reviewed creation, separate recipient confirmation, scoped identity/recipient rechecks, concurrent confirmation, secret exclusion and blocked uncertain retries. The workspace check remains `npm run check --workspace @harrhy/auth`.

After the README's isolated `auth:real:init`, `auth:real:up` and `auth:real:seed`, run `node apps/auth/__tests__/native-invitation-contract.mjs` to exercise the pinned ZITADEL 4.20.0 native contract. It creates synthetic identities only on hard-coded loopback port 18887; no production settings are loaded. It proves `/v2/users/new` exact subject reservation (not `/v2/users`, which lists users), creation with no password and `returnCode` email handling, invitation proof verification/email verification, rejection of wrong/replayed invite and password-reset proofs, proof-bound first-password setup and native password-factor sign-in. Codes/passwords remain in memory. Operator and login-client credentials are separate. No SMTP delivery, browser callback, deployment credential authority or service provisioning is proven by this check.

The ignored mode-0600 `.local-real/invitation-contract.json` receipt records the reserved synthetic subject, current effect and completed checks, never secrets. A failed/interrupted run is uncertain and refuses automatic repetition; inspect and archive that receipt before intentionally starting another synthetic run. Synthetic users remain in the isolated provider database; do not interpret them as production migration candidates.
