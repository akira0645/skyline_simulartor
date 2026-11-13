"""Draws src/assets/city.png, the game's own 16x16 tiles.

    python tools/draw_tiles.py

Sheet layout (in tiles), mirrored by src/rendering/TileRenderer.ts:
  row 0      roads, column = neighbour mask (north 1, east 2, south 4, west 8)
  row 1      empty lots: residential, commercial, industrial
  rows 2-4   buildings: residential, commercial, industrial. Columns 0-3 are the original
             four; after them come the larger buildings of levels 2 and 3, and repaints of
             all of them so that neighbours of one level do not look alike. Which column
             belongs to which level is the BUILDING_ART table in TileRenderer.ts.
  row 5      civic buildings: power plant, water tower, fire station, police station,
             school, clinic, bus stop, metro station (CIVIC_ART in TileRenderer.ts)
  rows 6-7   buildings two tiles wide and two tall: the housing complex
Buildings are transparent around their footprint and are drawn over their lot.
Light comes from the top left; shadows fall to the bottom right.
"""
from pathlib import Path
from PIL import Image

T = 16
VARIANTS = 4
OUT = Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'city.png'


def rgba(color):
    if isinstance(color, tuple):
        return color
    return tuple(int(color[i:i + 2], 16) for i in (1, 3, 5)) + (255,)


class Tile:
    def __init__(self, background=None, size=T):
        self.size = size
        self.image = Image.new('RGBA', (size, size), rgba(background) if background else (0, 0, 0, 0))

    def rect(self, x0, y0, x1, y1, color):
        """Fills an inclusive rectangle, clipped to the tile."""
        for y in range(max(0, y0), min(self.size - 1, y1) + 1):
            for x in range(max(0, x0), min(self.size - 1, x1) + 1):
                self.image.putpixel((x, y), rgba(color))

    def shadow(self, x0, y0, x1, y1):
        """Shadow along the right and bottom of a footprint."""
        dark = (16, 17, 20, 80)
        self.rect(x1 + 1, y0 + 2, x1 + 1, y1 + 1, dark)
        self.rect(x0 + 2, y1 + 1, x1, y1 + 1, dark)

    def slab(self, x0, y0, x1, y1, light, mid, dark):
        """A flat surface lit from the top left."""
        self.rect(x0, y0, x1, y1, mid)
        self.rect(x0, y0, x1, y0, light)
        self.rect(x0, y0, x0, y1, light)
        self.rect(x0, y1, x1, y1, dark)
        self.rect(x1, y0, x1, y1, dark)

    def recolour(self, colours):
        """A copy with some colours swapped: the same building in another paint."""
        swaps = {rgba(old): rgba(new) for old, new in colours.items()}
        copy = Tile()
        copy.image = self.image.copy()
        for y in range(T):
            for x in range(T):
                pixel = copy.image.getpixel((x, y))
                if pixel in swaps:
                    copy.image.putpixel((x, y), swaps[pixel])
        return copy

    def window(self, x0, y0, x1, y1):
        self.rect(x0, y0, x1, y1, GLASS)
        self.rect(x0, y0, x1, y0, GLASS_LIGHT)


# --- Palette. Asphalt, paper and the greens are shared with the Kenney tiles we keep.
ASPHALT, ASPHALT_DARK, ASPHALT_LIGHT = '#404040', '#383838', '#484848'
PAPER = '#d6dbe6'
PAVEMENT, KERB = '#b3b6bc', '#84878c'
GLASS, GLASS_LIGHT, GLASS_DARK = '#6fa8d0', '#a9d2ea', '#3f6f96'
LEAF_LIGHT, LEAF, LEAF_DARK = '#88bd32', '#7bad2c', '#648c32'
STEEL_LIGHT, STEEL, STEEL_DARK, STEEL_DEEP = '#c5c8ce', '#a6a9ae', '#787a7e', '#55575b'
WOOD, WOOD_DARK = '#8a5a3a', '#6b432b'

LOTS = {
    'residential': ('#7cc070', '#6fb565', '#8fcb80'),
    'commercial': ('#9db6cf', '#88a2bd', '#b1c6da'),
    'industrial': ('#cdb672', '#b9a160', '#dcc88a'),
}


