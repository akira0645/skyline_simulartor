"""Add half-world-pixel architectural details to the existing editable city art.

Run after tools/draw_tiles.py: python tools/detail-buildings.py
Preserves every original footprint, transparency, sign and city palette. Outputs 2x atlases;
roads/lots remain nearest-neighbour copies. Pillow and NumPy are authoring dependencies only.
"""
from collections import deque
from pathlib import Path
import json

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'src/assets'
DEST = ASSETS / 'buildings'
SCALE = 2


def components(mask):
    seen = np.zeros_like(mask)
    height, width = mask.shape
    for y in range(height):
        for x in range(width):
            if not mask[y, x] or seen[y, x]:
                continue
            queue = deque([(x, y)])
            seen[y, x] = True
            points = []
            while queue:
                px, py = queue.popleft()
                points.append((px, py))
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if 0 <= nx < width and 0 <= ny < height and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        queue.append((nx, ny))
            yield points


def tint(pixel, factor):
    return tuple(round(min(255, max(0, p * factor))) for p in pixel[:3]) + (int(pixel[3]),)


def details(image, kind, style):
    src = np.array(image)
    h, w = src.shape[:2]
    out = image.resize((w * SCALE, h * SCALE), Image.Resampling.NEAREST)
    draw = ImageDraw.Draw(out)
    rgb = src[..., :3].astype(int)
    r, g, b = np.moveaxis(rgb, -1, 0)
    opaque = src[..., 3] == 255
    glass = opaque & (b > r + 18) & (b > g + 8) & (g > 85) & (r < 190)

    # Refine existing glazing rather than placing windows where the source has none.
    for group in components(glass):
        xs, ys = zip(*group)
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        width, height = x1 - x0 + 1, y1 - y0 + 1
        if len(group) < 3 or width < 2 or height < 2 or width > 12 or height > 12:
            continue
        # Only rectangular panels; irregular coloured symbols must retain their shape.
        if len(group) < width * height * 0.8:
            continue
        box = (x0 * SCALE, y0 * SCALE, (x1 + 1) * SCALE - 1, (y1 + 1) * SCALE - 1)
        draw.rectangle(box, outline='#345267')
        draw.line((box[0] + 1, box[1] + 1, box[2] - 1, box[1] + 1), fill='#d6eef0')
        if width >= 4:
            xx = (x0 + x1 + 1) * SCALE // 2
            draw.line((xx, box[1] + 1, xx, box[3] - 1), fill='#638294')
        # A small sill shadow grounds the glazing without expanding its silhouette.
        draw.line((box[0], box[3], box[2], box[3]), fill='#48616c')

    # Tile seams in pitched roofs; staggered masonry on brick walls. Leave signs and edges alone.
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if not opaque[y - 1:y + 2, x - 1:x + 2].all() or glass[y, x]:
                continue
            pixel = src[y, x]
            patch = rgb[y - 1:y + 2, x - 1:x + 2]
            if np.max(np.abs(patch - rgb[y, x])) > 48:
                continue
            red_roof = int(pixel[0]) > int(pixel[1]) * 1.15 and int(pixel[0]) > int(pixel[2]) * 1.18
            if kind == 'pitched' and y < h * 0.58 and (red_roof or style == 'sf'):
                if y % 3 == 0:
                    draw.line((x * SCALE, y * SCALE + 1, x * SCALE + 1, y * SCALE + 1), fill=tint(pixel, 0.86))
                elif (x + (y // 3 % 2) * 2) % 4 == 0:
                    draw.point((x * SCALE, y * SCALE), fill=tint(pixel, 1.08))
            elif style == 'newyork' and y > h * 0.3 and red_roof:
                if y % 3 == 0:
                    draw.line((x * SCALE, y * SCALE + 1, x * SCALE + 1, y * SCALE + 1), fill=tint(pixel, 0.86))
                elif (x + y // 3 * 2) % 5 == 0:
                    draw.line((x * SCALE, y * SCALE, x * SCALE, y * SCALE + 1), fill=tint(pixel, 0.9))
            elif kind == 'industrial' and y < h * 0.65 and int(pixel[:3].max()) - int(pixel[:3].min()) < 55:
                if x % 3 == 1:
                    draw.line((x * SCALE, y * SCALE, x * SCALE, y * SCALE + 1), fill=tint(pixel, 0.85))
                elif x % 7 == 0 and y % 5 == 0:
                    draw.point((x * SCALE + 1, y * SCALE + 1), fill=tint(pixel, 1.15))

    # Ventilation only on flat roofs, selected from an empty, solid roof patch.
    if kind in ('flat', 'industrial', 'large'):
        candidates = []
        for y in range(2, max(3, int(h * 0.3) - 3)):
            for x in range(3, w - 7):
                patch = src[y:y + 4, x:x + 6]
                if not (patch[..., 3] == 255).all():
                    continue
                # Keep crosses, greenery, signs and existing roof fittings intact.
                variance = float(np.std(patch[..., :3].reshape(-1, 3), axis=0).max())
                mean = patch[..., :3].mean(axis=(0, 1))
                if variance < 17 and mean.max() - mean.min() < 65 and mean.mean() > 65:
                    score = variance + abs(x - w * 0.66) + abs(y - h * 0.15)
                    candidates.append((score, x, y))
        if candidates:
            _, x, y = min(candidates)
            x, y = x * SCALE, y * SCALE
            draw.rectangle((x + 1, y + 2, x + 11, y + 7), fill='#49535a')
            draw.rectangle((x, y, x + 10, y + 5), fill='#a2adb0', outline='#596770')
            draw.line((x + 1, y + 1, x + 9, y + 1), fill='#dce3df')
            for xx in range(x + 2, x + 9, 2):
                draw.line((xx, y + 2, xx, y + 4), fill='#536872')

    # Small timber doors gain a handle and panel joint, without modifying brownstone facades.
    timber = opaque & (r > g * 1.2) & (g > b * 1.12) & (r < 175) & (g > 45)
    for group in components(timber):
        xs, ys = zip(*group)
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        if x1 - x0 < 1 or x1 - x0 > 4 or y1 - y0 < 3 or y1 - y0 > 9 or y0 < h * 0.5:
            continue
        draw.point(((x1 + 1) * SCALE - 2, (y0 + y1) * SCALE // 2), fill='#e7c47b')
        draw.line((x0 * SCALE + 1, (y1 + 1) * SCALE - 2, (x1 + 1) * SCALE - 2, (y1 + 1) * SCALE - 2), fill='#b59062')

    # Authoring invariant: adding detail never erases or expands the original silhouette/shadow.
    alpha = np.repeat(np.repeat(src[..., 3], SCALE, axis=0), SCALE, axis=1)
    result = np.array(out)
    result[..., 3] = alpha
    return Image.fromarray(result)


def frames():
    for row in (2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14):
        for col in range(16):
            kind = 'pitched' if row == 8 or row == 2 and col in (0, 1, 2, 10) else 'flat'
            if row in (4, 11, 12, 13):
                kind = 'industrial'
            if row == 5 and col in (1, 4, 6, 7, 8, 9, 10, 12, 14):
                kind = 'civic'  # Water tower, school, station, market, temple, parking and pool.
            if row == 14 and col in (4, 8, 9, 10, 11):
                kind = 'civic'
            yield col * 32, row * 32, 32, kind
    for col in range(8):
        yield col * 64, 6 * 32, 64, 'large' if col != 4 else 'civic'  # Stadium stays open.
    for col in range(3):
        yield col * 64, 15 * 32, 64, 'large'


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    count = 0
    for style in ('classic', 'sf', 'california', 'newyork'):
        name = 'city' if style == 'classic' else f'city-{style}'
        source = Image.open(ASSETS / f'{name}.png').convert('RGBA')
        output = source.resize((source.width * SCALE, source.height * SCALE), Image.Resampling.NEAREST)
        for x, y, size, kind in frames():
            tile = source.crop((x, y, x + size, y + size))
            if not tile.getbbox():
                continue
            output.paste(details(tile, kind, style), (x * SCALE, y * SCALE))
            count += 1
        assert np.array_equal(np.array(output)[..., 3], np.repeat(np.repeat(np.array(source)[..., 3], SCALE, axis=0), SCALE, axis=1))
        output.save(DEST / f'{name}-detail.png', optimize=True)
        print(f'Wrote {name}-detail.png ({output.width}x{output.height})')
    (DEST / 'atlas.json').write_text(json.dumps(dict(density=SCALE, tileSize=32 * SCALE), indent=2) + '\n', encoding='utf-8')
    # Compare the same house, office, factory and civic frame at the game's maximum zoom.
    samples = [('House', 0, 2), ('Shop', 0, 3), ('Factory', 0, 4), ('School', 4, 5), ('Bakery', 13, 14)]
    preview = Image.new('RGB', (1200, 840), '#1a272b')
    d = ImageDraw.Draw(preview)
    try:
        font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 21)
    except OSError:
        font = ImageFont.load_default()
    d.text((24, 15), 'ARCHITECTURE / ORIGINAL  vs  CLOSE-UP', font=font, fill='#e2f0eb')
    for style_index, style in enumerate(('classic', 'sf', 'california', 'newyork')):
        name = 'city' if style == 'classic' else f'city-{style}'
        old = Image.open(ASSETS / f'{name}.png')
        new = Image.open(DEST / f'{name}-detail.png')
        y = 60 + style_index * 192
        d.text((24, y), style.upper(), font=font, fill='#97c4b9')
        for i, (label, x, row) in enumerate(samples):
            left = 24 + i * 235
            for j, (sheet, scale) in enumerate(((old, 1), (new, SCALE))):
                tile = sheet.crop((x * 32 * scale, row * 32 * scale, (x + 1) * 32 * scale, (row + 1) * 32 * scale))
                tile = tile.resize((96, 96), Image.Resampling.NEAREST)
                preview.paste(tile, (left + j * 106, y + 35), tile)
            d.text((left, y + 140), label, fill='#c8d5d1')
    preview.save(ROOT / 'docs/design-assets/car/buildings-preview.png')
    print(f'Detailed {count} occupied building frames across four city styles')


if __name__ == '__main__':
    main()
