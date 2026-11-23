"""Code-authored resident silhouettes and matching portraits; no image generation.

Uses the existing pixel-art-studio Canvas and six-step walk anatomy. Eight authored
looks, three age silhouettes, four directions. One compact 3072x336 actor atlas.
"""
import importlib.util
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from pixel_actors import draw_person

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'src/assets/street'
DOC = ROOT / 'docs/design-assets/residents'
spec = importlib.util.spec_from_file_location('handmade', Path(__file__).with_name('draw-handmade.py'))
handmade = importlib.util.module_from_spec(spec)
spec.loader.exec_module(handmade)
CONFIG = json.loads((OUT / 'residents.json').read_text())


def shade(hex_colour, factor):
    return '#' + ''.join(f'{min(255, max(0, round(v * factor))):02x}' for v in bytes.fromhex(hex_colour))


def palette(look, age):
    hair = 'a5a6a2' if age == 2 else look['hairColour']
    return {**handmade.P, **{f'body{i}': shade(look['shirt'], v) for i, v in enumerate([.62, .85, 1.12, 1.3])},
            **{f'skin{i}': shade(look['skin'], v) for i, v in enumerate([.76, 1, 1.12])},
            'hair0': shade(hair, .66), 'hair1': '#' + hair, 'hair2': shade(hair, 1.3)}