# --- Roads
NORTH, EAST, SOUTH, WEST = 1, 2, 4, 8


def road(mask):
    t = Tile(ASPHALT)
    for x0, y0, x1, y1, color in ((2, 4, 3, 4, ASPHALT_DARK), (11, 3, 12, 3, ASPHALT_LIGHT),
                                  (4, 11, 5, 11, ASPHALT_LIGHT), (10, 12, 11, 12, ASPHALT_DARK)):
        t.rect(x0, y0, x1, y1, color)

    n, e, s, w = (bool(mask & side) for side in (NORTH, EAST, SOUTH, WEST))
    # Pavement on every side without a neighbouring road, kerb just inside it.
    if not n: t.rect(0, 0, 15, 0, PAVEMENT)
    if not s: t.rect(0, 15, 15, 15, PAVEMENT)
    if not w: t.rect(0, 0, 0, 15, PAVEMENT)
    if not e: t.rect(15, 0, 15, 15, PAVEMENT)
    left, right = (0 if w else 1), (15 if e else 14)
    top, bottom = (0 if n else 1), (15 if s else 14)
    if not n: t.rect(left, 1, right, 1, KERB)
    if not s: t.rect(left, 14, right, 14, KERB)
    if not w: t.rect(1, top, 1, bottom, KERB)
    if not e: t.rect(14, top, 14, bottom, KERB)
    # Where two roads meet, the pavement turns the corner between them.
    for a, b, x, y in ((n, w, 0, 0), (n, e, 14, 0), (s, w, 0, 14), (s, e, 14, 14)):
        if a and b:
            t.rect(x, y, x + 1, y + 1, KERB)
            t.rect(0 if x == 0 else 15, 0 if y == 0 else 15, 0 if x == 0 else 15, 0 if y == 0 else 15, PAVEMENT)

    arms = n + e + s + w
    if arms <= 2:
        # Centre line: one dash per arm, so straights, bends and dead ends all join up.
        if n: t.rect(7, 2, 8, 5, PAPER)
        if s: t.rect(7, 10, 8, 13, PAPER)
        if w: t.rect(2, 7, 5, 8, PAPER)
        if e: t.rect(10, 7, 13, 8, PAPER)
    else:
        # Junctions get a stop line across each arm instead.
        if n: t.rect(3, 1, 12, 1, PAPER)
        if s: t.rect(3, 14, 12, 14, PAPER)
        if w: t.rect(1, 3, 1, 12, PAPER)
        if e: t.rect(14, 3, 14, 12, PAPER)
    return t


# --- Empty lots
def residential_lot():
    base, dark, light = LOTS['residential']
    t = Tile(base)
    for x in (0, 8):                       # mown stripes
        t.rect(x, 0, x + 3, 15, light)
    for x, y in ((5, 3), (13, 6), (2, 11), (10, 13)):   # tufts
        t.rect(x, y, x + 1, y, dark)
    return t


def commercial_lot():
    base, dark, light = LOTS['commercial']
    t = Tile(base)
    for offset in (0, 8):                  # paving slabs
        t.rect(offset, 0, offset, 15, light)
        t.rect(0, offset, 15, offset, light)
        t.rect(offset + 7, 0, offset + 7, 15, dark)
        t.rect(0, offset + 7, 15, offset + 7, dark)
    return t


def industrial_lot():
    base, dark, light = LOTS['industrial']
    t = Tile(base)
    for x, y in ((2, 2), (11, 4), (6, 8), (13, 11), (3, 13)):   # gravel
        t.rect(x, y, x + 1, y, dark)
    for x, y in ((7, 3), (1, 7), (10, 9), (8, 14)):
        t.rect(x, y, x + 1, y, light)
    return t


# --- Residential buildings
def house_red():
    t = Tile()
    t.shadow(1, 2, 14, 14)
    t.rect(1, 2, 14, 9, '#b9584a')         # roof, ridge along the top
    t.rect(1, 2, 14, 2, '#d77c67')
    t.rect(1, 6, 14, 6, '#a84c40')
    t.rect(1, 9, 14, 9, '#8e3d35')
    t.rect(10, 3, 11, 5, '#7d4a3e')        # chimney
    t.rect(10, 3, 11, 3, STEEL_LIGHT)
    t.rect(1, 10, 14, 14, '#ead9b5')       # wall
    t.rect(14, 10, 14, 14, '#cdb994')
    t.rect(7, 12, 8, 14, WOOD)
    t.window(3, 11, 4, 12)
    t.window(11, 11, 12, 12)
    return t


