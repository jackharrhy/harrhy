# Runtime and deployment

One container and Node process serve all sites. Each site has its own database and upload tree, so it can be backed up and restored separately. A process restart or failure affects every site, and code in that process shares a security boundary.

Each `apps/cms/sites/<id>/site.json` sets the site's name, canonical origin, aliases, preview status, and optional features. An ignored `site.local.json` beside it can override those settings locally or for a deployment. The optional operator dashboard uses process-level `HARRHY_CMS_OPERATOR_ORIGIN`. The server finds site folders at startup; each needs a manifest and `app/site.ts` presentation.

## Local Docker stack

From the repo root:

```sh
docker compose up --build -d
```

Root [`compose.yml`](../../compose.yml) runs Traefik and CMS. Open `http://andrew.localhost` or `http://luke.localhost`. Traefik binds port 80 on loopback and forwards to CMS port 4351 over the Compose network. CMS publishes no host port. The `cms-data` volume persists data between runs; the separate `cms-backups` volume
holds optional app-owned recovery snapshots at `/app/backups`.

`docker compose down` stops the stack and keeps the volume.

Compose mounts inline `site.local.json` overrides for the `.localhost` hosts; tracked manifests stay as they are. The image runs as Node user UID 1000, so bind-mounted data must be writable by that user. Production routing, TLS, DNS, secrets and persistent mount selection belong in the
infrastructure repo. TeaCMS owns its optional snapshot schedule, retention and status;
Infra owns off-host replication and the tested transition from its old cron.

## Traefik

Compose labels give each site an HTTP router pointing to the same CMS service. Keep the labels and inline local origins in sync. Traefik forwards the original Host; TeaCMS selects the site and redirects aliases. Unknown hosts get 404.

The local stack does not enable the optional operator dashboard. If you set `HARRHY_CMS_OPERATOR_ORIGIN`, add a Traefik router label for that host. The dashboard handles authenticated site entry, health, and metadata. It does not provision domains, change DNS, or access the Docker socket.

