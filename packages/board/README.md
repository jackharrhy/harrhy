# @harrhy/board

Ref and Clank share a local HTML world with an origin at its top-left. `@harrhy/board/viewport` attaches a camera to an existing viewport/world pair; it normalizes wheel and Safari gesture input, keeps zoom anchored and batches transform writes per animation frame. Pass a signal for a removable view. The host decides which pointer gesture starts a pan or edits a node.

`@harrhy/board/geometry` fits axis-aligned boxes, positions HTML nodes and draws cubic SVG connectors between explicit world-space anchors. The app supplies node contents, relationships and actions. Nothing here opens a socket, reads storage or decides who can see a node.

Run `pnpm --filter @harrhy/board check`.