def house_blue():
    t = Tile()
    t.shadow(1, 1, 14, 14)
    t.rect(1, 1, 7, 8, '#5f86b5')          # roof, ridge down the middle
    t.rect(8, 1, 14, 8, '#46689a')
    t.rect(7, 1, 8, 8, '#8fb2d6')
    t.rect(1, 8, 6, 8, '#46689a')
    t.rect(9, 8, 14, 8, '#35517c')
    t.rect(1, 9, 14, 14, '#e6e1d3')        # wall
    t.rect(14, 9, 14, 14, '#c4bfb2')
    t.rect(3, 11, 4, 14, '#b9584a')        # door
    t.window(8, 11, 12, 12)
    return t


def cottage():
    t = Tile()
    t.shadow(1, 3, 9, 14)
    t.rect(1, 3, 9, 9, '#d08a3c')          # roof
    t.rect(1, 3, 9, 3, '#e8ad5a')
    t.rect(1, 9, 9, 9, '#a9682a')
    t.rect(1, 10, 9, 14, '#ead9b5')        # wall
    t.rect(9, 10, 9, 14, '#cdb994')
    t.rect(3, 12, 4, 14, WOOD)
    t.window(6, 11, 7, 12)
    t.rect(12, 8, 13, 8, LEAF)             # garden bush
    t.rect(11, 9, 14, 12, LEAF)
    t.rect(12, 9, 13, 10, LEAF_LIGHT)
    t.rect(11, 12, 14, 12, LEAF_DARK)
    t.rect(12, 13, 13, 13, LEAF_DARK)
    return t


def apartments():
    t = Tile()
    t.shadow(1, 1, 14, 14)
    t.slab(1, 1, 14, 6, '#e3d2b0', '#cdb994', '#a8956f')    # flat roof
    t.rect(3, 3, 12, 4, '#bfa981')
    t.slab(9, 2, 12, 4, STEEL_LIGHT, STEEL, STEEL_DARK)     # roof access
    t.rect(1, 7, 14, 14, '#c98b74')        # brick wall
    t.rect(14, 7, 14, 14, '#a86f5b')
    for x in (2, 5, 9, 12):
        t.window(x, 8, x + 1, 9)
    for x in (2, 12):
        t.window(x, 11, x + 1, 12)
    t.rect(6, 11, 9, 14, '#a86f5b')        # porch
    t.rect(7, 12, 8, 14, WOOD_DARK)
    return t


# --- Commercial buildings
def awning(t, y, color, shade):
    for x in range(1, 15, 4):
        t.rect(x, y, x + 1, y, color)
        t.rect(x, y + 1, x + 1, y + 1, shade)
        t.rect(x + 2, y, x + 3, y, '#f2f2ee')
        t.rect(x + 2, y + 1, x + 3, y + 1, STEEL_LIGHT)


def shopfront(t, y):
    t.rect(1, y, 14, 14, PAPER)
    t.rect(1, 14, 14, 14, STEEL)
    t.rect(14, y, 14, 14, STEEL)
    t.window(2, y, 5, 13)
    t.window(10, y, 13, 13)
    t.rect(7, y, 8, 14, GLASS_DARK)        # door


def shop_red():
    t = Tile()
    t.shadow(1, 1, 14, 14)
    t.slab(1, 1, 14, 8, '#8fa3b8', '#72879d', '#566a80')
    t.slab(9, 3, 12, 5, STEEL_LIGHT, STEEL, STEEL_DARK)     # air conditioner
    t.rect(10, 4, 11, 4, STEEL_DEEP)
    awning(t, 9, '#d05a4e', '#a84238')
    shopfront(t, 11)
    return t


