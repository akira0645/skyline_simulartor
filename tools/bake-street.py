"""Bake the approved representative street assets. Python/Pillow/NumPy authoring only.

python tools/bake-street.py
All sources are code-authored by tools/draw-handmade.py. Existing game art is
retained: this produces a separate, small prototype atlas, not four enlarged full city atlases.
"""
import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/design-assets/street'
OUT = ROOT / 'src/assets/street'
BUILDINGS = ['house', 'apartment', 'shop', 'office', 'factory', 'school', 'power', 'water', 'fire', 'police', 'clinic', 'warehouse']
PEOPLE_COLOURS = ['7edbed', 'f6ba67', 'e8799a', '8fbf6a', 'd6d9de']
TRUCK_COLOURS = ['e5484d', '3b82f6', 'f2c94c', 'a56eff', 'ff8a3d', '2ec4b6', 'ec4899', '84cc16']


def source(name):
    image = Image.open(SOURCE / f'{name}-source.png').convert('RGBA')
    data = np.array(image)
    assert set(np.unique(data[..., 3])).issubset({0, 255}), f'Non-pixel alpha in {name}'
    return Image.fromarray(data)


def restyle(image, style):
    if style == 'classic':
        return image
    data = np.array(image)
    rgb = data[..., :3].astype(float)
    r, g, b = np.moveaxis(rgb, -1, 0)
    # Architectural masonry/plaster only: preserve glass, foliage, metal and dark recesses.
    walls = (r > b * 1.12) & (r > g * 1.03) & (g > 75) & (r > 115) & (data[..., 3] > 0)
    # Retain medical signs, flowers, police badges and safety markings in every city palette.
    for colour in ['97586d', 'd89a91', 'e2bb71']:
        walls &= ~np.all(data[..., :3] == np.array(list(bytes.fromhex(colour))), axis=-1)
    light = (r * 0.26 + g * 0.62 + b * 0.12) / 200
    target = np.array({'sf': [205, 185, 203], 'california': [232, 217, 180], 'newyork': [165, 108, 86]}[style])
    tinted = np.clip(target * light[..., None], 0, 255)
    data[..., :3][walls] = tinted[walls].astype(np.uint8)
    return Image.fromarray(data)


def buildings():
    frames = [source(name).resize((128, 128), Image.Resampling.NEAREST) for name in BUILDINGS]
    for style in ['classic', 'sf', 'california', 'newyork']:
        atlas = Image.new('RGBA', (128 * len(frames), 128))
        for i, frame in enumerate(frames):
            atlas.paste(restyle(frame, style), (i * 128, 0))
        atlas.save(OUT / f'buildings-{style}.png', optimize=True)
    # A readable 6x art-pixel contact sheet, using the exact normalized game sprites.
    preview = Image.new('RGB', (1440, 310 * ((len(BUILDINGS) + 5) // 6)), '#1b2b2b')
    draw = ImageDraw.Draw(preview)
    for i, (name, frame) in enumerate(zip(BUILDINGS, frames)):
        frame = frame.resize((216, 216), Image.Resampling.NEAREST)
        x, y = (i % 6) * 240, (i // 6) * 310
        preview.paste(frame, (12 + x, 24 + y), frame)
        draw.text((20 + x, 265 + y), name.upper(), fill='#e0e8db')
    preview.save(SOURCE / 'buildings-contact.png')


def actors():
    tree = source('tree').resize((128, 256), Image.Resampling.NEAREST)
    tree.save(OUT / 'tree.png', optimize=True)
    sheet = source('people')
    frames = []
    poses = 7
    assert sheet.size == (128, 48 * poses), sheet.size
    for row in range(poses):
        for column in range(4):
            frames.append(sheet.crop((column * 32, row * 48, (column + 1) * 32, (row + 1) * 48)))
    atlas = Image.new('RGBA', (4 * 32, poses * len(PEOPLE_COLOURS) * 48))
    for colour, hex_colour in enumerate(PEOPLE_COLOURS):
        target = np.array(list(bytes.fromhex(hex_colour)), dtype=float)
        for i, frame in enumerate(frames):
            data = np.array(frame)
            rgb = data[..., :3].astype(float)
            r, g, b = np.moveaxis(rgb, -1, 0)
            clothes = (b > r * 1.2) & (g > r * 1.1) & (b > 65) & (data[..., 3] > 0)
            value = np.maximum(g, b) / 175
            tinted = np.clip(target * value[..., None], 0, 255)
            data[..., :3][clothes] = tinted[clothes].astype(np.uint8)
            atlas.paste(Image.fromarray(data), ((i % 4) * 32, (colour * poses + i // 4) * 48))
    atlas.save(OUT / 'people.png', optimize=True)


def trucks():
    path = ROOT / 'tools/bake-cars.py'
    spec = importlib.util.spec_from_file_location('bake_cars', path)
    baker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(baker)
    strip = Image.open(SOURCE / 'truck-slices.png').convert('RGBA')
    count = 28
    assert strip.width % count == 0
    sw = strip.width // count
    volume = np.stack([np.array(strip.crop((z * sw, 0, (z + 1) * sw, strip.height)).resize((28, 64), Image.Resampling.NEAREST)) for z in range(count)])
    atlas = Image.new('RGBA', (16 * 96, len(TRUCK_COLOURS) * 96))
    for row, colour in enumerate(TRUCK_COLOURS):
        tinted = baker.colourise(volume, colour)
        for direction in range(16):
            atlas.paste(baker.render(tinted, direction * np.pi / 8), (direction * 96, row * 96))
    atlas.save(OUT / 'truck.png', optimize=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    buildings()
    if (SOURCE / 'people-source.png').exists() and (SOURCE / 'tree-source.png').exists():
        actors()
    if (SOURCE / 'truck-slices.png').exists():
        trucks()
    metadata = dict(artSource='code', density=4, buildingFrame=128, buildings=BUILDINGS, treeFrame=[128, 256], personPoses=7,
                    personFrame=[32, 48], personPivot=[16, 24], personColours=PEOPLE_COLOURS,
                    truckFrame=96, truckPivot=[48, 56], truckColours=TRUCK_COLOURS)
    (OUT / 'atlas.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    print(f'Baked representative street assets to {OUT}')


if __name__ == '__main__':
    main()
