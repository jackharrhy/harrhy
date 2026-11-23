# Optional p2 integrations

Base Pi does not discover this directory. Each integration is a separately installed trusted host plugin for a matching Pi build.

<!-- prettier-ignore -->
| Package | Facets | Documentation |
| --- | --- | --- |
| `local-inbox` | Server | [Pi Inbox setup and reusable agent prompt](../../../docs/pi-inbox.md) |
| `atlas-feedback` | Server | [Atlas feedback](atlas-feedback/README.md) |
| `github-checks` | Server, worker, web | [GitHub checks](github-checks/README.md) |
| `host-health` | Server | [Host health](host-health/README.md) |
| `peers` | Server, worker, web | [Peers](peers/README.md) |

Install only the wanted package as a real directory under `<P2_DATA_DIR>/plugins/`, not the enclosing directory or a symlink. An old built-in wins a name clash. Follow the individual guide and obtain separate authorization before modifying a running instance.

The legacy `ingress` package and scripts remain for compatibility with existing deployments and [historical receipt readback](../docs/ingress.md). Keep existing credentials, endpoints, event IDs and ledgers on their original path. Do not replay or move outstanding events into the Pi Inbox namespace. There is no automatic installation, forwarding, or data migration.
