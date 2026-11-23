"""Draws the close-up city atlases, src/assets/buildings/city*-detail.png, at 128 px a tile.

Every building is the very same drawing as in src/assets/city*.png (tools/draw_tiles.py): the
same footprint, outline, roof, windows, doors, signs and paint, picked up from draw_tiles.py's
own functions. Only the surfaces are worked up at four times the size, by what they are made of:

  roof tiles   courses and staggered joints        brick       bricks and mortar
  flat roofs   membrane seams                       plaster     faint siding lines
  glass        frame, mullions, sill, sky, glint    metal       standing ribs
  wood         planks                               leaves      clusters lit from the top left

and every surface gets a one-pixel lit top/left edge and a shaded bottom/right edge. Patterns are
fixed, never random, so a building looks the same on every lot. The city styles (San Francisco,
California, New York) are repainted the same way draw_tiles.py repaints them, with their touches
(fire escapes, water tanks, painted trim, ridge tiles) redrawn at the larger size.

    python tools/draw_tiles_hd.py

Code-drawn, no image model. Needs Pillow and NumPy.
"""
from collections import deque
import colorsys
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import draw_tiles as dt  # noqa: E402  (builds every source tile on import)

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'src' / 'assets' / 'buildings'
UNIT = 128                      # pixels per map tile in the close-up atlas
GLASS_EXACT = {dt.rgba(c)[:3] for c in (dt.GLASS, dt.GLASS_LIGHT, dt.GLASS_DARK, '#6fc7a8', '#a9ead2', '#3f9678',
                                         '#c79a6f', '#eac9a9', '#96683f')}
BRICKS = {dt.rgba(c)[:3] for c in ('#c98b74', '#a86f5b', '#9a5b4d', '#b98a6a', '#96694d', '#7d4a3e', '#c98480')}
WOODS = {dt.rgba(c)[:3] for c in (dt.WOOD, dt.WOOD_DARK)}


# --- Regions of one colour on the source grid
def regions(src):
    h, w = src.shape[:2]
    seen = np.zeros((h, w), bool)
    out = []
    for y in range(h):
        for x in range(w):
            if seen[y, x] or src[y, x, 3] == 0:
                continue
            colour = tuple(src[y, x])
            queue, cells = deque([(x, y)]), []
            seen[y, x] = True
            while queue:
                px, py = queue.popleft()
                cells.append((px, py))
                for nx, ny in ((px + 1, py), (px - 1, py), (px, py + 1), (px, py - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny, nx] and tuple(src[ny, nx]) == colour:
                        seen[ny, nx] = True
                        queue.append((nx, ny))
            out.append((colour, cells))
    return out


def hsv(colour):
    h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in colour[:3]))
    return h * 360, s, v


def material(colour, cells, roof_line, ground, roofs='flat'):
    """What a region is made of, from its paint, size and where it sits on the building."""
    if colour[3] < 255:
        return 'shadow'
    rgb = tuple(int(c) for c in colour[:3])
    hue, sat, val = hsv(rgb)
    area = len(cells)
    if ground:
        return 'ground'
    roof = sum(y for _, y in cells) / area < roof_line
    if rgb in GLASS_EXACT or (175 <= hue <= 215 and 0.15 <= sat <= 0.62 and val > 0.5 and area <= 24 and not roof):
        return 'glass'
    if area <= 4:
        return 'accent'
    if rgb in WOODS:
        return 'wood'
    if 70 <= hue <= 165 and sat > 0.25:
        return 'leaf'
    xs = [x for x, _ in cells]
    ys = [y for _, y in cells]
    upright = (max(ys) - min(ys) + 1) > 1.3 * (max(xs) - min(xs) + 1)
    if sat < 0.1:
        return 'metal' if not roof or roofs == 'metal' else 'flat'
    if roof:
        if roofs == 'pitched' and sat > 0.22 and val < 0.95 and not upright:
            return 'tiles'
        return 'metal' if roofs == 'metal' else 'flat'
    if rgb in BRICKS or ((hue <= 30 or hue >= 345) and 0.28 <= sat <= 0.5 and 0.45 <= val < 0.82):
        return 'brick'
    return 'plaster'


# --- Fixed patterns, in output pixels
def leaf_pattern():
    """Overlapping clusters lit from the top left, 24 px repeat."""
    p = np.zeros((24, 24))
    for cx, cy in ((5, 5), (17, 3), (11, 12), (2, 17), (21, 15), (14, 22)):
        for y in range(-6, 7):
            for x in range(-6, 7):
                d = x * x + y * y
                if d > 30:
                    continue
                py, px = (cy + y) % 24, (cx + x) % 24
                p[py, px] = 0.16 if x + y < -4 else -0.16 if x + y > 4 else 0.02
    return p


