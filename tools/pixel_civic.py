"""Code-authored civic buildings, sharing the street's hand-placed pixel clusters and palette."""


def roller(c, x, y, w, h):
    c.slab((x, y, x + w, y + h), 'metal0', 'metal2', 'deep')
    for yy in range(y + 3, y + h - 1, 4):
        c.line((x + 2, yy, x + w - 2, yy), 'metal1')
        c.line((x + 2, yy + 1, x + w - 2, yy + 1), 'metal2')
    c.rect((x + w // 2 - 2, y + h - 4, x + w // 2 + 2, y + h - 3), 'deep')


def brick(c, box):
    x0, y0, x1, y1 = box
    for y in range(y0, y1, 5):
        c.line((x0, y, x1, y), 'tile0')
        for x in range(x0 + 3 + (y // 5 % 2) * 4, x1, 9):
            c.line((x, y + 1, x, min(y + 4, y1)), 'tile3')


def fire(Canvas):
    c = Canvas()
    c.slab((5, 22, 58, 58), 'tile2', 'tile3', 'tile0')
    brick(c, (7, 25, 56, 55))
    c.pitched_roof(3, 8, 60, 24)
    c.slab((6, 5, 17, 26), 'tile1', 'tile3', 'tile0')
    for yy in [9, 14, 19]:
        c.rect((9, yy, 14, yy + 2), 'deep')
        c.line((9, yy, 14, yy), 'wall3')
    c.slab((21, 24, 51, 35), 'wall2', 'wall3', 'wall0')
    c.poly([(35, 25), (40, 30), (39, 33), (32, 33), (30, 30), (34, 27), (33, 30)], 'tile0')
    c.poly([(35, 28), (38, 31), (36, 33), (33, 32), (34, 30)], 'gold')
    roller(c, 21, 36, 31, 20)
    c.door(8, 39, 8, 18)
    c.window(8, 29, 7, 6)
    c.rect((22, 48, 51, 55), 'deep')
    # A parked engine inside the open lower part of the bay; not a loose car in the lane.
    c.slab((27, 48, 46, 55), 'tile1', 'tile3', 'tile0')
    c.rect((29, 49, 43, 51), 'glass1')
    c.line((29, 49, 40, 49), 'glass3')
    c.rect((29, 54, 32, 57), 'ink'); c.rect((42, 54, 45, 57), 'ink')
    c.rect((30, 46, 34, 47), 'flower1'); c.rect((39, 46, 43, 47), 'glass2')
    c.slab((18, 58, 56, 60), 'metal1', 'metal3', 'metal0')
    return c.image


def police(Canvas):
    c = Canvas()
    c.slab((7, 17, 56, 57), 'wall2', 'wall3', 'wall0')
    c.rect((50, 18, 55, 56), 'wall1')
    c.flat_roof(7, 18)
    for x in [12, 40]: c.window(x, 23, 9, 10)
    c.poly([(25, 23), (38, 23), (38, 30), (35, 34), (31, 36), (27, 33), (25, 30)], 'ink')
    c.poly([(26, 24), (37, 24), (37, 30), (34, 33), (31, 35), (28, 32), (26, 30)], 'gold')
    c.poly([(28, 26), (35, 26), (35, 30), (31, 33), (28, 30)], 'body0')
    c.rect((30, 27, 32, 30), 'wall3'); c.rect((29, 28, 33, 29), 'wall3')
    c.slab((8, 36, 55, 42), 'body0', 'body2', 'deep')
    for x in [12, 17, 43, 48]: c.rect((x, 38, x + 2, 39), 'glass3')
    c.poly([(29, 36), (35, 36), (35, 40), (32, 43), (29, 40)], 'gold')
    c.line((31, 37, 33, 39), 'wall3')
    c.door(27, 43, 10, 14)
    c.window(12, 45, 8, 8); c.window(43, 45, 8, 8)
    c.slab((23, 57, 41, 60), 'metal1', 'metal3', 'metal0')
    c.planter(8, 53, 11); c.planter(45, 53, 10)
    c.line((57, 13, 57, 49), 'metal2', 2)
    c.poly([(58, 14), (63, 14), (62, 20), (58, 21)], 'body1')
    c.rect((59, 15, 61, 16), 'body3')
    return c.image


def clinic(Canvas):
    c = Canvas()
    c.slab((5, 25, 58, 57), 'wall2', 'wall3', 'wall0')
    c.slab((17, 10, 48, 32), 'wall2', 'wall3', 'wall0')
    c.slab((15, 7, 50, 11), 'metal1', 'metal3', 'metal0')
    c.slab((2, 23, 61, 27), 'body1', 'body3', 'body0')
    c.rect((29, 14, 35, 26), 'flower0'); c.rect((26, 18, 38, 22), 'flower0')
    c.rect((30, 15, 33, 24), 'flower1'); c.line((27, 19, 37, 19), 'flower1')
    for x in [9, 43]:
        c.window(x, 32, 11, 13)
        c.planter(x - 1, 48, 12)
    c.door(27, 39, 11, 18)
    c.slab((23, 35, 42, 39), 'body1', 'body3', 'body0')
    c.slab((23, 57, 42, 61), 'metal1', 'metal3', 'metal0')
    c.line((24, 59, 40, 59), 'wall3')
    c.slab((51, 48, 57, 56), 'wall3', 'wall3', 'wall0')
    c.rect((53, 50, 55, 53), 'flower0')
    return c.image


def water(Canvas):
    c = Canvas()
    c.slab((9, 55, 55, 60), 'wall1', 'wall3', 'wall0')
    # Braced support legs are visibly separate from the cylindrical reservoir.
    for x in [17, 43]: c.slab((x, 27, x + 4, 56), 'metal1', 'metal3', 'metal0')
    c.line((20, 34, 44, 53), 'metal0', 3); c.line((20, 53, 44, 34), 'metal2', 2)
    c.ellipse((9, 6, 55, 37), 'ink')
    c.rect((9, 17, 55, 26), 'ink')
    c.ellipse((11, 9, 53, 35), 'body0')
    c.rect((11, 16, 53, 25), 'body1')
    c.ellipse((11, 7, 53, 24), 'body1')
    c.ellipse((14, 9, 50, 20), 'body2')
    c.line((18, 11, 43, 11), 'body3', 2)
    c.rect((13, 19, 18, 27), 'body2')
    c.line((11, 26, 52, 26), 'metal2', 2)
    c.line((14, 30, 50, 30), 'metal0')
    c.slab((46, 19, 50, 55), 'metal0', 'metal2', 'deep')
    for y in range(23, 53, 4): c.line((45, y, 51, y), 'metal2')
    c.line((15, 47, 9, 47, 9, 54), 'body0', 4)
    c.ellipse((6, 44, 12, 50), 'ink'); c.ellipse((7, 45, 11, 49), 'tile2')
    c.line((9, 45, 9, 49), 'tile3')
    return c.image


def power(Canvas):
    c = Canvas()
    c.slab((4, 30, 59, 58), 'tile1', 'tile3', 'tile0')
    brick(c, (6, 33, 57, 56))
    for x, height in [(10, 5), (24, 10)]:
        c.slab((x, height, x + 7, 33), 'metal1', 'metal3', 'metal0')
        c.slab((x - 1, height, x + 8, height + 3), 'metal0', 'metal2', 'deep')
        c.rect((x + 1, height + 10, x + 5, height + 13), 'wall2')
    c.poly([(3, 33), (9, 22), (59, 22), (62, 33)], 'ink')
    c.poly([(6, 31), (11, 24), (57, 24), (59, 31)], 'metal1')
    for x in range(14, 58, 8): c.line((x, 25, x - 3, 30), 'metal3')
    for x in [9, 22]: c.window(x, 37, 9, 9)
    roller(c, 40, 38, 13, 18)
    c.slab((22, 49, 34, 57), 'metal1', 'metal3', 'metal0')
    c.poly([(29, 49), (25, 53), (29, 53), (27, 57), (33, 52), (29, 52)], 'gold')
    c.line((6, 58, 58, 58), 'metal2')
    return c.image


def warehouse(Canvas):
    c = Canvas()
    c.slab((5, 25, 58, 57), 'wall1', 'wall3', 'wall0')
    c.poly([(3, 26), (10, 12), (53, 12), (61, 26)], 'ink')
    c.poly([(6, 24), (12, 14), (51, 14), (58, 24)], 'metal1')
    for x in range(14, 53, 7): c.line((x, 15, x - 5, 23), 'metal3')
    c.line((7, 25, 57, 25), 'metal0', 2)
    for x in [9, 20, 42]: c.window(x, 29, 9, 6)
    roller(c, 23, 38, 28, 18)
    c.door(9, 40, 9, 16)
    c.slab((19, 56, 56, 60), 'metal0', 'metal2', 'deep')
    for x in [21, 51]:
        c.rect((x, 46, x + 2, 55), 'gold')
        c.line((x, 49, x + 2, 51), 'ink', 2)
    # Unequal crate sizes and exposed grain keep this from reading as a plain cuboid.
    for x, y, w, h in [(3, 49, 10, 9), (11, 53, 10, 8)]:
        c.slab((x, y, x + w, y + h), 'wood2', 'wood3', 'wood0')
        c.line((x + 2, y + 2, x + w - 2, y + h - 2), 'wood0')
        c.line((x + 2, y + h - 2, x + w - 2, y + 2), 'wood1')
    return c.image


DRAWERS = {'fire': fire, 'police': police, 'clinic': clinic, 'water': water, 'power': power, 'warehouse': warehouse}
