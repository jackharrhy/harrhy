# @harrhy/schmovement

GoldSrc-style character movement without a renderer, physics engine, or map format. World uses it for both authoritative simulation and client prediction. Worldview uses it through a BSP hull-trace adapter.

Call `moveGoldSrcPlayerWithSweep(sweep, previous, input, seconds, config)` once per fixed tick. Positions and velocities use Quake-family units (Z up); yaw is in radians. The host sweeps the standing hull between two centre positions and returns the travelled fraction, end position, solid flags and unit contact normal. Keep collision and tick timing consistent across prediction and authority. The core never reads input devices, time or network state.

`DEFAULT_GOLDSRC_MOVEMENT` preserves Worldview defaults. Hosts can opt into held-jump auto-bhop and tune movement without changing other consumers. See [J. W. Chong’s Half-Life movement notes](https://jwchong.com/hl/) for background.

Run `npm run check --workspace @harrhy/schmovement` from the repo root to compile the JS and declarations and run standalone tests. Publish this package before a renderer release that depends on it.