LEAVES = leaf_pattern()


def texture(kind, X, Y, colour):
    """A lightness shift for each pixel of a surface (positive lightens, negative darkens)."""
    by = np.zeros(X.shape)
    if kind == 'tiles':
        r = Y % 6
        course = Y // 6
        by[r == 5] = -0.2
        by[r == 0] = 0.08
        joint = ((X + (course % 2) * 4) % 8 == 0) & (r > 0) & (r < 5)
        by[joint] = -0.11
    elif kind == 'flat':
        by[(Y % 16 == 15)] = -0.06
        by[(X % 16 == 15)] = -0.045
        by[((X * 7 + Y * 13) % 31 == 0)] = -0.07
        by[((X * 11 + Y * 5) % 37 == 0)] = 0.05
    elif kind == 'brick':
        course = Y // 4
        mortar = (Y % 4 == 3) | ((X + (course % 2) * 4) % 8 == 7)
        tone = (((X + (course % 2) * 4) // 8 * 5 + course * 3) % 7 - 3) * 0.012
        by = tone
        by = np.where(mortar, 0.13, by)
    elif kind == 'plaster':
        by[Y % 4 == 3] = -0.05
        by[Y % 4 == 0] = 0.025
    elif kind == 'metal':
        by[X % 4 == 0] = 0.08
        by[X % 4 == 3] = -0.09
    elif kind == 'wood':
        by[X % 4 == 3] = -0.15
        by[((X // 4) * 7 + Y) % 11 == 0] = -0.08
    elif kind == 'leaf':
        by = LEAVES[Y % 24, X % 24]
    return by


def shade(rgb, by):
    """`rgb` (..., 3) lightened toward white or darkened toward black by `by` (...)."""
    rgb = rgb.astype(float)
    by = np.asarray(by, float)[..., None]
    out = np.where(by >= 0, rgb + (255 - rgb) * by, rgb * (1 + by))
    return np.clip(np.round(out), 0, 255).astype(np.uint8)


def ground_texture(src, S, out):
    """Roads and lots join their neighbours: fine surface grain only, no edges."""
    n = src.shape[0] * S
    Y, X = np.mgrid[0:n, 0:n]
    rgb = out[..., :3]
    base = np.repeat(np.repeat(src[..., :3], S, 0), S, 1)
    hue_sat = {}
    by = np.zeros((n, n))
    for colour in {tuple(c) for c in base.reshape(-1, 3)}:
        mask = np.all(base == colour, axis=-1)
        h, s, v = hsv(colour)
        key = colour
        if s < 0.06 and v < 0.35:                     # asphalt: small stones
            pat = np.where((X * 37 + Y * 91) % 23 == 0, 0.07, np.where((X * 53 + Y * 29) % 19 == 0, -0.06, 0.0))
        elif s < 0.08 and v < 0.62:                   # kerb stones
            pat = np.where(Y % 16 == 0, -0.12, 0.0) + np.where(X % 16 == 0, -0.12, 0.0)
        elif s < 0.1:                                 # pavement slabs and paint
            pat = np.where((X % 16 == 0) | (Y % 16 == 0), -0.07, 0.0) if v < 0.8 else np.zeros((n, n))
        elif 70 <= h <= 165:                          # grass: blades
            blade = ((X * 5 + (Y // 3) * 17) % 13 == 0)
            pat = np.where(blade & (Y % 3 != 2), -0.08, 0.0) + np.where(((X * 3 + Y * 7) % 29 == 0), 0.07, 0.0)
        else:                                         # paving and gravel
            pat = np.where((X * 13 + Y * 7) % 17 == 0, -0.07, 0.0) + np.where((X * 7 + Y * 19) % 23 == 0, 0.06, 0.0)
        hue_sat[key] = True
        by = np.where(mask, pat, by)
    out[..., :3] = shade(rgb, by)
    return out


def hd(src, S, ground=False, roofs='flat'):
    """A source tile (any grid) drawn S times larger with materials, edges and glazing."""
    src = np.asarray(src.convert('RGBA'), np.uint8)
    h, w = src.shape[:2]
    out = np.repeat(np.repeat(src, S, 0), S, 1).copy()
    if ground:
        return Image.fromarray(ground_texture(src, S, out))
    opaque_rows = [y for y in range(h) if (src[y, :, 3] == 255).any()]
    if not opaque_rows:
        return Image.fromarray(out)
    top, bottom = opaque_rows[0], opaque_rows[-1]
    roof_line = top + 0.45 * (bottom - top + 1)
    H, W = h * S, w * S
    Y, X = np.mgrid[0:H, 0:W]
    glass_mask = np.zeros((H, W), bool)
    leaves = np.zeros((H, W), bool)
    sills = []
    for colour, cells in regions(src):
        kind = material(colour, cells, roof_line, ground, roofs)
        if kind == 'shadow':
            continue
        cellmask = np.zeros((h, w), bool)
        for x, y in cells:
            cellmask[y, x] = True
        mask = np.repeat(np.repeat(cellmask, S, 0), S, 1)
        rgb = np.array(colour[:3], np.uint8)
        up = np.zeros_like(mask); up[1:] = mask[:-1]
        down = np.zeros_like(mask); down[:-1] = mask[1:]
        left = np.zeros_like(mask); left[:, 1:] = mask[:, :-1]
        right = np.zeros_like(mask); right[:, :-1] = mask[:, 1:]
        ys, xs = zip(*[(y, x) for x, y in cells])
        x0, x1, y0, y1 = min(xs) * S, (max(xs) + 1) * S - 1, min(ys) * S, (max(ys) + 1) * S - 1
        if kind == 'glass':
            glass_mask |= mask
            bw, bh = x1 - x0 + 1, y1 - y0 + 1
            by = np.zeros((H, W))
            fy = (Y - y0) / max(1, bh - 1)
            by += np.where(fy < 0.35, -0.1, 0.0)                          # sky reflected at the top
            glint = ((X - x0) - (Y - y0)) % 22
            by += np.where((glint < 2) & (fy < 0.8), 0.3, 0.0)
            by += np.where((glint == 3) & (fy < 0.8), 0.15, 0.0)
            if bw <= 48 and bh <= 48:
                mx, my = (x0 + x1) // 2, y0 + bh * 45 // 100
                cross = ((X == mx) & (bw >= 12)) | ((Y == my) & (bh >= 12))
                by = np.where(cross, 0.62, by)
                if bw >= 12 and bh >= 12 and ((x0 // S * 7 + y0 // S * 3) % 3 == 0):
                    # Curtains drawn half across one window in three.
                    curtain = ((X - x0 < 3) | (x1 - X < 3)) & (Y > y0) & (Y < y1 - 1)
                    by = np.where(curtain, 0.45, by)
                if colour[1] < 200:
                    sills.append((x0, x1, y1))
            else:
                mullion = ((X - x0) % 8 == 7) | ((Y - y0) % 12 == 11)
                by = np.where(mullion, -0.24, by)
            frame = mask & ~(up & down & left & right)
            by = np.where(frame, -0.42, by)
            out[mask, :3] = shade(np.broadcast_to(rgb, (H, W, 3)), by)[mask]
            continue
        by = texture(kind, X, Y, colour) if kind not in ('accent',) else np.zeros((H, W))
        if np.isscalar(by):
            by = np.full((H, W), by)
        # One-pixel bevel round every surface: light from the top left.
        by = np.where(mask & ~up, 0.15, by)
        by = np.where(mask & ~left & up, 0.08, by)
        by = np.where(mask & ~down, -0.2, by)
        by = np.where(mask & ~right & down & up, -0.13, by)
        if kind == 'accent' and len(cells) <= 2:
            # Small things (lamps, flowers, knobs) read as objects: soften their corners.
            corner = (~up & ~left) | (~up & ~right) | (~down & ~left) | (~down & ~right)
            outside = np.zeros_like(mask)
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                shifted = np.roll(np.roll(out[..., 3] == 0, dy, 0), dx, 1)
                outside |= shifted
            by = np.where(mask & corner, -0.18, by)
        out[mask, :3] = shade(np.broadcast_to(rgb, (H, W, 3)), by)[mask]
        if kind == 'leaf':
            leaves |= mask
    if leaves.any():
        # Hedges and bushes are round: trim their outer corners.
        empty = np.pad(out[..., 3] == 0, 2, constant_values=True).astype(int)
        count = sum(empty[2 + dy:2 + dy + H, 2 + dx:2 + dx + W] for dy in range(-2, 3) for dx in range(-2, 3))
        out[leaves & (count > 11), 3] = 0
    # Sills under windows, lintels over them, where there is wall to carry them.
    for x0, x1, y1 in sills:
        for dy, by in ((1, 0.32), (2, -0.28)):
            yy = y1 + dy
            if yy >= H:
                continue
            xs = np.arange(max(0, x0 - 1), min(W, x1 + 2))
            ok = (out[yy, xs, 3] == 255) & ~glass_mask[yy, xs]
            out[yy, xs[ok], :3] = shade(out[yy, xs[ok], :3], np.full(ok.sum(), by))
    # Shadows: fade the outer edge so they sit on the ground.
    shadow = (out[..., 3] > 0) & (out[..., 3] < 255)
    if shadow.any():
        solid = out[..., 3] == 255
        near = np.zeros_like(solid)
        for d in range(1, 4):
            near |= np.roll(solid, d, 1) | np.roll(solid, d, 0) | np.roll(np.roll(solid, d, 0), d, 1)
        out[shadow & ~near, 3] = (out[shadow & ~near, 3] * 0.65).astype(np.uint8)
    return Image.fromarray(out)


def flat(image, size):
    """A source tile on a `size` grid, nearest neighbour, so finish_lot can draw on it."""
    return image.resize((size, size), Image.NEAREST)


# --- City styles at the close-up size (draw_tiles.restyle, scaled)
def restyle_hd(sheet, style, F, k):
    out = sheet.copy()
    px = np.asarray(out).copy()
    spec = dt.STYLES[style]
    home_rows = range(len(dt.ROWS) + 2, len(dt.ROWS) + 2 + len(dt.HOME_ROWS))
    cache = {}

    def recolour(colour, roof, wall):
        key = (colour, roof, wall)
        if key in cache:
            return cache[key]
        r, g, b = colour
        h, sat, val = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        hue = h * 360
        result = colour
        if not (val < 0.22 or (185 <= hue <= 235 and sat > 0.22) or (70 <= hue <= 165 and sat > 0.25)):
            if roof:
                to, value = spec['roof'], val * spec['roof'][2]
            elif sat > 0.58 and val > 0.5:
                to = None
            else:
                to, value = wall, (0.62 + 0.38 * val) * wall[2]
            if to:
                nr, ng, nb = colorsys.hsv_to_rgb(to[0] / 360, to[1], max(0.0, min(1.0, value)))
                result = (round(nr * 255), round(ng * 255), round(nb * 255))
        cache[key] = result
        return result

    def repaint(left, top, size, which):
        wall = spec['walls'][which % len(spec['walls'])]
        block = px[top:top + size, left:left + size]
        rows = [y for y in range(size) if (block[y, :, 3] == 255).any()]
        if not rows:
            return
        eaves = rows[0] + max(3 * k, round(len(rows) * 0.22))
        for y in rows:
            line = block[y]
            for x in np.nonzero(line[:, 3] == 255)[0]:
                line[x, :3] = recolour(tuple(int(c) for c in line[x, :3]), y < eaves, wall)

    def touches(left, top, tall):
        block = px[top:top + F, left:left + F]
        solid = block[..., 3] == 255

        def put(x0, y0, x1, y1, colour, need=True):
            c = np.array(dt.rgba(colour), np.uint8)
            region = np.zeros_like(solid)
            region[max(0, y0):y1 + 1, max(0, x0):x1 + 1] = True
            if need:
                region &= solid
            block[region] = c

        if style == 'newyork' and tall:
            # Fire escape: landings with rails and balusters, ladders between them.
            for y in (13, 18, 23):
                Y0 = y * k
                put(11 * k, Y0 + 2, 22 * k - 1, Y0 + 3, '#1b1d22')
                put(11 * k, Y0 - 3, 22 * k - 1, Y0 - 3, '#2c3038')
                for x in range(11 * k, 22 * k, 3):
                    put(x, Y0 - 3, x, Y0 + 1, '#2c3038')
                put(11 * k, Y0 + 4, 11 * k + 1, Y0 + 4 * k - 1, '#1b1d22')
                put(22 * k - 2, Y0 + 4, 22 * k - 1, Y0 + 4 * k - 1, '#1b1d22')
            for step in range(8):
                x = 13 * k + step * 4
                put(x, 14 * k + step * 2, x + 3, 14 * k + step * 2, '#3a3f47')
            if solid[5 * k, 22 * k]:
                # Water tank: wooden staves, hoops and a pointed lid on legs.
                put(21 * k, 1 * k, 27 * k - 1, 6 * k - 1, '#6b432b', need=False)
                for x in range(21 * k, 27 * k, 3):
                    put(x, 1 * k + 2, x, 6 * k - 1, '#5a3824', need=False)
                put(21 * k, 1 * k + 1, 21 * k + 1, 6 * k - 1, '#8a5a3a', need=False)
                for y in (2 * k + 1, 4 * k + 2):
                    put(21 * k, y, 27 * k - 1, y, '#3a3f47', need=False)
                put(22 * k, 0, 26 * k - 1, 1 * k, '#55575b', need=False)
                put(23 * k, 0, 25 * k - 1, 1, '#787a7e', need=False)
                put(21 * k + 1, 6 * k, 21 * k + 2, 8 * k - 1, '#25232b', need=False)
                put(27 * k - 3, 6 * k, 27 * k - 2, 8 * k - 1, '#25232b', need=False)
                put(24 * k - 1, 6 * k, 24 * k, 8 * k - 1, '#25232b', need=False)
        elif style == 'sf':
            # Painted-lady trim under the eaves with dentils, and round the door.
            for y in range(4 * k, 28 * k):
                edge = np.nonzero(solid[y, 4 * k:28 * k] & ~solid[y - 1, 4 * k:28 * k])[0]
                if len(edge) > 10 * k:
                    a, b = 4 * k + edge.min(), 4 * k + edge.max()
                    put(a, y, b, y + 2, '#fbf7ee')
                    for x in range(a + 2, b - 1, 4):
                        put(x, y + 3, x + 1, y + 4, '#fbf7ee')
                    put(a, y + 3, b, y + 3, '#d9d2c2')
                    break
            put(14 * k - 1, 22 * k - 1, 18 * k, 22 * k + 2, '#fbf7ee')
            put(14 * k - 1, 22 * k + 3, 18 * k, 22 * k + 3, '#d9d2c2')
        elif style == 'california' and not tall:
            # Darker capping tiles along the ridge, each rounded on top.
            for x in range(6 * k, 26 * k, 4 * k):
                put(x, 5 * k, x + 2 * k - 1, 6 * k - 1, '#8f3f24')
                put(x + 1, 5 * k, x + 2 * k - 2, 5 * k, '#b25a37')

    for row in dt.STYLED_ROWS:
        for column in range(16):
            repaint(column * F, row * F, F, column + row)
            if row == 2:
                touches(column * F, row * F, column in dt.TALL_HOMES)
    for index, row in enumerate(home_rows):
        for column in range(16):
            repaint(column * F, row * F, F, column // 2 + index)
            touches(column * F, row * F, index > 0)
    repaint(0, len(dt.ROWS) * F, 2 * F, 1)
    return Image.fromarray(px)


class ScaledDraw:
    """ImageDraw that takes draw_tiles' 32 px coordinates and draws at k times the size."""
    def __init__(self, image, k):
        self.draw, self.k = ImageDraw.Draw(image), k

    def rectangle(self, box, fill=None):
        x0, y0, x1, y1 = box
        k = self.k
        self.draw.rectangle((x0 * k, y0 * k, x1 * k + k - 1, y1 * k + k - 1), fill=fill)

    def polygon(self, points, fill=None):
        self.draw.polygon([(x * self.k + self.k / 2, y * self.k + self.k / 2) for x, y in points], fill=fill)

    def line(self, points, fill=None):
        self.draw.line([(x * self.k + self.k / 2, y * self.k + self.k / 2) for x, y in points], fill=fill,
                       width=self.k)

    def ellipse(self, box, fill=None):
        x0, y0, x1, y1 = box
        self.draw.ellipse((x0 * self.k, y0 * self.k, x1 * self.k + self.k - 1, y1 * self.k + self.k - 1), fill=fill)


def build():
    F = UNIT
    k = F // 32
    rows = len(dt.ROWS) + 2 + len(dt.HOME_ROWS) + len(dt.INDUSTRY_ROWS) + 3
    sheet = Image.new('RGBA', (16 * F, rows * F), (0, 0, 0, 0))
    tile16 = lambda t, ground=False, roofs='flat': hd(t.image, F // t.size if t.size == 16 else 2 * F // t.size, ground, roofs)
    for row, tiles in enumerate(dt.ROWS):
        for column, tile in enumerate(tiles):
            if row == 3:
                kind = 'shop' if column in (0, 1, 3, 4, 7) else 'office'
                art = hd(dt.finish_lot(flat(tile.image, 32), kind, 1), k)
            elif row == 2:
                art = tile16(tile, roofs='pitched' if column in (0, 1, 2, 10) else 'flat')
            elif row == 4:
                art = tile16(tile, roofs='metal')
            elif row == 5:
                art = tile16(tile, roofs='pitched' if column in (2, 3, 4, 5, 9, 10) else 'flat')
            else:
                art = tile16(tile, ground=row < 2)
            sheet.paste(art, (column * F, row * F))
    for column, tile in enumerate(dt.BIG):
        sheet.paste(tile16(tile, roofs='pitched' if column in (2, 3) else 'flat'), (column * 2 * F, len(dt.ROWS) * F))
    for row, tiles in enumerate(dt.HOME_ROWS):
        for column, tile in enumerate(tiles):
            sheet.paste(hd(dt.finish_lot(flat(tile.image, 32), 'home', row + 1), k, roofs='pitched' if row == 0 else 'flat'),
                        (column * F, (len(dt.ROWS) + 2 + row) * F))
    for row, tiles in enumerate(dt.INDUSTRY_ROWS):
        kind = ('metal', 'food', 'warehouse')[row]
        for column, tile in enumerate(tiles):
            sheet.paste(hd(dt.finish_lot(flat(tile.image, 32), kind, column + 1), k, roofs='metal'),
                        (column * F, (len(dt.ROWS) + 2 + len(dt.HOME_ROWS) + row) * F))
    civic_row = len(dt.ROWS) + 2 + len(dt.HOME_ROWS) + len(dt.INDUSTRY_ROWS)
    for column, bank in enumerate((False, True)):
        # civic_front draws with ImageDraw at 32 px; capture its shapes on that grid.
        sheet.paste(hd(dt.civic_front(bank), k, roofs='pitched'), (column * F, civic_row * F))
    for column, kind in enumerate(('culture', 'coldstore', 'square', 'daycare', 'recycling', 'workshop', 'gas'), 2):
        sheet.paste(tile16(dt.civic_details(kind)), (column * F, civic_row * F))
    for column, which in enumerate(('park', 'farm', 'viaduct'), 9):
        icon = dt.Tile()
        icon.slab(1, 2, 14, 14, '#a1b979', '#718d55', '#455a42')
        if which == 'park':
            icon.rect(2, 10, 13, 11, '#cbbf9d')
            for x in (4, 10):
                icon.slab(x, 4, x + 2, 8, '#a4bd68', '#5b8749', '#3f6246')
                icon.rect(x + 1, 9, x + 1, 10, '#785b41')
        elif which == 'farm':
            for y in (4, 7, 10, 13):
                icon.rect(2, y, 13, y + 1, '#805e45')
                for x in (3, 6, 9, 12):
                    icon.rect(x, y, x, y, '#b8b66b')
        else:
            icon.slab(2, 5, 13, 9, '#d2d7d9', '#69717a', '#444850')
            icon.rect(4, 10, 5, 13, '#818487')
            icon.rect(10, 10, 11, 13, '#818487')
            icon.rect(5, 7, 10, 7, '#e1c589')
        sheet.paste(tile16(icon), (column * F, civic_row * F))
    sheet.paste(tile16(dt.family_clinic(), roofs='pitched'), (12 * F, civic_row * F))
    for column, kind in enumerate(('bakery', 'florist', 'cakeshop'), 13):
        sheet.paste(tile16(dt.corner_shop(kind), roofs='pitched'), (column * F, civic_row * F))
    for column, kind in enumerate(('community', 'eldercare', 'memorial')):
        sheet.paste(tile16(dt.life_building(kind), roofs='pitched'), (column * 2 * F, (civic_row + 1) * F))
    return sheet, F, k


if __name__ == '__main__':
    sheet, F, k = build()
    reference = Image.open(dt.OUT)
    if (sheet.width * 32 // F, sheet.height * 32 // F) != reference.size:
        raise SystemExit(f'layout differs from {dt.OUT.name}: {sheet.size} vs {reference.size}')
    DEST.mkdir(parents=True, exist_ok=True)
    sheet.save(DEST / 'city-detail.png', optimize=True)
    print('wrote city-detail.png')
    for style in dt.STYLES:
        restyle_hd(sheet, style, F, k).save(DEST / f'city-{style}-detail.png', optimize=True)
        print(f'wrote city-{style}-detail.png')
    (DEST / 'atlas.json').write_text(json.dumps({'density': F // 32, 'tileSize': F}, indent=2) + '\n')