def shop_green():
    t = Tile()
    t.shadow(1, 1, 14, 14)
    t.slab(1, 1, 14, 8, '#74b8aa', '#4f9a8d', '#3a7a70')
    t.slab(3, 3, 7, 6, STEEL_LIGHT, GLASS, GLASS_DARK)      # skylight
    t.rect(4, 4, 5, 4, GLASS_LIGHT)
    awning(t, 9, '#3f9a5c', '#2f7a47')
    shopfront(t, 11)
    return t


def office():
    t = Tile()
    t.shadow(1, 0, 14, 14)
    t.slab(1, 0, 14, 4, '#7f8da0', '#5f6c7e', '#465162')    # roof
    t.rect(6, 2, 9, 2, STEEL_LIGHT)
    t.rect(1, 5, 14, 14, '#3f5f85')        # curtain wall
    for y in (6, 9, 12):
        for x in (2, 5, 8, 11):
            t.window(x, y, x + 1, y + 1)
    t.rect(13, 5, 14, 14, '#2f4a6b')
    t.rect(7, 12, 9, 14, '#22344d')        # entrance
    t.rect(8, 13, 8, 14, GLASS)
    return t


def store_white():
    t = Tile()
    t.shadow(1, 1, 14, 14)
    t.slab(1, 1, 14, 8, '#f2f2ee', PAPER, STEEL)
    t.rect(3, 3, 6, 6, '#4f8fc9')          # water tank
    t.rect(4, 2, 5, 7, '#4f8fc9')
    t.rect(4, 3, 5, 4, '#8fbde6')
    t.rect(6, 5, 6, 6, '#36699a')
    t.rect(10, 3, 12, 6, STEEL)            # vents
    t.rect(10, 4, 12, 4, STEEL_DEEP)
    t.rect(10, 6, 12, 6, STEEL_DEEP)
    awning(t, 9, '#4f8fc9', '#36699a')
    shopfront(t, 11)
    return t


# --- Industrial buildings
def factory():
    t = Tile()
    t.shadow(1, 1, 14, 14)
    for x in range(1, 15):                 # sawtooth roof
        t.rect(x, 1, x, 8, (STEEL_LIGHT, STEEL, STEEL, STEEL_DARK)[(x - 1) % 4])
    t.rect(1, 8, 14, 8, STEEL_DEEP)
    t.rect(11, 0, 12, 6, '#9a5b4d')        # chimney
    t.rect(11, 0, 12, 0, '#5a332b')
    t.rect(11, 2, 12, 2, PAPER)
    t.rect(13, 1, 13, 6, STEEL_DEEP)
    t.rect(1, 9, 14, 14, '#b3a892')        # wall
    t.rect(14, 9, 14, 14, '#8f8672')
    t.rect(1, 14, 14, 14, '#8f8672')
    t.rect(3, 11, 7, 14, STEEL_DEEP)       # loading door
    t.rect(3, 12, 7, 12, STEEL_DARK)
    t.window(10, 10, 12, 11)
    return t


def warehouse():
    t = Tile()
    t.shadow(1, 1, 14, 14)
    t.rect(1, 1, 14, 8, '#7d95a8')         # ribbed roof
    t.rect(1, 1, 14, 1, '#a3b8c8')
    for y in (4, 7):
        t.rect(1, y, 14, y, '#667d90')
    t.rect(14, 1, 14, 8, '#55697a')
    t.rect(1, 9, 14, 14, STEEL_LIGHT)      # wall
    t.rect(14, 9, 14, 14, STEEL)
    t.rect(4, 10, 11, 14, '#e0b23e')       # roller door
    for y in (11, 13):
        t.rect(4, y, 11, y, '#b98a26')
    return t


def tank(t, x, top, body, shade):
    t.rect(x + 1, 2, x + 4, 2, top)
    t.rect(x, 3, x + 5, 4, top)
    t.rect(x, 5, x + 5, 12, body)
    t.rect(x, 5, x, 12, top)
    t.rect(x + 4, 5, x + 5, 12, shade)
    t.rect(x + 1, 13, x + 4, 13, shade)


def tanks():
    t = Tile()
    t.rect(7, 13, 14, 14, (16, 17, 20, 80))
    t.rect(14, 5, 15, 12, (16, 17, 20, 80))
    tank(t, 1, '#f2f2ee', PAPER, STEEL)
    tank(t, 8, '#e2a06a', '#c9783f', '#96542a')
    t.rect(6, 8, 8, 9, STEEL_DEEP)         # pipe
    return t


