"""Hand-placed 128px landmarks: twice the street building grid and twice its world footprint."""


def paving(c):
    c.slab((4, 112, 123, 123), 'metal1', 'metal3', 'metal0')
    for x in range(12, 122, 16): c.line((x, 114, x, 120), 'metal2')
    c.line((6, 119, 121, 119), 'metal0')


def steps(c, x0, x1, top=105):
    for i in range(4):
        c.slab((x0 - i * 2, top + i * 3, x1 + i * 2, top + i * 3 + 3), 'metal1', 'metal3', 'metal0')


def roof_plant(c, x, y):
    c.slab((x, y, x + 13, y + 8), 'metal1', 'metal3', 'metal0')
    for yy in [y + 3, y + 5]: c.line((x + 3, yy, x + 10, yy), 'metal0')
    c.line((x + 13, y + 5, x + 18, y + 5, x + 18, y + 10), 'metal2', 2)


def hospital(Canvas):
    c = Canvas(128, 128)
    paving(c)
    # Two lower wings and a taller ward, with a continuous entrance canopy.
    c.slab((8, 48, 119, 109), 'wall2', 'wall3', 'wall0')
    c.rect((112, 49, 118, 108), 'wall1')
    c.slab((36, 20, 91, 108), 'wall2', 'wall3', 'wall0')
    c.rect((84, 22, 90, 106), 'wall1')
    c.slab((33, 16, 94, 22), 'metal1', 'metal3', 'metal0')
    c.slab((6, 44, 34, 50), 'body1', 'body3', 'body0')
    c.slab((93, 44, 121, 50), 'body1', 'body3', 'body0')
    roof_plant(c, 12, 35); roof_plant(c, 100, 35)
    c.slab((44, 8, 62, 16), 'metal1', 'metal3', 'metal0')
    for x in [46, 51, 56]: c.line((x, 10, x, 14), 'metal0')
    c.slab((68, 6, 84, 16), 'body0', 'body2', 'deep')
    c.line((71, 9, 81, 9), 'glass3')
    c.rect((60, 26, 68, 43), 'flower0'); c.rect((55, 31, 73, 38), 'flower0')
    c.rect((61, 27, 65, 41), 'flower1'); c.line((56, 32, 72, 32), 'flower1')
    for y in [49, 65, 81]:
        for x in [43, 59, 75]: c.window(x, y, 9, 11)
        c.line((40, y + 14, 85, y + 14), 'wall3')
    for x in [14, 100]:
        for y in [57, 75]: c.window(x, y, 13, 11)
    c.slab((40, 94, 88, 99), 'body1', 'body3', 'body0')
    c.door(51, 99, 12, 12); c.door(65, 99, 12, 12)
    c.line((63, 100, 63, 109), 'metal3')
    steps(c, 45, 83, 109)
    c.slab((12, 93, 31, 109), 'deep', 'metal2', 'ink')
    c.slab((14, 101, 28, 109), 'wall3', 'wall3', 'wall0')
    c.rect((16, 102, 25, 104), 'glass1')
    c.rect((20, 105, 22, 108), 'flower0')
    c.rect((18, 106, 24, 107), 'flower0')
    c.rect((15, 109, 18, 111), 'ink'); c.rect((25, 109, 28, 111), 'ink')
    c.planter(7, 109, 17); c.planter(101, 109, 18)
    c.slab((98, 95, 115, 99), 'body0', 'body2', 'deep')
    c.line((101, 97, 111, 97), 'glass3')
    return c.image


def university(Canvas):
    c = Canvas(128, 128)
    paving(c)
    c.slab((8, 57, 119, 107), 'tile1', 'tile3', 'tile0')
    c.pitched_roof(4, 40, 123, 60)
    for y in [66, 84]:
        for x in [14, 29, 85, 101]: c.window(x, y, 10, 12)
    c.slab((43, 28, 84, 108), 'wall2', 'wall3', 'wall0')
    c.rect((78, 29, 83, 107), 'wall1')
    c.slab((46, 16, 81, 35), 'wall2', 'wall3', 'wall0')
    c.pitched_roof(40, 5, 87, 20)
    c.ellipse((54, 23, 73, 42), 'ink')
    c.ellipse((56, 25, 71, 40), 'wall3')
    c.line((64, 28, 64, 33, 69, 33), 'wood0', 2)
    for x, y in [(62, 26), (62, 38), (57, 31), (69, 31)]: c.rect((x, y, x + 1, y + 1), 'wood1')
    c.slab((42, 44, 85, 49), 'wood1', 'wood3', 'wood0')
    for x in [49, 65]: c.window(x, 55, 13, 15)
    c.slab((48, 76, 79, 81), 'wall2', 'wall3', 'wall0')
    # Pointed entrance arch, timber panels and two independently highlighted columns.
    c.poly([(51, 106), (51, 88), (63, 80), (76, 88), (76, 106)], 'ink')
    c.poly([(54, 106), (54, 89), (63, 83), (73, 89), (73, 106)], 'wood0')
    c.rect((56, 93, 62, 104), 'wood1'); c.rect((65, 93, 71, 104), 'wood1')
    c.line((61, 97, 61, 100), 'gold'); c.line((66, 97, 66, 100), 'gold')
    for x in [46, 78]: c.slab((x, 82, x + 3, 107), 'wall2', 'wall3', 'wall0')
    steps(c, 46, 81, 108)
    for x in [9, 93]:
        c.slab((x, 103, x + 23, 110), 'wood1', 'wood3', 'wood0')
        c.line((x + 2, 105, x + 21, 105), 'wood0')
    c.planter(5, 110, 17); c.planter(105, 110, 17)
    # Pennants and a connected ivy cluster; no random speckle overlay.
    c.line((93, 25, 93, 54), 'metal2', 2)
    c.poly([(94, 26), (105, 28), (94, 34)], 'body1')
    c.line((95, 28, 100, 29), 'body3')
    c.line((113, 100, 112, 91, 116, 83, 114, 76), 'leaf0', 3)
    for x, y in [(111, 96), (114, 87), (112, 80)]:
        c.rect((x - 2, y, x + 2, y + 3), 'leaf1'); c.rect((x - 1, y, x + 1, y + 1), 'leaf2')
    return c.image


