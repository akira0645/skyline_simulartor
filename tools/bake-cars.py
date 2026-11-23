"""Bake sprite-stacked cars for PixiJS. Requires Pillow and NumPy.

Input: code-authored volume saved by draw-handmade.py as
docs/design-assets/car/hatchback-slices.png (24 layers). Four diagnostic views
are projected from that same volume; do not carve them back into a new volume.
Run: python tools/bake-cars.py
The game consumes only the baked atlas and JSON; Python is not a build dependency.
"""
from pathlib import Path
import json
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/design-assets/car/hatchback-slices.png'
OUTPUT = ROOT / 'src/assets/vehicles'
ART = ROOT / 'docs/design-assets/car'
COUNT, FRAME, DENSITY, DIRECTIONS = 24, 96, 4, 16
PIVOT = (48, 56)
COLOURS = ['5bb6ce', 'd87856', 'e6c15a', '8fbf6a', 'd6d9de',
           '2b2f3a', '8a1f2b', 'f4f6f8', 'f2c21f']
SIZES = [(10, 6), (12, 6), (13, 7)]


def colourise(volume, colour):
    result = volume.copy()
    target = np.array(tuple(bytes.fromhex(colour)), dtype=float)
    rgb = volume[..., :3].astype(float)
    r, g, b = np.moveaxis(rgb, -1, 0)
    body = (g > r + 12) & (g > b * 0.86) & (b > r + 4) & (volume[..., 3] > 0)
    # Preserve glass, rubber, headlamps and red tail lamps. Body shading survives recolouring.
    brightness = (0.21 * r + 0.72 * g + 0.07 * b) / 145
    shaded = target * np.minimum(brightness, 1)[..., None]
    highlight = np.clip((brightness - 1) * 0.55, 0, 0.55)[..., None]
    shaded = shaded * (1 - highlight) + 255 * highlight
    result[..., :3][body] = np.clip(shaded[body], 0, 255).astype(np.uint8)
    return result


def render(volume, heading, frame=None, pivot=None, squash=0.9, spacing=0.35):
    frame = FRAME if frame is None else frame
    pivot = PIVOT if pivot is None else pivot
    n, length, width = volume.shape[:3]
    yy, xx = np.mgrid[:frame, :frame]
    dx = xx - pivot[0]
    turn = heading - math.pi / 2  # The source car's nose points down.
    ca, sa = math.cos(turn), math.sin(turn)
    body = np.zeros((frame, frame, 4), dtype=np.uint8)

    def sample(z, offset_x=0, offset_y=0):
        dy = (yy - pivot[1] + round(z * spacing) - offset_y) / squash
        rx = dx - offset_x
        # Symmetric pivots; round half-up, not banker's rounding at half pixels.
        sx = np.floor(rx * ca + dy * sa + (width - 1) / 2 + 0.5).astype(int)
        sy = np.floor(-rx * sa + dy * ca + (length - 1) / 2 + 0.5).astype(int)
        valid = (sx >= 0) & (sx < width) & (sy >= 0) & (sy < length)
        return sx, sy, valid

    canvas = np.zeros_like(body)
    sx, sy, valid = sample(0, 2, 3)
    footprint = np.any(volume[..., 3] > 0, axis=0)
    vy, vx = np.nonzero(valid)
    hit = footprint[sy[vy, vx], sx[vy, vx]]
    canvas[vy[hit], vx[hit]] = (15, 22, 29, 55)
    for z in range(n):
        sx, sy, valid = sample(z)
        vy, vx = np.nonzero(valid)
        pixels = volume[z, sy[vy, vx], sx[vy, vx]]
        hit = pixels[:, 3] > 0
        body[vy[hit], vx[hit]] = pixels[hit]
    solid = body[..., 3] > 0
    pad = np.pad(solid, 1)
    ring = ~solid & (pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:])
    canvas[ring] = (30, 37, 47, 255)
    canvas[solid] = body[solid]
    assert not canvas[0, :, 3].any() and not canvas[-1, :, 3].any(), 'Vertical frame clipping'
    assert not canvas[:, 0, 3].any() and not canvas[:, -1, 3].any(), 'Horizontal frame clipping'
    return Image.fromarray(canvas)