def workshop():
    t = Tile()
    t.shadow(1, 1, 14, 14)
    t.slab(1, 1, 14, 8, '#c98458', '#a8623c', '#7f4628')
    for x in (3, 9):                       # vents
        t.slab(x, 3, x + 2, 5, STEEL_LIGHT, STEEL, STEEL_DEEP)
    t.rect(1, 9, 14, 14, STEEL)            # wall
    t.rect(14, 9, 14, 14, STEEL_DARK)
    t.rect(6, 10, 9, 12, STEEL_DEEP)       # door
    for x in range(1, 15, 4):              # hazard stripe
        t.rect(x, 13, x + 1, 14, '#e0b23e')
        t.rect(x + 2, 13, x + 3, 14, '#3a3a3a')
    return t


# --- Larger buildings for levels 2 and 3
def condo():
    t = Tile()
    t.shadow(2, 0, 13, 14)
    t.slab(2, 0, 13, 3, '#dfe6ea', '#c3ccd3', '#9aa5ae')    # roof
    t.rect(2, 4, 13, 14, '#e9e2d0')        # wall
    t.rect(13, 4, 13, 14, '#c2baa5')
    for y in (5, 8, 11):
        for x in (3, 6, 9):
            t.window(x, y, x + 1, y + 1)
        t.rect(11, y + 1, 12, y + 1, '#d0705a')             # balconies
    t.rect(7, 12, 8, 14, WOOD_DARK)        # door
    return t


def tower():
    t = Tile()
    t.shadow(3, 0, 12, 14)
    t.slab(3, 0, 12, 2, '#f1e3c2', '#d8c59c', '#ad9a70')    # roof
    t.rect(6, 0, 9, 0, '#d0705a')
    t.rect(3, 3, 12, 14, '#d98f6f')        # wall
    t.rect(12, 3, 12, 14, '#b06f54')
    for y in (4, 6, 8, 10, 12):            # five floors of windows
        for x in (4, 7, 10):
            t.rect(x, y, x + 1, y, GLASS_LIGHT)
    t.rect(7, 13, 8, 14, WOOD_DARK)        # door
    t.rect(3, 14, 5, 14, LEAF)             # hedges
    t.rect(10, 14, 12, 14, LEAF)
    return t


def department_store():
    t = Tile()
    t.shadow(1, 1, 14, 14)
    t.slab(1, 1, 14, 5, '#f0d9a0', '#dcc07e', '#b39a5c')    # roof
    t.rect(4, 2, 11, 4, '#c8553d')         # sign
    t.rect(5, 3, 10, 3, PAPER)
    t.rect(1, 6, 14, 14, '#efe9dc')        # wall
    t.rect(14, 6, 14, 14, '#c9c2b2')
    for x in (2, 6, 10):
        t.window(x, 7, x + 2, 8)
    t.rect(1, 10, 14, 10, '#c8553d')       # canopy
    t.window(2, 11, 5, 13)
    t.window(10, 11, 13, 13)
    t.rect(7, 11, 8, 14, '#22344d')        # entrance
    return t


def glass_tower():
    t = Tile()
    t.shadow(3, 0, 12, 14)
    t.slab(3, 0, 12, 2, '#9fb0c4', '#74859b', '#4f5d70')    # roof
    t.rect(7, 0, 8, 0, '#e0b23e')          # beacon
    t.rect(3, 3, 12, 14, GLASS)            # curtain wall
    for y in range(3, 15, 2):
        t.rect(3, y, 12, y, GLASS_LIGHT)
    for x in (5, 8, 11):
        t.rect(x, 3, x, 14, GLASS_DARK)
    t.rect(12, 3, 12, 14, GLASS_DARK)
    t.rect(7, 13, 8, 14, '#22344d')        # entrance
    return t