def head(c, look, age, direction, bob=0, portrait=False):
    # Head occupies the same authored head box as the original walk cycle.
    back, side, west = direction == 3, direction in [0, 2], direction == 2
    d = c.d
    p = c.colour
    hair = look['hair']
    female = look.get('gender') == 'female'
    if portrait:
        # Draw directly at portrait resolution, including neck, ears and face planes.
        c.slab((9 if female else 7, 31, 38 if female else 40, 47), 'body1', 'body2', 'body0')
        c.poly([(14, 32), (23, 38), (33, 32), (30, 29), (17, 29)], 'wall3')
        c.rect((19, 26, 28, 34), 'skin0')
        c.rect((20, 26, 26, 32), 'skin1')
        c.ellipse((13 if female else 11, 10, 34 if female else 36, 32), 'ink')
        c.ellipse((14 if female else 12, 9, 33 if female else 35, 30), 'skin1')
        c.ellipse((14 if female else 12, 10, 31 if female else 32, 27), 'skin2')
        c.rect((12 if female else 10, 19, 15 if female else 13, 23 if female else 24), 'skin1')
        c.rect((32 if female else 34, 19, 35 if female else 37, 23 if female else 24), 'skin0')
        c.rect((16, 19, 19, 21), 'ink'); c.rect((28, 19, 31, 21), 'ink')
        c.line((16, 16, 20, 16), 'hair0'); c.line((27, 16, 31, 16), 'hair0')
        c.line((24, 21, 23, 24, 25, 24), 'skin0')
        c.line((20, 28, 27, 28), 'skin0')
        # Hair shapes are the same named style as the world sprite, authored at 48px.
        if hair == 'bob':
            c.poly([(10, 25), (9, 13), (12, 6), (21, 3), (32, 5), (37, 12), (38, 28), (33, 29),
                    (32, 14), (27, 11), (19, 15), (14, 13), (14, 26)], 'hair0')
        elif hair == 'curly':
            for x, y in [(12, 9), (18, 5), (25, 5), (31, 9)]: c.ellipse((x-4, y-3, x+5, y+5), 'hair0')
            for x, y in [(12, 8), (20, 5), (28, 7)]: c.rect((x, y, x+3, y+2), 'hair1')
        elif hair == 'cap':
            c.poly([(10, 14), (13, 5), (24, 2), (34, 7), (35, 14)], 'body0')
            c.rect((11, 10, 35, 14), 'body2'); c.rect((7, 14, 38, 17), 'body0')
            c.rect((21, 5, 25, 9), 'wall3')
        else:
            c.poly([(11, 16), (10, 10), (15, 5), (23, 3), (32, 6), (36, 12), (34, 17),
                    (30, 12), (24, 11), (18, 14), (14, 12), (14, 18)], 'hair0')
        if hair in ['ponytail', 'bun']:
            c.ellipse((32, 6 if hair == 'bun' else 15, 40, 14 if hair == 'bun' else 29), 'hair0')
            c.line((12, 14, 12, 24), 'hair0', 3)
            c.line((34, 14, 34, 23), 'hair0', 2)
            c.rect((34, 13 if hair == 'bun' else 18, 37, 14 if hair == 'bun' else 19), 'body2')
        if female and hair == 'glasses':
            c.poly([(10, 12), (14, 13), (14, 25), (17, 30), (12, 29)], 'hair0')
            c.poly([(33, 12), (36, 12), (37, 29), (32, 31), (32, 27)], 'hair0')
        if hair not in ['cap', 'curly']:
            c.line((14, 10, 21, 6, 27, 7), 'hair2', 2)
        if hair == 'parted': c.line((23, 4, 24, 10), 'hair2', 2)
        if hair == 'glasses' or age == 2:
            c.rect((14, 17, 21, 23), 'ink'); c.rect((26, 17, 33, 23), 'ink')
            c.rect((15, 18, 20, 22), 'skin2'); c.rect((27, 18, 32, 22), 'skin1')
            c.line((21, 19, 26, 19), 'ink')
            c.line((15, 18, 18, 18), 'glass3'); c.line((27, 18, 30, 18), 'glass3')
        if age == 2:
            c.line((15, 26, 17, 27), 'skin0'); c.line((30, 26, 32, 25), 'skin0')
        c.line((23, 39, 23, 45), 'body3')
        return

    d.rectangle((6, 1+bob, 27, 18+bob), fill=(0, 0, 0, 0))
    def pts(points): return [(31-x if west else x, y+bob) for x, y in points]
    def poly(points, colour): d.polygon(pts(points), fill=p(colour))
    def line(points, colour, width=1): d.line(pts(points), fill=p(colour), width=width)
    if side:
        poly([(13, 7), (20, 5), (23, 8), (23, 11), (25, 12), (23, 15), (20, 17), (15, 16)], 'ink')
        poly([(15, 8), (21, 8), (22, 11), (24, 12), (22, 14), (20, 16), (16, 15)], 'skin1')
        line([(19, 8), (21, 8), (22, 11)], 'skin2', 2)
        line([(21, 10), (22, 10)], 'ink', 2)
    else:
        c.slab((11, 6+bob, 22, 17+bob), 'hair1' if back else 'skin1', 'hair2' if back else 'skin2', 'skin0')
        if not back:
            c.rect((13, 11+bob, 14, 12+bob), 'ink'); c.rect((19, 11+bob, 20, 12+bob), 'ink')
            c.line((15, 15+bob, 18, 15+bob), 'skin0')
    if hair == 'cap':
        poly([(10, 9), (12, 4), (18, 2), (23, 5), (23, 9)], 'body0')
        line([(12, 6), (20, 5)], 'body2', 2)
        line([(10, 10), (25 if side else 23, 10)], 'body0', 2)
    elif hair == 'curly':
        for x, y in [(12, 6), (16, 4), (20, 5)]:
            poly([(x-2,y), (x,y-2), (x+3,y-1), (x+3,y+3), (x-1,y+3)], 'hair0')
        line([(12, 5), (15, 4)], 'hair2', 2)
    else:
        poly([(11, 11), (10, 7), (13, 3), (19, 2), (23, 5), (24, 9), (21, 10), (19, 7), (15, 9), (12, 8)], 'hair0')
        line([(12 if not west else 18, 6), (16, 4), (19 if not west else 12, 5)], 'hair2', 2)
        if hair == 'bob':
            poly([(10, 7), (12, 7), (13, 17), (10, 18), (9, 13)], 'hair0')
            if not side: c.rect((22, 8+bob, 24, 17+bob), 'hair0')
        if female and hair == 'glasses':
            poly([(10, 8), (12, 8), (13, 18), (10, 19), (9, 14)], 'hair0')
            if not side: c.rect((22, 8+bob, 24, 19+bob), 'hair0')
        if hair in ['ponytail', 'bun']:
            poly([(9, 5 if hair == 'bun' else 10), (7, 7 if hair == 'bun' else 14),
                  (8, 10 if hair == 'bun' else 19), (11, 11 if hair == 'bun' else 17), (12, 7)], 'hair0')
        if hair == 'parted': line([(17, 3), (18, 7)], 'hair2')
    if back:
        c.poly([(11, 9+bob), (22, 9+bob), (22, 15+bob), (18, 17+bob), (12, 15+bob)], 'hair0')
        c.line((12, 9+bob, 19, 9+bob), 'hair1', 2)
    elif hair == 'glasses' or age == 2:
        if side: line([(20, 10), (23, 10), (23, 13), (20, 13), (20, 10)], 'ink')
        else:
            c.rect((12, 10+bob, 15, 13+bob), 'ink'); c.rect((18, 10+bob, 21, 13+bob), 'ink')
            c.line((15, 11+bob, 18, 11+bob), 'ink')


