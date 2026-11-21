# @harrhy/worldview-renderer

This package provides an embeddable WebGPU viewer and renderer-free BSP format core. It reads Quake BSP29, sanitized BSP2, GoldSrc BSP30, and Quake II BSP38 maps. The public entry points are `@harrhy/worldview-renderer`, `/core`, `/element`, `/runtime`, `/walkability`, and `/standalone`. The [viewer API guide](VIEWER_API.md) covers canvas setup and map assets. `src/core/` must stay free of DOM and WebGPU imports. This package never imports apps.

Use `raycastBspSurfaces` from `/core` to pick the nearest triangle from a caller-selected set of BSP faces. It accepts a unit direction and distances in BSP units, and returns a point and a normal facing the ray origin. It queries rendered triangles, not movement collision hulls.

The BSP movement adapter calls [`@harrhy/schmovement`](../schmovement/README.md) with the renderer’s BSP hull trace. The `/core` movement API and viewer defaults are unchanged. Publish the movement dependency before releasing a renderer version that uses it.

From the repo root, run `npm ci`, then `npm run check --workspace @harrhy/worldview-renderer`. The check typechecks, runs the renderer and format tests in `__tests__/`, and builds the importable bundles. `@harrhy/worldview` is its first consumer. Run `npm run test:embed --workspace @harrhy/worldview` for an independent browser host check of the packaged standalone element, pointer lock, and sound.

The [MIT license](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md) stay with the adapted source. No game assets are included. Worldview is the production host for this package.