References: [Traefik Docker routing](https://doc.traefik.io/traefik/reference/routing-configuration/other-providers/docker/), [HTTP routers](https://doc.traefik.io/traefik/reference/routing-configuration/http/routing/router/).

## Mug preview deployment

The [Publish CMS workflow](../../.github/workflows/publish-cms.yml) runs when a push to `main` changes `apps/cms`, its shared packages, or the image build inputs. It checks the CMS and publishes `ghcr.io/jackharrhy/teacms:latest` and a commit tag. A manual run from `main` is also available:

```sh
gh workflow run publish-cms.yml --ref main
```

Mug's `teacms` Compose service uses `:latest`, and Watchtower pulls new images from private GHCR using its mounted Docker registry credentials. The existing `/app/data` mount holds the Andrew and Luke preview content and operator account. Watchtower recreates only the CMS container when a new image is published; check all three preview hosts after a rollout. For rollback, set the service image to a known commit tag or digest in infra and run `infra refresh mug --service teacms`. Andrew's production website uses a different Compose service and is outside this rollout.

## Health and backups

`GET /healthz` checks the selected site's database. Monitor each site:

```sh
curl http://andrew.localhost/healthz
```

Do not copy a live WAL-mode `tea.db` alone. The optional app-owned scheduler uses
SQLite backup plus every site's uploads/public and the operator DB, verifies completion,
and retains seven daily generations. See [backups](BACKUPS.md) for explicit mount/config,
actual per-database consistency, status, offline restore and cron retirement gates.
Keep off-host copies and test restores. Standalone Andrew remains outside this app.

`data/operator/operator.db` holds operator password hashes, reviewed identity links, sessions, and site-entry tickets. Restore the reviewed existing account from its verified backup; do not replace its identity by guessing an email or reseeding an operator.

Each site's stores scope sessions, rate limits, and file lookups. Cookies include the site ID because browser cookies do not isolate ports on one hostname. Editors sign in separately. The operator database holds its credentials, sessions, and one-time entry tickets; operator sign-out invalidates operator-issued site sessions. `apps/cms/__tests__/tenants.test.ts` and `apps/cms/__tests__/operator.test.ts` test the main isolation boundaries of the shared server.

## Initial owner-only Auth cutover

Auth mode intentionally replaces **all** tenant and operator password forms with
Auth sign-in. Preserve existing user rows, content, uploads, revisions and identity
links; the initial reviewed manifest links only the existing operator. No Luke/Andrew
Auth accounts, invitations or grants are part of this operation.

Infra owns the bounded Watchtower/image selection, private configuration and recovery
receipts. Before activation, retain a fresh verified native SQLite-and-media snapshot
and matching-image offline restore/readback. Deploy the checked Auth UI image with
CMS still held; its `allowedUserIds` guard must be present before release. Preserve the
current Ref preview registry overlay and all unrelated application policy. Source CMS
policy remains `authorizationHold: true, allowedUserIds: []`; activation selects a
reviewed private registry with only CMS hold false and the exact owner ID allowed.

### Schema initialization without starting a server

Stop CMS before modifying links. Use the exact checked new CMS image, its existing
reviewed site manifests, data mount and `HARRHY_CMS_OPERATOR_ORIGIN`; do not start the normal
server or create replacement databases. From `/app/apps/cms`, this recipe checks every
configured database exists as a regular file **before** opening any for migration:

```sh
node --import remix/node-tsx --input-type=module <<'NODE'
import { lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadSites, parseOperatorOrigin } from './config.ts';
import { openDatabase } from './app/data/database.ts';
import { createOperatorStore } from './operator/store.ts';

const sites = await loadSites();
if (!parseOperatorOrigin(process.env.HARRHY_CMS_OPERATOR_ORIGIN, sites))
  throw new Error('The reviewed operator origin is required');
const root = resolve(process.env.HARRHY_CMS_DATA_DIR ?? 'data');
const sitePaths = sites.map(site => join(root, site.id, 'tea.db'));
const operatorPath = join(root, 'operator', 'operator.db');
for (const path of [...sitePaths, operatorPath])
  if (!(await lstat(path)).isFile())
    throw new Error('An existing regular database is required');
for (const path of sitePaths) {
  const { sqlite } = await openDatabase(path);
  sqlite.close();
}
createOperatorStore(operatorPath, false).close();
console.log('Existing site and operator schemas initialized');
NODE
```

These are the same migration and operator-schema APIs used at normal startup, without
`createApp`, a listener, seed users or identity-provider calls. The additive issuer
migration adds nullable `auth_issuer` to users and sessions; it does not adopt any old
subject-only link. Inspect every database's resulting schema before proceeding.

Use the private issuer-bearing link manifest and dry-run/apply commands in the
[CMS guide](../../apps/cms/README.md#auth-transition). The initial manifest has
one reviewed stable operator row ID and empty `andrew`/`luke` arrays. Migration and
linking are transactional **per database**, not one cross-database transaction. On
failure stop, inspect all databases and receipts, and only then resume an idempotent
retry; do not assume earlier databases rolled back. Verify exactly the reviewed
operator issuer/subject was linked and every tenant user row stayed unchanged.

Configure the pinned issuer/owner subject and existing public clients before starting
Auth-enabled CMS; verify registered-host public health and the sign-in redirect on all
three hosts. Release the CMS registry hold only with the checked owner-only list.
Acceptance needs the owner's actual fresh sign-in and entry to both tenant editors;
synthetic tests do not establish production acceptance. Keep the prior image, full
configuration/registry overlay and snapshot for rollback as described in the CMS guide.

## Scope of this repository

This repo has the shared CMS, optional features, two site presentations, tenant dispatcher, analytics settings, operator dashboard, and deployment examples. Automated domain provisioning remains future work. VPS configuration, DNS, and production services live elsewhere.
