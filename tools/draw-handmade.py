"""Author all representative city art from integer pixels, never an image model.

python tools/draw-handmade.py [--skill-dir PATH]
Writes editable pixel-art-studio JSON specs and renders them using that skill's renderer.
Buildings deliberately use a 64px native grid: authored clusters remain visible when zoomed.
"""
import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'docs/design-assets/handmade'
STREET = ROOT / 'docs/design-assets/street'
CAR = ROOT / 'docs/design-assets/car'
P = {
    'ink': '#29323d', 'deep': '#3c4656',
    'wall0': '#a38d83', 'wall1': '#c6ad91', 'wall2': '#e1caa5', 'wall3': '#efdfbb',
    'tile0': '#68424a', 'tile1': '#92514e', 'tile2': '#bc7058', 'tile3': '#dda578',
    'wood0': '#4b3b39', 'wood1': '#785442', 'wood2': '#a77d50', 'wood3': '#c5a16c',
    'glass0': '#2e475b', 'glass1': '#4d758c', 'glass2': '#80aaa9', 'glass3': '#bfd5c5',
    'metal0': '#455665', 'metal1': '#70818a', 'metal2': '#a4b2af', 'metal3': '#d0d5be',
    'leaf0': '#344c45', 'leaf1': '#506847', 'leaf2': '#82934d', 'leaf3': '#b3b568',
    'flower0': '#97586d', 'flower1': '#d89a91', 'gold': '#e2bb71',
    'body0': '#28505d', 'body1': '#3e8793', 'body2': '#69b6b4', 'body3': '#a4d8cb',
    'skin0': '#a87862', 'skin1': '#d6a079', 'skin2': '#f0c998',
}


