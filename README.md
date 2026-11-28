# Harrhy

A monorepo for personal apps and packages: Remix 3 web apps and native tools.

[Development guide](docs/development.md) · [Project docs](docs/) · [Contributor guidance](AGENTS.md)

### Apps

<!-- prettier-ignore -->
| Workspace | What it runs | Guide |
| --- | --- | --- |
| [`@harrhy/8mb`](apps/8mb/) | Browser video compression and opt-in aggregate diagnostics | [README](apps/8mb/README.md) |
| [`@harrhy/slides`](apps/slides/) | Synchronized talk deck with presenter sign-in | [README](apps/slides/README.md) |
| [`@harrhy/pi`](apps/pi/) | Faithful P2 React/Chord v0 review import; no live cutover | [README](apps/pi/README.md) |
| [`@harrhy/clank`](apps/clank/) | Live session catalog for a disposable Pi fixture | [README](apps/clank/README.md) |
| [`@harrhy/atlas`](apps/atlas/) | Private agent-owned Markdown spaces and trusted page widgets | [README](apps/atlas/README.md) |
| [`@harrhy/private-hosting`](apps/private-hosting/) | Local supervisor for private Atlas and a temporary Go demo | [README](apps/private-hosting/README.md) |
| [`@harrhy/ui-app`](apps/ui/) | Internal component showcase, theme comparisons and synthetic Auth/Ref patterns | [README](apps/ui/README.md) |
| [`@harrhy/auth`](apps/auth/) | Jack Auth browser login, consent, directory, and access management | [README](apps/auth/README.md) |
| [`@harrhy/artbin-app`](apps/artbin/) | Game asset archive, uploads, previews, and API | [README](apps/artbin/README.md) |
| [`@harrhy/artbin`](apps/artbin-cli/) | Game asset command-line client | [README](apps/artbin-cli/README.md) |
| [`@harrhy/burger`](apps/burger/) | Remix game UI and authoritative Bun world server | [README](apps/burger/README.md) |
| [`@harrhy/cms`](apps/cms/) | Multi-site CMS, operator dashboard, and Node host | [README](apps/cms/README.md) |
| [`@harrhy/cms-edge`](apps/cms-edge/) | Cloudflare Worker CMS backed by D1 and R2 | [README](apps/cms-edge/README.md) |
| [`@harrhy/dirstat`](apps/dirstat/) | Read-only synthetic disk usage preview on Celld | [README](apps/dirstat/README.md) |
| [`@harrhy/4orm`](apps/4orm/) | Isolated native 4orm community candidate on Celld | [README](apps/4orm/README.md) |
| [`@harrhy/harry-sluggers`](apps/harry-sluggers/) | Read-only historical Sluggers league website over PostgreSQL | [README](apps/harry-sluggers/README.md) |
| [`@harrhy/garden`](apps/garden/) | Obsidian-backed personal website and publishing tools | [README](apps/garden/README.md) |
| [`@harrhy/gurgur`](apps/gurgur/) | WebGPU world and Bun authoritative game server | [README](apps/gurgur/README.md) |
| [`@harrhy/img`](apps/img/) | Native Rust/Rune image and GIF operation editor | [README](apps/img/README.md) |
| [`@harrhy/letters-to-steve`](apps/letters-to-steve/) | Private correspondence and editorial publishing for Steve | [README](apps/letters-to-steve/README.md) |
| [`@harrhy/lists`](apps/lists/) | Mailing lists, campaigns, delivery, and inbound mail | [README](apps/lists/README.md) |
| [`@harrhy/worldview`](apps/worldview/) | Worldview BSP viewer and map editor | [README](apps/worldview/README.md) |
| [`@harrhy/marky`](apps/marky/) | Collaborative Markdown editor with Jack Auth access | [README](apps/marky/README.md) |
| [`@harrhy/pool-app`](apps/pool/) | Remix pool hall and authoritative Bun game server | [README](apps/pool/README.md) |
| [`@harrhy/world`](apps/world/) | Private multiplayer hall walk-through | [README](apps/world/README.md) |
| [`@harrhy/maps-collaboration`](apps/maps-collaboration/) | Live map sessions and SQLite map cells | [README](apps/maps-collaboration/README.md) |
| [`@harrhy/maps-compiler`](apps/maps-compiler/) | Local native map compiler helper | [README](apps/maps-compiler/README.md) |
| [`@harrhy/maps-service`](apps/maps-service/) | Hosted map projects and API | [README](apps/maps-service/README.md) |
| [`@harrhy/ref`](apps/ref/) | Private image and link boards on a Worker and Celld | [README](apps/ref/README.md) |
| [`@harrhy/review`](apps/review/) | Loopback Git diff inbox with durable inline comments | [README](apps/review/README.md) |
| [`@harrhy/rotund`](apps/rotund/) | Personal service directory with Jack Auth entitlements | [README](apps/rotund/README.md) |
| [`@harrhy/radio`](apps/radio/) | Synchronized listening rooms on a Worker and Celld | [README](apps/radio/README.md) |

