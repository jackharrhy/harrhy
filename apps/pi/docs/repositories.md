# Previews

Open **Views → Open plugin view → Previews** to see registered preview URLs. The pane requires a live owner connection. Its placement is device-local; it never creates a shared View or adds preview data to message context. The internal pane key remains `repositories` so existing placement still works.

The list reads existing p2 forwards, optional Infra leases and allowlisted private static routes, and explicit owner declarations. Records without a URL are omitted. Expired links remain visible but cannot be opened from the list. Unknown expiry is distinct from no expiry. Neither registration nor expiry says anything about whether the service is running or reachable.

**Refresh** rereads the metadata. If rereading fails, the pane reports the failure and keeps the last successful list, still applying expiry. There are no health checks, route changes, session or worktree scans, or worker starts.

## Existing metadata

The optional private `<P2_DATA_DIR>/work-context.json` keeps its existing format and needs no migration. An `infra` entry names the registry file and domain; optional `infra.routes` names a routes file and the router IDs to read. A static route must be a literal Host under that domain with a single `pitailnet` entrypoint and loopback HTTP(S) upstreams. Static routes have no expiry. The version-1 lease registry stores `expires_at` in epoch seconds.

A `previews` declaration supplies `id`, `name` and `url`. An exact normalized URL match keeps the provider's expiry and access metadata. For standalone declarations, `expiresAt` is in epoch milliseconds; use `nonExpiring: true` instead to mark a link with no expiry. Omitting both leaves expiry unknown. Legacy session, location, note and event fields are accepted but not displayed. URLs must be HTTP(S) and cannot contain credentials. Access labels describe the provider; the destination still enforces its own access policy.