def heavy_plant():
    t = Tile()
    t.shadow(1, 2, 14, 14)
    t.slab(1, 5, 14, 9, STEEL_LIGHT, STEEL, STEEL_DARK)     # roof
    for x in (3, 7):                       # two chimneys
        t.rect(x, 0, x + 1, 7, '#9a5b4d')
        t.rect(x, 0, x + 1, 0, '#5a332b')
        t.rect(x, 2, x + 1, 2, PAPER)
    t.slab(10, 2, 13, 7, '#e0b23e', '#c4962c', '#96701c')   # silo
    t.rect(1, 10, 14, 14, '#8d8f96')       # wall
    t.rect(14, 10, 14, 14, STEEL_DEEP)
    t.rect(2, 11, 6, 14, STEEL_DEEP)       # loading door
    t.rect(2, 12, 6, 12, STEEL_DARK)
    t.window(8, 11, 9, 12)
    t.window(11, 11, 12, 12)
    return t


# --- Civic buildings
def power_plant():
    t = Tile()
    t.shadow(1, 3, 14, 14)
    t.slab(1, 6, 14, 14, '#5d6672', '#48505b', '#343a43')   # hall
    for x in (2, 6):                       # cooling stacks
        t.slab(x, 1, x + 3, 8, STEEL_LIGHT, STEEL, STEEL_DARK)
        t.rect(x, 1, x + 3, 1, PAPER)
    t.rect(11, 8, 13, 13, '#f4ca65')       # warning panel with a bolt
    t.rect(12, 8, 12, 10, '#3a3a3a')
    t.rect(11, 10, 12, 10, '#3a3a3a')
    t.rect(11, 11, 11, 13, '#3a3a3a')
    t.rect(3, 11, 7, 14, STEEL_DEEP)
    return t


def water_tower():
    t = Tile()
    t.shadow(3, 1, 12, 14)
    t.slab(3, 1, 12, 8, '#a9dcf5', '#74c7ed', '#4a9cc4')    # tank
    t.rect(3, 4, 12, 4, '#4a9cc4')
    t.rect(5, 2, 7, 2, PAPER)
    for x in (4, 11):                      # legs
        t.rect(x, 9, x, 14, STEEL_DARK)
    t.rect(7, 9, 8, 14, STEEL)             # riser pipe
    t.rect(4, 12, 11, 12, STEEL_DEEP)
    return t


def fire_station():
    t = Tile()
    t.shadow(1, 1, 14, 14)
    t.slab(1, 1, 14, 5, '#e36a55', '#c8463a', '#963026')    # roof
    t.rect(11, 0, 13, 3, '#f1e3c2')        # hose tower
    t.rect(11, 0, 13, 0, '#c8463a')
    t.rect(1, 6, 14, 14, '#efe2cf')        # wall
    t.rect(14, 6, 14, 14, '#c9bca8')
    for x in (2, 8):                       # two engine bays
        t.rect(x, 8, x + 4, 14, '#c8463a')
        t.rect(x, 10, x + 4, 10, '#963026')
        t.rect(x + 1, 8, x + 3, 9, GLASS_LIGHT)
    t.rect(1, 6, 14, 6, '#f4ca65')
    return t


def police_station():
    t = Tile()
    t.shadow(1, 1, 14, 14)
    t.slab(1, 1, 14, 5, '#5f7fb8', '#3f5f98', '#2c4470')    # roof
    t.rect(7, 0, 8, 2, '#e04a3c')          # beacon
    t.rect(1, 6, 14, 14, '#dfe4ec')        # wall
    t.rect(14, 6, 14, 14, '#b4bac6')
    t.rect(1, 6, 14, 7, '#3f5f98')         # blue band with a badge
    t.rect(7, 6, 8, 7, '#f4ca65')
    for x in (2, 11):
        t.window(x, 9, x + 2, 11)
    t.rect(6, 10, 9, 14, '#2c4470')        # door
    t.rect(7, 11, 8, 14, GLASS)
    return t


def school():
    t = Tile()
    t.shadow(1, 2, 14, 14)
    t.slab(1, 2, 14, 6, '#f0a55a', '#d98838', '#a96422')    # roof
    t.rect(7, 0, 8, 4, '#f1e3c2')          # bell tower
    t.rect(7, 0, 8, 0, '#a96422')
    t.rect(7, 2, 8, 2, '#3a3a3a')
    t.rect(1, 7, 14, 14, '#f6ecd2')        # wall
    t.rect(14, 7, 14, 14, '#cfc4a6')
    for x in (2, 5, 10, 13):
        t.window(x, 9, x, 11)
    t.rect(7, 10, 8, 14, WOOD_DARK)        # door
    t.rect(1, 14, 5, 14, LEAF)             # playground grass
    return t