def main():
    source = Image.open(SOURCE).convert('RGBA')
    assert source.width % COUNT == 0, f'Unexpected slice strip: {source.size}'
    width = source.width // COUNT
    slices = [source.crop((z * width, 0, (z + 1) * width, source.height)) for z in range(COUNT)]
    atlas = Image.new('RGBA', (FRAME * DIRECTIONS, FRAME * len(COLOURS) * len(SIZES)))
    for size, (length, width) in enumerate(SIZES):
        volume = np.stack([np.array(layer.resize((width * DENSITY, length * DENSITY), Image.Resampling.NEAREST)) for layer in slices])
        for variant, colour in enumerate(COLOURS):
            tinted = colourise(volume, colour)
            # Small physical details are in the stack, so every heading shares the same pivot.
            if variant == 8:
                roof = Image.fromarray(tinted[-1])
                d = ImageDraw.Draw(roof)
                cx, cy = roof.width // 2, roof.height // 2
                d.rectangle((cx - 5, cy - 2, cx + 4, cy + 1), fill='#25232b')
                d.rectangle((cx - 4, cy - 2, cx + 3, cy), fill='#fff2b3')
                tinted[-1] = np.array(roof)
            if size == 2:
                # Gold trim on the bonnet, below the glass and centred across the body.
                y = length * DENSITY - 7
                for x in range(width * DENSITY // 2 - 5, width * DENSITY // 2 + 5):
                    solid = np.flatnonzero(tinted[:, y, x, 3])
                    if solid.size:
                        tinted[solid[-1], y, x] = (224, 178, 62, 255)
            for direction in range(DIRECTIONS):
                atlas.paste(render(tinted, direction * math.tau / DIRECTIONS),
                            (direction * FRAME, (size * len(COLOURS) + variant) * FRAME))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    atlas.save(OUTPUT / 'cars.png', optimize=True)
    metadata = dict(artSource='code', frameSize=FRAME, directions=DIRECTIONS, density=DENSITY, pivot=list(PIVOT),
                    colours=COLOURS, sizes=[list(size) for size in SIZES])
    (OUTPUT / 'cars.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')

    # Contact sheet at actual game zooms, plus enlarged turntable angles for art inspection.
    preview = Image.new('RGB', (1080, 540), '#19252b')
    d = ImageDraw.Draw(preview)
    try:
        font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 22)
    except OSError:
        font = ImageFont.load_default()
    d.text((28, 18), 'CITY CARS / SPRITE STACKING', fill='#e2f0eb', font=font)
    for i, angle in enumerate([0, 2, 4, 6, 8, 10, 12, 14]):
        frame = atlas.crop((angle * FRAME, 0, (angle + 1) * FRAME, FRAME))
        frame = frame.resize((FRAME * 2, FRAME * 2), Image.Resampling.NEAREST)
        preview.paste(frame, (12 + (i % 4) * 268, 35 + (i // 4) * 150), frame)
        d.text((40 + (i % 4) * 268, 185 + (i // 4) * 150), f'{angle * 22.5:g} deg', fill='#90b8b3')
    for row, zoom in enumerate([1, 1.75, 3]):
        y = 360 + row * 55
        d.text((28, y + 10), f'In-game {zoom:g}x', fill='#e2f0eb')
        for variant in range(len(COLOURS)):
            frame = atlas.crop((0, variant * FRAME, FRAME, (variant + 1) * FRAME))
            dim = round(FRAME / DENSITY * zoom)
            frame = frame.resize((dim, dim), Image.Resampling.NEAREST)
            preview.paste(frame, (190 + variant * 92 - dim // 2, y + 25 - round(PIVOT[1] / DENSITY * zoom)), frame)
    preview.save(ART / 'cars-preview.png')
    print(f'Baked {DIRECTIONS * len(COLOURS) * len(SIZES)} frames to {OUTPUT / "cars.png"}')


if __name__ == '__main__':
    main()
