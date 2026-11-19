# Optional p2 integrations

Base p2 does not discover this directory. Each subdirectory is a separately installable source package for a p2 build from the matching revision. Neither package requires the other. These are trusted host plugins, not sandboxed add-ons.

| Package | Facets | Documentation |
| --- | --- | --- |
| `atlas-feedback` | Server | [Atlas feedback](atlas-feedback/README.md) |
| `ingress` | Server and worker | [Hermes ingress](../docs/ingress.md) |

## Operator cutover from built-ins

1. Stage the matching base and integration packages for a maintenance window. Pause new sends; keep uncertain sends frozen with their original IDs, targets and content.
2. Stop the old base. Copy each wanted package as a real directory directly under the existing `<P2_DATA_DIR>/plugins/` (for example `<P2_DATA_DIR>/plugins/ingress/worker.ts`). Do not copy the enclosing `integrations/` directory or use symlinks. Start the matching base with neither adapter in its built-in root. An old built-in wins a name clash; installing the user package does not replace it in place.
3. Keep the same data directory, bearer configuration, endpoints and ledgers. Confirm Atlas targets/source registration and old-binding receipt readback, and Hermes receipt readback through its worker facet, before resuming sends. Use existing IDs and identical payloads for retries. Keep the old Hermes return helper through a bidirectional canary.
4. To roll back to a base that supplies the adapters, stop the new base and remove the duplicate user-plugin directories before starting the old one against the **current** stores. Do not restore old ledger snapshots or mint replacement event IDs.

There is no automatic installation or data migration. A bare base start registers neither adapter. The integration tests copy these packages into a disposable actual user-plugin root, use the fake model and exercise unchanged receipt and permission behavior.
