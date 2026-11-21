#!/usr/bin/env python3
"""Build hall.wad from the existing CC0 Hall diffuse textures (needs ImageMagick 7)."""
from pathlib import Path
import struct
import subprocess

HERE = Path(__file__).resolve().parent
TEXTURES = HERE.parent / 'public' / 'textures'
SIZE = 128
MATERIALS = {
    'HALL_FLOOR': ('floor-wood', []),
    'HALL_BRICK': ('brick', []),
    'HALL_GREEN': ('green-wood', []),
    'HALL_TRIM': ('trim-wood', []),
    'HALL_DARK': ('trim-wood', ['-modulate', '72,78,100']),
    'HALL_CEILING': ('trim-wood', ['-modulate', '108,20,100']),
}


def texture(name, source, adjust):
    rgb = subprocess.check_output([
        'magick', str(TEXTURES / f'hall-{source}.webp'), '-resize', f'{SIZE}x{SIZE}!',
        *adjust, '+dither', '-colors', '256', '-depth', '8', 'rgb:-',
    ])
    pixels = list(zip(rgb[::3], rgb[1::3], rgb[2::3]))
    palette = {color: index for index, color in enumerate(dict.fromkeys(pixels))}
    if len(pixels) != SIZE * SIZE or len(palette) > 256:
        raise ValueError(f'Unexpected ImageMagick output for {name}')
    data = bytearray()
    offsets = []
    for step in (1, 2, 4, 8):
        offsets.append(40 + len(data))
        # Box-filter first, then fit the result to the shared WAD palette.
        for y in range(0, SIZE, step):
            for x in range(0, SIZE, step):
                if step == 1:
                    color = pixels[y * SIZE + x]
                else:
                    block = [pixels[(y + dy) * SIZE + x + dx]
                             for dy in range(step) for dx in range(step)]
                    mean = tuple(sum(channel) / len(block) for channel in zip(*block))
                    color = min(palette, key=lambda p: sum((a - b) ** 2 for a, b in zip(p, mean)))
                data.append(palette[color])
    colors = bytes(channel for color in palette for channel in color).ljust(768, b'\0')
    return (struct.pack('<16s6I', name, SIZE, SIZE, *offsets) + data
            + struct.pack('<H', 256) + colors + b'\0\0')


body = bytearray()
directory = bytearray()
for name, (source, adjust) in MATERIALS.items():
    encoded = name.encode('ascii')
    lump = texture(encoded, source, adjust)
    directory.extend(struct.pack('<IIIBBH16s', 12 + len(body), len(lump), len(lump),
                                 0x43, 0, 0, encoded))
    body.extend(lump)
(HERE / 'hall.wad').write_bytes(struct.pack('<4sII', b'WAD3', len(MATERIALS), 12 + len(body))
                               + body + directory)
