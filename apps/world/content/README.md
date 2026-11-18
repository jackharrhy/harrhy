# Editing the Hall

`hall.map` is the editable GoldSrc Valve 220 source. It contains the Pool hall envelope, paneling, bar, three stools and the west surf ramp, with a solid ceiling added at the original wall tops to seal the map. It also defines the default spawn and eleven baked point lights. `hall.wad` is the editor/build material library; the six used miptextures are embedded in `hall.bsp`. Serve only the compiled BSP at `/maps/hall.bsp`; no external WAD or lightmap is needed.

## Worldview

In Worldview choose Open project, select this `content/` directory, and open `hall.map`. The manifest mounts `hall.wad` and the entity definitions. Use the script below to build the lightmapped BSP.

### Preview the pool table

The `world_pool_table` point in `hall.map` places the runtime table: `id` is `hall-table`, `origin` is the floor center at `80 0 0` (World X 0, Y 0, Z −1⅓ m), and `angle` is `0` (long axis along map X / World Z).

1. With `hall.map` open in the editor's source view, go to **Map → References → Load .map** and choose [`apps/world/editor/hall-table-proxy.map`](../editor/hall-table-proxy.map).
2. In the reference row, replace the default offset with **X 80, Y 0, Z 0**. The proxy's floor center is at its local origin, so the offset should match the point entity's `origin`.
3. Use the row's checkbox to hide the preview or **Remove** to unload it.

The proxy shows the cabinet, bed, rails, and legs with a footprint of about 1.56 × 2.8 m. It's a read-only editor overlay: don't paste it into `hall.map` or compile it. If you move the table, update the reference offset manually; if you change its yaw, rotate the proxy geometry separately because reference offsets only translate.

## TrenchBroom

Copy the whole `trenchbroom/World Hall/` folder into TrenchBroom's user `games` directory (`~/.TrenchBroom/games/` on Linux) and restart TrenchBroom. Set the **World Hall** game path to this `content/` directory, then open `hall.map`. If needed, add `hall.wad` in the map's material collections panel. Keep the worldspawn `wad` key relative (`hall.wad`) when saving. Alternatively, use a GoldSrc editor configured for Half-Life/Valve 220 and add `Hall.fgd` and `hall.wad` to its project settings. The custom TrenchBroom config was not GUI-tested.

## Rebuild

```sh
# Run from the repository root. Override the default tools directory if needed.
HARRHY_WORLD_ERICW_TOOLS=/path/to/ericw-tools apps/world/content/build-hall.sh

# Only needed if regenerating the materials (Python 3 and ImageMagick 7):
python3 apps/world/content/make-wad.py
```

The build uses ericw-tools 2.0.0-alpha11 (`qbsp -hlbsp -leaktest`, `vis`, `light -extra`). It compiles in a temporary directory and only publishes the BSP after checking for a seal, GoldSrc format, visibility and baked light data. Two consecutive single-threaded builds produced the same bytes. The BSP header is version 30; the output contains 922 faces, six embedded textures, 117,960 bytes of RGB lighting and 5,216 bytes of visibility. The compiler also emits an unused `skip` texture slot with offset `-1`; no face references it.

## Coordinates and materials

- Map `(x, y, z) = (-worldZ × 60, -worldX × 60, worldY × 60)`. Inverse World `(x, y, z) = (-mapY, mapZ, -mapX) / 60`.
- Nominal footprint is 12 × 14.8 m in World X/Z. Inner brick faces are at World X ±5.875 m and World Z ±7.275 m (map X ±436.5, map Y ±352.5). Floor and ceiling surfaces are at World Y 0 and 21.85 m (map Z 0 and 1311).
- The ramp runs along World Z −4 to 0 m, with a 2.5 m high edge at X −5.15 m and its toe at X −3.65 m. Its map bounds are X 0–240, Y 219–309, Z 0–150. The authored spawn is map `(-366, 0, 54)`.
- The WAD uses 128×128 paletted miptextures derived from the existing Hall WebPs, no Valve assets. Brick is from [Poly Haven Brick Wall 001](https://polyhaven.com/a/brick_wall_001) (Dimitrios Savva and Rob Tuytel); all wood variants are from [Poly Haven Wood Table 001](https://polyhaven.com/a/wood_table_001) (Dimitrios Savva and Rico Cilliers). Both are [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); see [source and derivative details](../public/textures/HALL-SOURCES.txt).