class Canvas:
    def __init__(self, width=64, height=64):
        self.image = Image.new('RGBA', (width, height))
        self.d = ImageDraw.Draw(self.image)

    def colour(self, c):
        return P.get(c, c)

    def rect(self, box, c):
        self.d.rectangle(box, fill=self.colour(c))

    def line(self, xy, c, width=1):
        self.d.line(xy, fill=self.colour(c), width=width)

    def poly(self, xy, c):
        self.d.polygon(xy, fill=self.colour(c))

    def ellipse(self, box, c):
        self.d.ellipse(box, fill=self.colour(c))

    def slab(self, box, base='wall2', light='wall3', dark='wall0'):
        x0, y0, x1, y1 = box
        self.rect(box, 'ink')
        self.rect((x0 + 1, y0 + 1, x1 - 1, y1 - 1), base)
        self.line((x0 + 1, y1 - 1, x1 - 1, y1 - 1), dark)
        self.line((x1 - 1, y0 + 1, x1 - 1, y1 - 1), dark)
        self.line((x0 + 1, y0 + 1, x1 - 2, y0 + 1), light)

    def window(self, x, y, w=8, h=9, lit=False):
        self.rect((x, y, x + w - 1, y + h - 1), 'ink')
        self.rect((x + 1, y + 1, x + w - 2, y + h - 2), 'glass0')
        self.rect((x + 1, y + 1, x + w - 3, y + h - 3), 'glass1')
        self.line((x + 1, y + h - 4, x + w - 3, y + 1), 'glass2')
        self.line((x + 2, y + h - 4, x + w - 3, y + 2), 'glass3')
        variation = (x // 7 + y // 5) % 3
        if w >= 7 and variation == 1:
            self.rect((x + 1, y + 1, x + 2, y + h - 3), 'wall1')
        elif w >= 7 and variation == 2:
            self.rect((x + 1, y + h - 4, x + 3, y + h - 2), 'glass0')
            self.line((x + w - 4, y + 1, x + w - 3, y + 2), 'glass3')
        self.line((x + w // 2, y + 1, x + w // 2, y + h - 2), 'wall2')
        if h >= 9:
            self.line((x + 1, y + h // 2, x + w - 2, y + h // 2), 'wall2')
        self.line((x - 1, y + h, x + w, y + h), 'wall3')
        self.line((x, y + h + 1, x + w, y + h + 1), 'wall0')
        if lit:
            self.rect((x + 1, y + h - 3, x + 2, y + h - 2), 'gold')

    def planter(self, x, y, w=9):
        self.slab((x, y + 3, x + w, y + 6), 'wood1', 'wood3', 'wood0')
        for dx, dy, tone in [(1, 1, 'leaf1'), (4, 0, 'leaf2'), (7, 1, 'leaf1')]:
            self.rect((x + dx, y + dy, x + min(w - 1, dx + 2), y + dy + 2), tone)
        self.rect((x + 2, y, x + 3, y + 1), 'flower1')
        self.rect((x + w - 3, y + 1, x + w - 2, y + 2), 'flower0')

    def door(self, x, y, w=9, h=16):
        self.slab((x - 1, y - 1, x + w, y + h), 'wall1')
        self.rect((x, y, x + w - 1, y + h - 1), 'wood0')
        self.rect((x + 1, y + 1, x + w - 2, y + h - 2), 'body0')
        self.rect((x + 2, y + 2, x + w - 3, y + 6), 'glass1')
        self.line((x + 2, y + 2, x + w - 3, y + 2), 'glass3')
        self.rect((x + 2, y + 9, x + w - 3, y + h - 3), 'body1')
        self.line((x + w - 3, y + 9, x + w - 3, y + 11), 'gold')

    def pitched_roof(self, x0=4, y0=4, x1=59, y1=25):
        self.poly([(x0 + 5, y0), (x1 - 5, y0), (x1, y1), (x0, y1)], 'ink')
        self.poly([(x0 + 6, y0 + 1), (x1 - 6, y0 + 1), (x1 - 2, y1 - 1), (x0 + 2, y1 - 1)], 'tile2')
        for y in range(y0 + 4, y1, 4):
            edge = round(5 * (1 - (y - y0) / (y1 - y0)))
            self.line((x0 + edge + 1, y, x1 - edge - 1, y), 'tile1')
            for x in range(x0 + edge + 3 + (y // 4 % 2) * 3, x1 - edge - 1, 7):
                self.line((x, y - 2, x, y - 1), 'tile3')
                self.line((x + 1, y - 1, x + 1, y), 'tile0')
        self.line((x0 + 7, y0 + 1, x1 - 6, y0 + 1), 'tile3')
        self.line((x0, y1, x1, y1), 'wood0', 2)

    def flat_roof(self, y=5, bottom=16):
        self.slab((5, y, 58, bottom), 'metal0', 'metal2', 'deep')
        self.rect((8, y + 3, 55, bottom - 3), 'metal1')
        self.line((8, y + 2, 54, y + 2), 'metal3')
        for x, yy in [(13, y + 4), (40, y + 3)]:
            self.slab((x, yy, x + 8, yy + 5), 'metal2', 'metal3', 'metal0')
            self.line((x + 2, yy + 2, x + 6, yy + 2), 'metal0')
            self.line((x + 2, yy + 4, x + 6, yy + 4), 'metal0')


def house():
    c = Canvas()
    c.slab((7, 22, 56, 57))
    c.rect((51, 24, 55, 56), 'wall1')
    c.pitched_roof()
    c.slab((44, 4, 49, 15), 'tile1', 'tile3', 'tile0')
    c.slab((43, 3, 50, 5), 'metal1', 'metal3', 'metal0')
    c.window(12, 29, 9, 11, True)
    c.window(42, 29, 9, 11)
    c.door(27, 39, 10, 18)
    c.slab((25, 37, 39, 39), 'wood1', 'wood3', 'wood0')
    c.planter(11, 42)
    c.planter(42, 42)
    c.slab((25, 57, 39, 60), 'metal1', 'metal2', 'metal0')
    c.line((26, 59, 38, 59), 'metal3')
    c.line((7, 53, 22, 53), 'wall3')
    c.line((43, 53, 55, 53), 'wall0')
    c.planter(7, 53, 12)
    c.planter(45, 53, 11)
    # An off-centre small dormer breaks the otherwise regular roof rhythm.
    c.poly([(21, 21), (21, 13), (26, 8), (31, 13), (31, 21)], 'ink')
    c.poly([(22, 20), (22, 14), (26, 10), (30, 14), (30, 20)], 'wall2')
    c.window(24, 14, 5, 6)
    return c.image


def apartment():
    c = Canvas()
    c.slab((7, 13, 56, 60), 'wall1', 'wall3', 'wall0')
    c.flat_roof(3, 15)
    for y in [19, 31, 43]:
        for i, x in enumerate([12, 27, 42]):
            c.window(x, y, 8, 8, lit=(x + y) % 3 == 0)
        c.line((8, y + 10, 54, y + 10), 'wall3')
    for x, y in [(25, 26), (40, 38)]:
        c.rect((x, y, x + 13, y + 4), 'deep')
        c.line((x, y, x + 13, y), 'metal2')
        for xx in range(x + 1, x + 13, 3):
            c.line((xx, y, xx, y + 3), 'metal1')
    c.door(27, 48, 9, 12)
    c.line((9, 15, 9, 58), 'wall3')
    c.line((53, 16, 53, 58), 'tile1')
    c.planter(11, 52)
    return c.image


def shop():
    c = Canvas()
    c.slab((6, 22, 57, 59))
    c.pitched_roof(3, 5, 60, 24)
    c.window(13, 27, 9, 9)
    c.window(41, 27, 9, 9, True)
    c.slab((24, 29, 38, 34), 'wood1', 'wood3', 'wood0')
    c.line((27, 31, 34, 31), 'gold')
    c.slab((8, 42, 55, 57), 'wood0', 'wood2', 'ink')
    for x in [10, 39]:
        c.rect((x, 44, x + 13, 54), 'glass0')
        c.line((x + 1, 51, x + 10, 44), 'glass1', 2)
        c.line((x + 1, 53, x + 12, 53), 'wood2')
        for xx in range(x + 2, x + 12, 4):
            c.rect((xx, 50, xx + 2, 51), 'gold')
    c.door(27, 43, 9, 16)
    c.poly([(8, 36), (55, 36), (59, 42), (4, 42)], 'ink')
    for x in range(6, 57, 6):
        c.poly([(x + 2, 37), (x + 6, 37), (x + 7, 41), (x, 41)], 'leaf1' if x % 12 == 6 else 'wall3')
        c.rect((x, 42, min(x + 6, 57), 43), 'leaf0' if x % 12 == 6 else 'wall1')
    c.planter(7, 54, 10)
    c.planter(46, 54, 10)
    return c.image


def office():
    c = Canvas()
    c.slab((7, 15, 56, 60), 'metal2', 'wall3', 'metal0')
    c.flat_roof(3, 16)
    for row, y in enumerate([20, 32, 44]):
        for x in [12, 25, 38]:
            c.window(x, y, 11, 9, lit=row == 1)
        c.rect((8, y + 11, 55, y + 12), 'metal0')
        c.line((8, y + 11, 54, y + 11), 'metal3')
    c.rect((25, 50, 38, 60), 'glass0')
    c.line((31, 51, 31, 59), 'metal2')
    c.line((29, 55, 29, 57), 'gold')
    c.line((34, 55, 34, 57), 'gold')
    c.poly([(22, 49), (40, 49), (43, 52), (20, 52)], 'ink')
    c.line((23, 50, 40, 50), 'glass2')
    c.line((21, 51, 41, 51), 'glass1')
    return c.image


def factory():
    c = Canvas()
    c.slab((5, 31, 58, 59), 'tile2', 'tile3', 'tile0')
    # Deliberate brick clusters, not random surface noise.
    for y in range(35, 59, 4):
        c.line((6, y, 57, y), 'tile1')
        for x in range(8 + (y // 4 % 2) * 3, 57, 7):
            c.line((x, y - 2, x, y - 1), 'tile1')
    c.poly([(3, 30), (3, 18), (20, 8), (20, 18), (39, 8), (39, 18), (59, 8), (60, 33)], 'ink')
    for x0, x1 in [(4, 19), (21, 38), (40, 58)]:
        c.poly([(x0, 19), (x1, 10), (x1, 30), (x0, 30)], 'metal1')
        c.poly([(x0 + 2, 18), (x1 - 2, 12), (x1 - 2, 17), (x0 + 2, 22)], 'glass0')
        c.line((x0 + 3, 20, x1 - 2, 15), 'glass2')
        for x in range(x0 + 2, x1, 3):
            c.line((x, 23, x, 30), 'metal2')
    c.slab((46, 3, 52, 13), 'tile1', 'tile3', 'tile0')
    c.slab((45, 2, 53, 4), 'metal1', 'metal3', 'metal0')
    c.slab((23, 39, 45, 59), 'metal0', 'metal2', 'deep')
    for y in range(42, 59, 3):
        c.line((25, y, 43, y), 'metal2')
        c.line((25, y + 1, 43, y + 1), 'metal1')
    c.window(9, 39, 9, 10)
    for x in [20, 47]:
        c.rect((x, 52, x + 2, 59), 'gold')
        c.line((x, 55, x + 2, 56), 'ink')
    c.slab((8, 54, 17, 59), 'wood1', 'wood3', 'wood0')
    c.line((9, 56, 16, 56), 'wood0')
    return c.image


def school():
    c = Canvas()
    c.slab((6, 22, 57, 59), 'wall2', 'wall3', 'wall0')
    c.pitched_roof(3, 8, 60, 26)
    c.poly([(25, 23), (25, 12), (31, 5), (38, 12), (38, 23)], 'ink')
    c.poly([(26, 22), (26, 13), (31, 7), (37, 13), (37, 22)], 'wall2')
    c.ellipse((28, 12, 35, 19), 'wood0')
    c.ellipse((29, 13, 34, 18), 'wall3')
    c.line((31, 14, 31, 16, 33, 17), 'ink')
    for y in [30, 44]:
        for x in [11, 44]:
            c.window(x, y, 9, 10)
    c.door(27, 42, 10, 17)
    c.slab((24, 39, 40, 42), 'tile1', 'tile3', 'tile0')
    c.line((23, 34, 40, 34), 'wood0')
    for i, x in enumerate([24, 29, 34, 39]):
        c.poly([(x, 35), (x + 3, 35), (x + 1, 38)], 'body1' if i % 2 else 'gold')
    c.planter(7, 54, 12)
    c.planter(44, 54, 12)
    c.line((39, 3, 39, 13), 'wood1')
    c.poly([(40, 3), (48, 5), (40, 8)], 'body2')
    return c.image


def tree():
    c = Canvas(64, 128)
    c.poly([(28, 113), (29, 73), (21, 56), (27, 60), (33, 72), (38, 49), (40, 52), (35, 80), (37, 114), (44, 119), (21, 119)], 'ink')
    c.poly([(28, 117), (31, 80), (25, 60), (29, 64), (34, 79), (37, 116), (41, 118)], 'wood1')
    c.line((31, 111, 32, 82, 29, 70), 'wood2', 2)
    c.line((35, 113, 34, 91), 'wood0')
    c.line((29, 116, 26, 119), 'wood2', 2)
    # Authored lobe placement creates an irregular canopy, with form shading on each cluster.
    lobes = [(24, 27, 15), (39, 28, 14), (16, 39, 13), (34, 43, 17), (46, 45, 12),
             (12, 55, 10), (25, 58, 14), (43, 60, 14), (20, 72, 10), (36, 75, 12)]
    for i, (x, y, r) in enumerate(lobes):
        c.ellipse((x - r, y - r + 1, x + r, y + r), 'leaf0')
        c.ellipse((x - r + 1, y - r, x + r - 2, y + r - 4), 'leaf1')
        c.ellipse((x - r + 2, y - r + 1, x + r - 6, y + r - 9), 'leaf2')
        # Leaves in two/three-pixel strokes, deliberately sparse and oriented consistently.
        for dx, dy in [(-5, -5), (1, -7), (-8, 0), (4, -1)]:
            if r >= 12:
                c.line((x + dx, y + dy, x + dx + 2, y + dy - 1), 'leaf3')
    # A few connecting masses merge internal lobe seams; the crown is one volume, not beads.
    c.poly([(21, 41), (28, 37), (35, 42), (31, 51), (20, 53)], 'leaf1')
    c.poly([(21, 41), (27, 38), (30, 40), (24, 46), (20, 46)], 'leaf2')
    c.line((22, 41, 24, 40), 'leaf3')
    c.line((29, 86, 24, 79, 21, 72), 'wood0', 2)
    c.line((34, 87, 42, 76), 'wood1', 2)
    return c.image


def person(direction, phase):
    from pixel_actors import draw_person
    return draw_person(Canvas, direction, phase)


def save_spec(name, image, target, renderer):
    rgba = np.array(image.convert('RGBA'))
    palette = sorted({'#' + bytes(pixel[:3]).hex() for pixel in rgba.reshape(-1, 4) if pixel[3]})
    pixels = [{'x': int(x), 'y': int(y), 'color': '#' + bytes(rgba[y, x, :3]).hex()}
              for y, x in np.argwhere(rgba[..., 3] > 0)]
    spec = dict(width=image.width, height=image.height, background='transparent', pixel_size=1,
                palette=palette, pixels=pixels, art_source='code')
    (ART / 'specs' / f'{name}.json').write_text(json.dumps(spec, separators=(',', ':')) + '\n', encoding='utf-8')
    rendered = renderer.render_single_frame(pixels, image.width, image.height, background='transparent', pixel_size=1)
    target.parent.mkdir(parents=True, exist_ok=True)
    rendered.save(target, optimize=True)
    assert len(palette) <= 40, (name, len(palette))
    return rendered


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--skill-dir', type=Path, default=Path.home() / '.claude/skills/pixel-art-studio')
    args = parser.parse_args()
    ART.mkdir(parents=True, exist_ok=True)
    (ART / 'specs').mkdir(exist_ok=True)
    script = args.skill_dir / 'scripts/render.py'
    module = importlib.util.spec_from_file_location('pixel_studio_renderer', script)
    renderer = importlib.util.module_from_spec(module)
    module.loader.exec_module(renderer)
    for name, draw in [('house', house), ('apartment', apartment), ('shop', shop), ('office', office), ('factory', factory), ('school', school), ('tree', tree)]:
        save_spec(name, draw(), STREET / f'{name}-source.png', renderer)
    from pixel_civic import DRAWERS
    for name, draw in DRAWERS.items():
        save_spec(name, draw(Canvas), STREET / f'{name}-source.png', renderer)
    from pixel_landmarks import DRAWERS as LANDMARKS
    for name, draw in LANDMARKS.items():
        save_spec(name, draw(Canvas), STREET / f'{name}-source.png', renderer)
    people = Image.new('RGBA', (128, 48 * 7))
    for phase in range(7):
        for direction in range(4):
            frame = save_spec(f'person-{direction}-{phase}', person(direction, phase), ART / 'people' / f'{direction}-{phase}.png', renderer)
            people.paste(frame, (direction * 32, phase * 48))
    people.save(STREET / 'people-source.png')
    for name, truck, target in [('hatchback', False, CAR / 'hatchback-views.png'), ('truck', True, STREET / 'truck-source.png')]:
        from pixel_actors import vehicle_volume, orthographic_views
        volume = vehicle_volume(P, truck)
        views = orthographic_views(volume)
        strip = Image.new('RGBA', (volume.shape[2] * volume.shape[0], volume.shape[1]))
        for z, layer in enumerate(volume):
            strip.paste(Image.fromarray(layer), (z * volume.shape[2], 0))
        strip.save(STREET / 'truck-slices.png' if truck else CAR / 'hatchback-slices.png')
        sheet = Image.new('RGBA', (sum(v.width * 8 for v in views) + 200, max(v.height for v in views) * 8 + 80), 'white')
        x = 40
        for i, view in enumerate(views):
            frame = save_spec(f'{name}-view-{i}', view, ART / f'{name}-view-{i}.png', renderer)
            frame = frame.resize((frame.width * 8, frame.height * 8), Image.Resampling.NEAREST)
            sheet.paste(frame, (x, 40), frame)
            x += frame.width + 40
        sheet.convert('RGB').save(target)
    (ART / 'provenance.json').write_text(json.dumps(dict(art_source='code', image_model_used=False,
        authoring_script='tools/draw-handmade.py', actor_authoring_script='tools/pixel_actors.py',
        civic_authoring_script='tools/pixel_civic.py',
        landmark_authoring_script='tools/pixel_landmarks.py', native_landmark_grid=128,
        vehicle_geometry='one code-authored volume per vehicle; slices and diagnostic views share geometry',
        skill='pixel-art-studio', palette=P, native_building_grid=64,
        person_directions=['east', 'south', 'west', 'north'], person_walk_frames=6, source_specs='specs/'), indent=2) + '\n', encoding='utf-8')
    print('Authored 17 static sprites, 28 pedestrian frames and 8 orthographic vehicle views from code.')


if __name__ == '__main__':
    main()