def clinic():
    t = Tile()
    t.shadow(1, 1, 14, 14)
    t.slab(1, 1, 14, 5, '#f4f6f8', '#dfe4e8', '#b3bcc4')    # roof
    t.rect(6, 2, 9, 4, '#e04a3c')          # red cross
    t.rect(7, 1, 8, 5, '#e04a3c')
    t.rect(1, 6, 14, 14, '#ecf1f4')        # wall
    t.rect(14, 6, 14, 14, '#bcc6ce')
    for x in (2, 11):
        t.window(x, 8, x + 2, 10)
    t.rect(6, 9, 9, 14, '#7fc6b8')         # entrance
    t.rect(7, 10, 8, 14, GLASS_LIGHT)
    t.rect(1, 12, 4, 12, '#e04a3c')
    return t


def bus_stop():
    t = Tile()
    t.shadow(2, 4, 13, 13)
    t.slab(2, 4, 13, 7, '#f6d860', '#f2c94c', '#c49a2c')    # canopy
    t.rect(3, 8, 3, 13, STEEL_DARK)        # posts
    t.rect(12, 8, 12, 13, STEEL_DARK)
    t.rect(4, 8, 11, 11, GLASS)            # glass back
    t.rect(4, 8, 11, 8, GLASS_LIGHT)
    t.rect(4, 12, 11, 12, WOOD)            # bench
    t.rect(14, 5, 15, 8, '#3f6fb0')        # sign
    t.rect(14, 9, 14, 13, STEEL_DARK)
    return t


def metro_station():
    t = Tile()
    t.shadow(1, 4, 14, 13)
    t.slab(1, 4, 14, 7, '#8d98a6', '#6b7684', '#4d5661')    # canopy
    t.rect(5, 1, 10, 5, '#e5484d')         # sign
    t.rect(6, 2, 9, 2, PAPER)
    t.rect(6, 4, 9, 4, PAPER)
    t.rect(1, 8, 14, 13, '#2b2f36')        # entrance
    t.rect(3, 8, 12, 13, '#15171b')        # stairs going down
    for y in (9, 11, 13):
        t.rect(4, y, 11, y, STEEL_DARK)
    t.rect(1, 8, 1, 13, STEEL)             # handrails
    t.rect(14, 8, 14, 13, STEEL)
    return t


# --- Buildings of two tiles by two
def housing_complex():
    """Four wings round a garden, seen from above, with the street front along the bottom."""
    t = Tile(size=2 * T)
    t.shadow(2, 2, 29, 29)
    t.slab(2, 2, 29, 22, '#e9dcc0', '#d4c4a2', '#ad9c78')   # roofs
    t.rect(6, 6, 25, 6, '#bfa981')         # ridge lines
    t.rect(6, 6, 6, 19, '#bfa981')
    t.rect(25, 6, 25, 19, '#bfa981')
    t.rect(10, 9, 21, 19, '#6fb565')       # the garden
    t.rect(10, 9, 21, 9, '#4f9a55')
    t.rect(10, 9, 10, 19, '#4f9a55')
    t.rect(14, 12, 17, 15, LEAF_DARK)      # a tree and two flower beds
    t.rect(15, 13, 16, 14, LEAF_LIGHT)
    t.rect(12, 17, 13, 18, '#e8799a')
    t.rect(18, 11, 19, 12, '#f6e27a')
    for x, y in ((4, 4), (25, 4), (4, 17)):                 # stair towers
        t.slab(x, y, x + 2, y + 2, STEEL_LIGHT, STEEL, STEEL_DARK)
    t.rect(2, 23, 29, 29, '#c98b74')       # the street front
    t.rect(29, 23, 29, 29, '#a86f5b')
    for x in range(4, 28, 4):
        t.window(x, 24, x + 1, 25)
    for x in (4, 8, 20, 24):
        t.window(x, 27, x + 1, 28)
    t.rect(13, 26, 18, 29, '#a86f5b')      # entrance
    t.rect(15, 27, 16, 29, WOOD_DARK)
    return t