def actor(look, age, direction, phase):
    colours = palette(look, age)
    class PersonCanvas(handmade.Canvas):
        def colour(self, c): return colours.get(c, c)
    image = draw_person(PersonCanvas, direction, phase, look['bag'], female=look.get('gender') == 'female')
    c = PersonCanvas(32, 48); c.image = image; c.d = ImageDraw.Draw(image)
    bob = [0, 0, 1, -1, 0, 1, -1][phase]
    head(c, look, age, direction, bob)
    if look['hair'] in ['curly', 'parted']:
        c.line((12, 24+bob, 19, 24+bob), 'body3')
        c.line((12, 27+bob, 19, 27+bob), 'body0')
    if age != 1:
        width, height, y = (25, 37, 9) if age == 0 else (30, 44, 3)
        small = image.resize((width, height), Image.Resampling.NEAREST)
        image = Image.new('RGBA', (32, 48)); image.paste(small, ((32-width)//2, y))
    return image


def portrait(look, age):
    colours = palette(look, age)
    class PortraitCanvas(handmade.Canvas):
        def colour(self, c): return colours.get(c, c)
    c = PortraitCanvas(48, 48)
    c.rect((0,0,47,47), 'deep'); c.rect((2,2,45,45), 'glass0')
    head(c, look, age, 1, portrait=True)
    if age == 0:
        # Rounder child face and small shoulder silhouette, independently of clothes colour.
        image = c.image.crop((7, 2, 41, 48)).resize((30, 40), Image.Resampling.NEAREST)
        c.rect((2,2,45,47), 'glass0'); c.image.paste(image,(9,8))
    return c.image


def main():
    DOC.mkdir(parents=True, exist_ok=True)
    actors = Image.new('RGBA', (32 * 4 * 24, 48 * 7))
    portraits = Image.new('RGBA', (48 * 8, 48 * 3))
    preview = Image.new('RGB', (8*160, 3*220), '#202a33')
    d = ImageDraw.Draw(preview)
    for age in range(3):
        for variant, look in enumerate(CONFIG['looks']):
            profile = age * 8 + variant
            face = portrait(look, age)
            portraits.paste(face,(variant*48,age*48))
            preview.paste(face.resize((128,128),Image.Resampling.NEAREST),(variant*160+16,age*220+20))
            for phase in range(7):
                for direction in range(4):
                    frame = actor(look, age, direction, phase)
                    actors.paste(frame,((profile*4+direction)*32,phase*48))
                    if phase == 0:
                        frame = frame.resize((32,48),Image.Resampling.NEAREST)
                        preview.paste(frame,(variant*160+direction*32+16,age*220+154),frame)
            d.text((variant*160+12,age*220+204),f'{CONFIG["ages"][age]} / {look["hair"]}',fill='#d9d7c3')
    actors.save(OUT / 'residents.png',optimize=True)
    portraits.save(OUT / 'portraits.png',optimize=True)
    preview.save(DOC / 'residents-contact.png')
    (DOC/'provenance.json').write_text(json.dumps({'artSource':'code','imageModelUsed':False,
      'authoring':'tools/draw_residents.py','profiles':24,'directions':4,'poses':7,
      'actorRgbaMiB':4*actors.width*actors.height/1024**2,'portraitRgbaMiB':4*portraits.width*portraits.height/1024**2},indent=2)+'\n')
    print('Authored 24 resident silhouettes, 672 directional frames and matching portraits.')


if __name__ == '__main__': main()
