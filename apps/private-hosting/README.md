# Private Hosting

A Linux supervisor for operator-registered HTTP apps, including an optional route-only Slides origin. SQLite owns desired state, and a dedicated Caddy instance serves only ready apps over a filesystem Unix socket. This is not a deployment API, a sandbox for untrusted code, or an authentication provider.

- [Daemon and local CLI](src/main.rs)
- [Go demo](demo/main.go)
- [Infra run and configuration contract](../../docs/private-hosting/operations.md)

Run `pnpm --filter @harrhy/private-hosting check` for synthetic tests. Set `HARRHY_PRIVATE_HOSTING_TEST_CADDY` to an absolute Caddy binary path to also run the real Caddy test (requires Go 1.22+).