BIG = [housing_complex()]

ROWS = [
    [road(mask) for mask in range(16)],
    [residential_lot(), commercial_lot(), industrial_lot()],
    [house_red(), house_blue(), cottage(), apartments(), condo(), tower(),
     # 6-7: level 2 repaints; 8-9: level 3 repaints; 10: a green-roofed house.
     apartments().recolour({'#c98b74': '#8fa3b8', '#a86f5b': '#6d8196', '#e3d2b0': '#d9dde2',
                            '#cdb994': '#b9bfc7', '#a8956f': '#8f97a1', '#bfa981': '#a3abb5'}),
     condo().recolour({'#e9e2d0': '#cfe3ea', '#c2baa5': '#a3bcc6', '#d0705a': '#3f8f8a'}),
     tower().recolour({'#d98f6f': '#7fa3c7', '#b06f54': '#5b7fa3', '#d0705a': '#3f5f85'}),
     tower().recolour({'#d98f6f': '#d6cfb8', '#b06f54': '#aaa38c', '#f1e3c2': '#8fb39a',
                       '#d8c59c': '#6f9a7d', '#ad9a70': '#527a5f', '#d0705a': '#527a5f'}),
     house_red().recolour({'#b9584a': '#5f9a6a', '#d77c67': '#86bd8f', '#a84c40': '#4f8a5a',
                           '#8e3d35': '#3f744a'})],
    [shop_red(), shop_green(), office(), store_white(), department_store(), glass_tower(),
     # 6-7: level 2 repaints; 8-9: level 3 repaints.
     office().recolour({'#3f5f85': '#3f857a', '#2f4a6b': '#2f6b61', '#7f8da0': '#8da09a',
                        '#5f6c7e': '#6c7e78', '#465162': '#51625c'}),
     department_store().recolour({'#c8553d': '#3f6fb0', '#f0d9a0': '#d9dde2', '#dcc07e': '#b9bfc7',
                                  '#b39a5c': '#8f97a1'}),
     glass_tower().recolour({GLASS: '#6fc7a8', GLASS_LIGHT: '#a9ead2', GLASS_DARK: '#3f9678'}),
     glass_tower().recolour({GLASS: '#c79a6f', GLASS_LIGHT: '#eac9a9', GLASS_DARK: '#96683f',
                             '#9fb0c4': '#c4b09f', '#74859b': '#9b8574', '#4f5d70': '#705d4f'})],
    [factory(), warehouse(), tanks(), workshop(), heavy_plant(),
     # 5: a level 1 repaint; 6: a level 2 repaint; 7-8: level 3 repaints.
     warehouse().recolour({'#7d95a8': '#a88a7d', '#a3b8c8': '#c8aea3', '#667d90': '#907266',
                           '#55697a': '#7a5f55', '#e0b23e': '#5f9a6a', '#b98a26': '#3f744a'}),
     factory().recolour({'#b3a892': '#a8b3bd', '#8f8672': '#7d8a96', '#9a5b4d': '#6d7379',
                         '#5a332b': '#3f4347'}),
     heavy_plant().recolour({'#e0b23e': '#74c7ed', '#c4962c': '#4a9cc4', '#96701c': '#2f7396'}),
     heavy_plant().recolour({'#9a5b4d': '#6d7379', '#5a332b': '#3f4347', '#8d8f96': '#a8907d',
                             '#e0b23e': '#d98838', '#c4962c': '#b06a22', '#96701c': '#7f4a14'})],
    [power_plant(), water_tower(), fire_station(), police_station(), school(), clinic(), bus_stop(),
     metro_station()],
]

if __name__ == '__main__':
    sheet = Image.new('RGBA', (16 * T, (len(ROWS) + 2) * T), (0, 0, 0, 0))
    for row, tiles in enumerate(ROWS):
        for column, tile in enumerate(tiles):
            sheet.paste(tile.image, (column * T, row * T))
    for column, tile in enumerate(BIG):
        sheet.paste(tile.image, (column * 2 * T, len(ROWS) * T))
    sheet.save(OUT)
    print(f'wrote {OUT}')
