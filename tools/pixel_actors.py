"""Integer-pixel actor anatomy and one authoritative voxel structure per vehicle.

All four vehicle views and the actual layer strip are projected from this same volume.
Left-facing people are drawn with their own pose and screen-space lighting, not image flips.
"""
import numpy as np
from PIL import Image


def draw_person(Canvas, direction, phase, carry=True):
    c = Canvas(32, 48)
    side = direction in (0, 2)
    west = direction == 2
    walk = phase > 0
    step = [0, -5, -3, 0, 5, 3, 0][phase]
    bob = [0, 0, 1, -1, 0, 1, -1][phase]
    near_lift = [0, 0, 0, 2, 0, 0, 1][phase]
    far_lift = [0, 0, 1, 0, 0, 2, 0][phase]

    def point(x, y):
        return (31 - x if west else x, y)

    def line(points, colour, width=1):
        c.line([point(x, y) for x, y in points], colour, width)

    def rect(box, colour):
        x0, y0, x1, y1 = box
        c.rect((31 - x1, y0, 31 - x0, y1) if west else box, colour)

    def polygon(points, colour):
        c.poly([point(x, y) for x, y in points], colour)

    if side:
        # Hip -> knee -> ankle. The far leg passes behind the near leg, rather than stretching.
        for hip, offset, lift, colour in [(15, -step, far_lift, 'wood0'), (18, step, near_lift, 'wood2')]:
            ankle = 16 + offset
            knee = round((hip + ankle) / 2) + (2 if lift else 0)
            line([(hip, 28), (knee, 35 - lift), (ankle, 41 - lift)], 'ink', 5)
            line([(hip, 29), (knee, 35 - lift), (ankle, 40 - lift)], colour, 3)
            rect((ankle - 1, 41 - lift, ankle + 3, 43 - lift), 'ink')
        # Far arm and narrow profile torso. The shoulder bag sits behind the body.
        arm = -step // 2
        line([(14, 20 + bob), (12 + arm, 26 + bob), (13 + arm, 31 + bob)], 'body0', 3)
        polygon([(12, 19 + bob), (18, 17 + bob), (21, 20 + bob), (21, 31 + bob), (11, 31 + bob)], 'ink')
        rect((13, 20 + bob, 20, 29 + bob), 'body1')
        # Lighting stays on the screen's upper-left for both facing directions.
        c.line((11 if west else 13, 20 + bob, 11 if west else 13, 27 + bob), 'body2', 2)
        polygon([(17, 18 + bob), (20, 19 + bob), (19, 22 + bob)], 'wall3')
        polygon([(13, 6 + bob), (20, 5 + bob), (23, 8 + bob), (23, 11 + bob), (25, 12 + bob),
                 (23, 14 + bob), (22, 17 + bob), (16, 17 + bob), (13, 13 + bob)], 'ink')
        rect((15, 8 + bob, 22, 14 + bob), 'skin1')
        polygon([(20, 8 + bob), (22, 9 + bob), (22, 12 + bob), (24, 12 + bob), (22, 13 + bob), (21, 16 + bob), (18, 15 + bob)], 'skin2')
        rect((21, 10 + bob, 22, 11 + bob), 'ink')
        rect((15, 12 + bob, 16, 13 + bob), 'skin0')
        polygon([(12, 12 + bob), (11, 7 + bob), (14, 3 + bob), (19, 3 + bob), (23, 6 + bob),
                 (22, 9 + bob), (19, 7 + bob), (16, 9 + bob), (15, 13 + bob)], 'wood0')
        # Do not mirror the highlight together with the geometry.
        c.line((12 if not west else 10, 6 + bob, 17 if not west else 15, 4 + bob), 'wood2', 2)
        if carry:
            line([(17, 19 + bob), (13, 29 + bob)], 'wood0', 2)
            rect((10, 28 + bob, 16, 34 + bob), 'wood0')
            rect((11, 29 + bob, 15, 33 + bob), 'wood1')
            rect((12, 30 + bob, 14, 30 + bob), 'wood3')
        line([(20, 20 + bob), (21 + step // 2, 25 + bob), (20 + step // 2, 30 + bob)], 'body1', 3)
        rect((19 + step // 2, 29 + bob, 21 + step // 2, 31 + bob), 'skin1')
    else:
        # Front/back have foreshortened leg motion and a clear passing pose.
        for x, lift, forward, colour in [(12, far_lift, step, 'wood0'), (19, near_lift, -step, 'wood2')]:
            end_y = 42 - lift - (1 if forward < 0 else 0)
            end_x = x + (1 if forward > 2 else -1 if forward < -2 else 0)
            c.line([(x, 28), (x, 35), (end_x, end_y - 1)], 'ink', 5)
            c.line([(x, 29), (x, 35), (end_x, end_y - 1)], colour, 3)
            c.rect((end_x - 2, end_y - 1, end_x + 2, end_y + 1), 'ink')
        c.slab((9, 18 + bob, 22, 31 + bob), 'body1', 'body2', 'body0')
        c.rect((11, 7 + bob, 21, 17 + bob), 'ink')
        if direction == 1:
            c.rect((12, 8 + bob, 20, 15 + bob), 'skin1')
            c.rect((12, 8 + bob, 18, 14 + bob), 'skin2')
            c.rect((13, 11 + bob, 14, 12 + bob), 'ink')
            c.rect((18, 11 + bob, 19, 12 + bob), 'ink')
            c.line((15, 15 + bob, 17, 15 + bob), 'skin0')
            c.poly([(10, 9 + bob), (11, 5 + bob), (15, 3 + bob), (20, 4 + bob), (23, 7 + bob),
                    (21, 10 + bob), (18, 7 + bob), (15, 9 + bob), (12, 8 + bob)], 'wood0')
            c.line((12, 6 + bob, 16, 4 + bob, 19, 5 + bob), 'wood2', 2)
            c.poly([(11, 19 + bob), (16, 22 + bob), (20, 19 + bob)], 'wall3')
            c.line((16, 23 + bob, 16, 29 + bob), 'body3')
            strap, bag_x = [(11, 19 + bob), (22, 30 + bob)], 20
        else:
            # Full back of the head and jacket: no front zipper, eyes or shirt collar.
            c.poly([(10, 13 + bob), (10, 7 + bob), (13, 3 + bob), (19, 3 + bob), (22, 6 + bob),
                    (22, 14 + bob), (19, 16 + bob), (13, 16 + bob)], 'wood0')
            c.rect((12, 7 + bob, 20, 12 + bob), 'wood1')
            c.line((12, 6 + bob, 17, 4 + bob), 'wood2', 2)
            c.rect((12, 15 + bob, 20, 18 + bob), 'body0')
            c.line((12, 20 + bob, 19, 20 + bob), 'body2')
            strap, bag_x = [(21, 19 + bob), (10, 30 + bob)], 7
        for x, shift in [(9, step // 3), (23, -step // 3)]:
            c.line([(x, 20 + bob), (x + shift, 27 + bob), (x + shift, 30 + bob)], 'body0' if x == 23 else 'body1', 3)
            c.rect((x + shift - 1, 29 + bob, x + shift + 1, 31 + bob), 'skin1')
        if carry:
            c.line(strap, 'wood0', 2)
            c.slab((bag_x, 29 + bob, bag_x + 5, 35 + bob), 'wood1', 'wood3', 'wood0')
    return c.image


def vehicle_volume(palette, truck=False):
    """z, longitudinal y (nose +y), lateral x; every feature uses this one coordinate system."""
    height, length, width = (28, 64, 28) if truck else (24, 44, 24)
    volume = np.zeros((height, length, width, 4), dtype=np.uint8)
    colours = {k: np.array(tuple(bytes.fromhex(v[1:])) + (255,), dtype=np.uint8) for k, v in palette.items()}

    def box(x0, x1, y0, y1, z0, z1, colour):
        volume[z0:z1 + 1, y0:y1 + 1, x0:x1 + 1] = colours[colour]

    def wheels(axles, radius):
        for axle in axles:
            for z in range(1, 2 * radius + 1):
                for y in range(axle - radius, axle + radius + 1):
                    if (y - axle) ** 2 + (z - radius) ** 2 <= radius ** 2:
                        for x in [0, 1, 2, width - 3, width - 2, width - 1]:
                            volume[z, y, x] = colours['ink']
                            if x in [0, width - 1] and (y - axle) ** 2 + (z - radius) ** 2 <= (radius - 2) ** 2:
                                volume[z, y, x] = colours['metal2' if z >= radius else 'metal0']

    box(4, width - 5, 3, length - 4, 3, 5, 'deep')
    wheels([11, 51] if truck else [10, 33], 4 if truck else 3)
    if truck:
        box(3, width - 4, 2, 43, 7, 25, 'wall2')
        box(3, 3, 2, 43, 8, 24, 'wall1')
        box(width - 4, width - 4, 2, 43, 8, 24, 'wall0')
        box(4, width - 5, 3, 42, 26, 26, 'wall3')
        for y in [7, 16, 25, 34, 41]:
            box(5, width - 6, y, y, 27, 27, 'wall1')
        for z in range(8, 24):
            box(5, width - 6, 2, 2, z, z, 'metal1' if z % 3 == 0 else 'wall1')
        box(3, width - 4, 44, 61, 6, 12, 'body1')
        box(3, width - 4, 44, 61, 6, 6, 'body0')
        for z in range(13, 21):
            nose = 60 - (z - 13) // 2
            box(4, width - 5, 45, nose, z, z, 'body1')
            if z < 20:
                box(6, width - 7, nose, nose, z, z, 'glass1')
                for x in [4, width - 5]:
                    box(x, x, 48, nose - 2, z, z, 'glass0')
            else:
                box(5, width - 6, 46, nose - 1, z, z, 'body2')
        box(3, width - 4, 61, 62, 5, 6, 'metal0')
        for x in [5, width - 8]:
            box(x, x + 2, 61, 61, 9, 10, 'wall3')
            box(x, x + 2, 2, 2, 7, 8, 'tile2')
    else:
        for z in range(5, 12):
            inset = 1 if z >= 10 else 0
            for y in range(2, length - 2):
                cut = 2 if y < 5 or y >= length - 5 else 0
                box(2 + cut + inset, width - 3 - cut - inset, y, y, z, z, 'body0' if z < 7 else 'body1')
        # Separate bonnet and boot deck, with no glass painted on their upper surfaces.
        box(5, width - 6, 32, 40, 12, 12, 'body2')
        box(5, width - 6, 3, 9, 12, 12, 'body1')
        for z in range(12, 21):
            x0 = 4 + max(0, z - 15) // 3
            x1 = width - 1 - x0
            rear = 10 + (z - 12) // 2
            nose = 31 - (z - 12) // 2
            box(x0, x1, rear, nose, z, z, 'body1')
            if 13 <= z <= 18:
                box(x0 + 1, x1 - 1, nose, nose, z, z, 'glass1')
                box(x0 + 1, x1 - 1, rear, rear, z, z, 'glass0')
                for x in [x0, x1]:
                    box(x, x, rear + 2, nose - 2, z, z, 'glass1' if x == x0 else 'glass0')
                    box(x, x, 21, 21, z, z, 'body0')
            if z >= 19:
                box(x0, x1, rear, nose, z, z, 'body2')
                box(x0, x0, rear + 1, nose - 1, z, z, 'body3')
        box(7, 11, 28, 28, 18, 18, 'glass3')
        for x in [3, width - 4]:
            box(x, x, 22, 22, 7, 10, 'body0')
            box(x, x, 24, 26, 10, 10, 'metal2')
        box(5, width - 6, 1, 2, 5, 6, 'metal0')
        box(5, width - 6, length - 3, length - 2, 5, 6, 'metal0')
        for x in [4, width - 8]:
            box(x, x + 3, 40, 40, 8, 9, 'wall3')
            box(x, x + 2, 3, 3, 8, 9, 'tile2')
    return volume


def orthographic_views(volume):
    height, length, width = volume.shape[:3]
    top = np.zeros((length, width, 4), dtype=np.uint8)
    side = np.zeros((height, length, 4), dtype=np.uint8)
    front = np.zeros((height, width, 4), dtype=np.uint8)
    back = np.zeros((height, width, 4), dtype=np.uint8)
    for z in range(height):
        mask = volume[z, ..., 3] > 0
        top[mask] = volume[z][mask]
        for x in range(width - 1, -1, -1):
            for y in range(length):
                if volume[z, y, x, 3]:
                    side[height - 1 - z, length - 1 - y] = volume[z, y, x]
        for y in range(length):
            for x in range(width):
                if volume[z, y, x, 3]:
                    front[height - 1 - z, x] = volume[z, y, x]
        for y in range(length - 1, -1, -1):
            for x in range(width):
                if volume[z, y, x, 3]:
                    back[height - 1 - z, width - 1 - x] = volume[z, y, x]
    return [Image.fromarray(view) for view in [top, side, front, back]]