### Packages

<!-- prettier-ignore -->
| Workspace | What it provides | Guide |
| --- | --- | --- |
| [`@harrhy/artbin-core`](packages/artbin-core/) | Asset scanning, detection, and upload primitives | [README](packages/artbin-core/README.md) |
| [`@harrhy/artbin-ui`](packages/artbin-ui/) | CLI scan interface components | [README](packages/artbin-ui/README.md) |
| [`@harrhy/board`](packages/board/) | Local board camera, input and geometry | [README](packages/board/README.md) |
| [`@harrhy/burger-core`](packages/burger-core/) | Shared Burger ECS, physics, and wire constants | [README](packages/burger-core/README.md) |
| [`@harrhy/dev-auth`](packages/dev-auth/) | Disposable local Jack Auth protocol issuer for app development | [README](packages/dev-auth/README.md) |
| [`@harrhy/identity`](packages/identity/) | Jack Auth OIDC and API identity verification | [README](packages/identity/README.md) |
| [`@harrhy/gurgur-engine`](packages/gurgur-engine/) | Gurgur Box3D physics, protocol and world format | [README](packages/gurgur-engine/README.md) |
| [`@harrhy/gurgur-game`](packages/gurgur-game/) | Gurgur controllers, simulation and map compiler | [README](packages/gurgur-game/README.md) |
| [`@harrhy/json-schema`](packages/json-schema/) | Remix data schemas with JSON Schema descriptions | [README](packages/json-schema/README.md) |
| [`@harrhy/live-state`](packages/live-state/) | Scoped watches and acknowledged latest-state delivery | [README](packages/live-state/README.md) |
| [`@harrhy/logger`](packages/logger/) | Request and job logging primitives | [README](packages/logger/README.md) |
| [`@harrhy/maps-editor`](packages/maps-editor/) | Map document and source-rendering primitives | [README](packages/maps-editor/README.md) |
| [`@harrhy/maps-protocol`](packages/maps-protocol/) | Hosted and collaborative map schemas | [README](packages/maps-protocol/README.md) |
| [`@harrhy/schmovement`](packages/schmovement/) | GoldSrc-style movement over a host collision sweep | [README](packages/schmovement/README.md) |
| [`@harrhy/worldview-renderer`](packages/maps-renderer/) | Embeddable WebGPU map renderer and BSP core | [README](packages/maps-renderer/README.md) |
| [`@harrhy/webmcp`](packages/webmcp/) | Browser-native site tool registration and lifecycle | [README](packages/webmcp/README.md) |
| [`@harrhy/mcp`](packages/mcp/) | Official SDK HTTP MCP transport and typed tool bindings | [README](packages/mcp/README.md) |
| [`@harrhy/pool`](packages/pool/) | Shared pool rules, Box3D physics, and recordings | [README](packages/pool/README.md) |
| [`@harrhy/pool-protocol`](packages/pool-protocol/) | Versioned pool WebSocket messages | [README](packages/pool-protocol/README.md) |
| [`@harrhy/pool-simulation`](packages/pool-simulation/) | Hall movement and navigation | [README](packages/pool-simulation/README.md) |
| [`@harrhy/request-body`](packages/request-body/) | Bounded Web request-body reading | [README](packages/request-body/README.md) |
| [`@harrhy/result`](packages/result/) | Success and failure values and helpers | [README](packages/result/README.md) |
| [`@harrhy/rich-text`](packages/rich-text/) | Inline document format and rich text editor | [README](packages/rich-text/README.md) |
| [`@harrhy/ui`](packages/ui/) | Native Remix components, semantic themes and compatible Ref/Auth control styles | [README](packages/ui/README.md) |

### Experiments

<!-- prettier-ignore -->
| Workspace | What it tests | Guide |
| --- | --- | --- |
| `experiments/shared-workspace` | Synthetic multiplayer authorization, wire faults, and a disposable guest lab | [Shared workspace](experiments/shared-workspace/README.md) |