def museum(Canvas):
    c = Canvas(128, 128)
    paving(c)
    c.slab((10, 40, 117, 103), 'wall1', 'wall3', 'wall0')
    c.rect((17, 53, 110, 97), 'wood0')
    for x in [24, 56, 88]: c.door(x, 64, 15, 34)
    c.poly([(6, 40), (63, 12), (121, 40)], 'ink')
    c.poly([(12, 37), (63, 16), (115, 37)], 'wall2')
    c.poly([(25, 33), (63, 21), (101, 33)], 'wall1')
    c.line((18, 36, 110, 36), 'wall3', 2)
    c.ellipse((57, 24, 69, 35), 'wood1')
    c.ellipse((60, 25, 65, 30), 'wall3')
    c.slab((5, 40, 122, 48), 'wall2', 'wall3', 'wall0')
    # Fluted columns with distinct lit left planes and cool right recesses.
    for x in [15, 36, 79, 100]:
        c.slab((x, 51, x + 12, 96), 'wall2', 'wall3', 'wall0')
        c.line((x + 4, 55, x + 4, 93), 'wall3')
        c.line((x + 9, 55, x + 9, 94), 'wall0')
        c.slab((x - 2, 48, x + 14, 53), 'wall2', 'wall3', 'wall0')
        c.slab((x - 2, 95, x + 14, 100), 'wall2', 'wall3', 'wall0')
    c.slab((8, 100, 119, 104), 'wall2', 'wall3', 'wall0')
    steps(c, 15, 112, 104)
    for x, colour in [(5, 'body1'), (116, 'flower0')]:
        c.slab((x, 56, x + 6, 85), colour, 'wall3', 'deep')
        c.rect((x + 2, 62, x + 4, 73), 'gold')
    c.planter(4, 113, 15); c.planter(107, 113, 15)
    return c.image


def stadium(Canvas):
    c = Canvas(128, 128)
    paving(c)
    # Each ring is a material band around the bowl; grass is a flat field rather than a lit centre.
    c.ellipse((5, 17, 122, 112), 'ink')
    c.ellipse((7, 19, 120, 110), 'metal0')
    c.ellipse((9, 21, 118, 106), 'wall1')
    c.ellipse((13, 25, 114, 101), 'tile0')
    c.ellipse((17, 29, 110, 96), 'tile2')
    c.ellipse((21, 33, 106, 92), 'tile1')
    c.ellipse((25, 37, 102, 88), 'wall2')
    c.ellipse((28, 40, 99, 85), 'tile0')
    c.ellipse((32, 44, 95, 81), 'leaf0')
    c.ellipse((34, 46, 93, 79), 'leaf1')
    # A pitched football field is still readable in the shallow overhead view.
    c.rect((39, 50, 88, 75), 'leaf2')
    c.rect((39, 50, 88, 50), 'wall3'); c.rect((39, 75, 88, 75), 'wall3')
    c.line((39, 50, 39, 75, 88, 75, 88, 50), 'wall3')
    c.line((64, 51, 64, 74), 'wall3')
    c.ellipse((57, 57, 71, 69), 'wall3'); c.ellipse((59, 59, 69, 67), 'leaf2')
    c.line((40, 56, 47, 56, 47, 69, 40, 69), 'wall3')
    c.line((87, 56, 80, 56, 80, 69, 87, 69), 'wall3')
    for x in [30, 44, 80, 94]: c.line((x, 29, x + (2 if x < 64 else -2), 37), 'wall0', 2)
    c.slab((35, 15, 91, 29), 'metal0', 'metal2', 'deep')
    c.rect((39, 18, 87, 26), 'deep')
    for x in [45, 69]:
        c.line((x, 20, x + 5, 20, x + 5, 24, x, 24, x, 20), 'gold')
    c.rect((61, 21, 63, 23), 'metal3')
    for x in [8, 106]:
        c.slab((x, 8, x + 4, 66), 'metal1', 'metal3', 'metal0')
        c.slab((x - 6, 5, x + 11, 16), 'metal0', 'metal2', 'deep')
        for dx in [-3, 3, 9]: c.rect((x + dx, 8, x + dx + 2, 12), 'wall3')
    c.slab((39, 97, 89, 112), 'metal1', 'metal3', 'metal0')
    for x in [45, 60, 75]:
        c.rect((x, 101, x + 8, 111), 'deep')
        c.line((x + 3, 103, x + 3, 109), 'metal2')
    c.line((44, 115, 85, 115), 'metal3', 2)
    return c.image


DRAWERS = {'hospital': hospital, 'university': university, 'museum': museum, 'stadium': stadium}
