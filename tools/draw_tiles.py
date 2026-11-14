"""Draws src/assets/city.png, the game's own tiles.

Every tile is drawn on a 16x16 grid by the functions below and then worked up to 32x32 by
`fine()`, which doubles it and adds what the coarse grid cannot hold: a lit and a shaded edge
to every surface, panes in the glass, and a little grain. So to change a building, change its
function; to change how fine detail looks everywhere, change `fine()`.

    python tools/draw_tiles.py

Sheet layout (in tiles), mirrored by src/rendering/TileRenderer.ts:
  row 0      roads, column = neighbour mask (north 1, east 2, south 4, west 8)
  row 1      empty lots: residential, commercial, industrial
  rows 2-4   buildings: residential, commercial, industrial. Columns 0-3 are the original
             four; after them come the larger buildings of levels 2 and 3, and repaints of
             all of them so that neighbours of one level do not look alike. Which column
             belongs to which level is the BUILDING_ART table in TileRenderer.ts.
  row 5      civic buildings: power plant, water tower, fire station, police station,
             school, clinic, bus stop, metro station, market, high school
             (CIVIC_ART in TileRenderer.ts)
  rows 6-7   buildings two tiles wide and two tall: the housing complex, hospital,
             university, museum, stadium (BIG_ART in TileRenderer.ts)
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


def market():
    """Three striped stalls under one roof, with crates of produce out front."""
    t = Tile()
    t.shadow(1, 2, 14, 13)
    t.slab(1, 2, 14, 5, '#f1e3c2', '#d8c59c', '#ad9a70')    # roof
    for x in range(1, 15, 4):              # striped awning
        t.rect(x, 6, x + 1, 8, '#d9423a')
        t.rect(x + 2, 6, x + 3, 8, PAPER)
    t.rect(1, 9, 14, 13, '#8a5a3a')        # stalls
    t.rect(1, 9, 14, 9, '#6b432b')
    for x, colour in ((2, '#e8a23c'), (6, '#6fb565'), (10, '#d9423a')):
        t.rect(x, 10, x + 2, 12, colour)   # oranges, greens, tomatoes
        t.rect(x, 10, x + 2, 10, PAPER)
    return t


def high_school():
    """A long two-storey block with a clock and a sports court."""
    t = Tile()
    t.shadow(1, 1, 14, 11)
    t.slab(1, 1, 14, 4, '#7f8fb8', '#5f6f98', '#414e70')    # roof
    t.rect(1, 5, 14, 11, '#efe6d2')        # wall
    t.rect(14, 5, 14, 11, '#c9bfa8')
    for x in (2, 4, 10, 12):               # two rows of windows
        t.window(x, 6, x, 7)
        t.window(x, 9, x, 10)
    t.rect(6, 5, 9, 8, '#5f6f98')          # entrance block with a clock
    t.rect(7, 6, 8, 7, PAPER)
    t.rect(7, 9, 8, 11, WOOD_DARK)
    t.rect(1, 12, 14, 14, '#c8755a')       # court
    t.rect(7, 12, 7, 14, PAPER)
    t.rect(1, 13, 14, 13, '#d98f76')
    return t


def cinema():
    """A cinema: a marquee with lights over glass doors, and a poster either side."""
    t = Tile()
    t.shadow(1, 1, 14, 14)
    t.slab(1, 1, 14, 5, '#5a4a7a', '#44365f', '#2f2445')
    t.rect(1, 6, 14, 14, '#e9e2d0')
    t.rect(14, 6, 14, 14, '#c2baa5')
    t.rect(1, 6, 14, 8, '#c8322e')         # marquee
    for x in range(2, 14, 2):
        t.rect(x, 7, x, 7, '#f6e27a')
    t.window(6, 10, 9, 14)
    t.rect(2, 10, 4, 13, '#3f6fb0')        # posters
    t.rect(3, 11, 3, 12, '#f6e27a')
    t.rect(11, 10, 13, 13, '#5f9a6a')
    t.rect(12, 11, 12, 12, PAPER)
    return t


def parking():
    """A car park: bays marked on asphalt, a few cars and a blue P sign."""
    t = Tile()
    t.rect(0, 0, 15, 15, KERB)
    t.rect(1, 1, 14, 14, ASPHALT)
    for x in (5, 10):
        t.rect(x, 1, x, 5, PAPER)
        t.rect(x, 10, x, 14, PAPER)
    for x, y, colour in ((1, 1, '#d87856'), (6, 1, '#5bb6ce'), (11, 10, '#e6c15a'), (1, 10, '#d6d9de')):
        t.rect(x, y, x + 3, y + 4, '#232831')
        t.rect(x + 1, y + 1, x + 2, y + 3, colour)
        t.rect(x + 1, y + 2, x + 2, y + 2, '#a9d8de')
    t.rect(11, 1, 14, 5, '#3f6fb0')        # sign
    t.rect(12, 2, 12, 4, PAPER)
    t.rect(13, 2, 13, 3, PAPER)
    return t


def library():
    """A library: a brown hall with tall windows, steps and a row of books on its sign."""
    t = Tile()
    t.shadow(1, 1, 14, 14)
    t.slab(1, 1, 14, 5, '#c9a36a', '#b98a4a', '#8f6832')
    t.rect(1, 6, 14, 14, '#efe6d2')
    t.rect(14, 6, 14, 14, '#cbbfa4')
    t.rect(4, 2, 11, 4, '#f4f6f8')           # sign with books
    for x, colour in ((5, '#c8322e'), (7, '#3f6fb0'), (9, '#5f9a6a')):
        t.rect(x, 2, x, 4, colour)
    for x in (2, 5, 10, 13):
        t.window(x, 7, x, 11)
    t.rect(7, 9, 8, 14, '#6b432b')
    t.rect(5, 13, 10, 14, '#b3b6bc')         # steps
    return t


def pool():
    """A swimming pool: blue water with lane ropes inside a pale deck, and a small changing hut."""
    t = Tile()
    t.rect(0, 0, 15, 15, '#e6dfcf')
    t.rect(0, 15, 15, 15, '#c2baa5')
    t.rect(2, 5, 13, 13, '#2f78ab')
    t.rect(3, 6, 12, 12, '#5bb6ce')
    t.rect(3, 6, 12, 6, '#a9e0ee')
    for x in (6, 9):
        for y in range(7, 13, 2):
            t.rect(x, y, x, y, '#f4f6f8')
    t.slab(2, 1, 8, 3, '#f0a55a', '#d98838', '#a9682a')
    t.rect(11, 1, 13, 3, '#e5484d')          # parasol
    t.rect(12, 2, 12, 2, '#f4f6f8')
    return t


def ktv():
    """A karaoke box: a dark front, a pink neon sign with a note on it and lit doors."""
    t = Tile()
    t.shadow(1, 1, 14, 14)
    t.slab(1, 1, 14, 4, '#5a4a7a', '#3a2c55', '#231a38')
    t.rect(1, 5, 14, 14, '#2b2140')
    t.rect(14, 5, 14, 14, '#1b1429')
    t.rect(3, 5, 12, 8, '#e8799a')           # neon sign
    t.rect(4, 6, 11, 7, '#3a1530')
    t.rect(6, 6, 6, 7, '#f6e27a')
    t.rect(7, 6, 8, 6, '#f6e27a')
    t.rect(10, 6, 10, 7, '#7fd0c8')
    for x in (2, 12):
        t.rect(x, 10, x + 1, 11, '#f6e27a')
    t.rect(6, 10, 9, 14, '#7fd0c8')
    t.rect(7, 11, 8, 14, '#1b1429')
    return t


def amusement():
    """An amusement park: a big wheel, a striped tent, a track of little cars and a gate."""
    t = Tile(size=2 * T)
    t.rect(0, 0, 31, 31, '#8fcb80')
    t.rect(0, 28, 31, 31, '#d9cfa8')
    # the wheel
    for x, y in ((8, 2), (5, 3), (11, 3), (3, 5), (13, 5), (2, 8), (14, 8), (3, 11), (13, 11), (5, 13), (11, 13), (8, 14)):
        t.rect(x, y, x + 1, y + 1, '#55575b')
    for (x, y), colour in zip(((8, 2), (3, 5), (13, 5), (2, 8), (14, 8), (5, 13), (11, 13)),
                              ('#e5484d', '#f2c94c', '#5bb6ce', '#5f9a6a', '#e8799a', '#f0a55a', '#3f6fb0')):
        t.rect(x, y, x + 1, y + 1, colour)
    t.rect(8, 8, 9, 9, '#f4f6f8')
    t.rect(8, 10, 9, 19, '#787a7e')
    t.rect(5, 20, 12, 21, '#55575b')
    # the tent
    for x in range(18, 30):
        t.rect(x, 6, x, 16, '#e5484d' if (x // 2) % 2 else '#f4f6f8')
    t.rect(19, 4, 28, 5, '#e5484d')
    t.rect(21, 2, 26, 3, '#f4f6f8')
    t.rect(23, 0, 24, 1, '#f2c94c')
    t.rect(22, 12, 25, 16, '#3a1512')
    t.rect(18, 17, 29, 17, (16, 17, 20, 80))
    # the track and its cars
    t.rect(16, 20, 29, 26, '#84878c')
    t.rect(17, 21, 28, 25, '#404040')
    t.rect(19, 23, 26, 23, '#8fcb80')
    for x, y, colour in ((18, 21, '#f2c94c'), (24, 21, '#5bb6ce'), (21, 24, '#e5484d'), (27, 24, '#5f9a6a')):
        t.rect(x, y, x + 1, y + 1, colour)
    # the gate
    t.rect(2, 24, 3, 30, '#b98a4a')
    t.rect(12, 24, 13, 30, '#b98a4a')
    t.rect(2, 23, 13, 25, '#f2c94c')
    t.rect(4, 24, 11, 24, '#e5484d')
    return t


def mall():
    """A shopping mall: a long glass front under a red sign, with its own car park."""
    t = Tile(size=2 * T)
    t.shadow(2, 2, 29, 22)
    t.slab(2, 2, 29, 9, '#e8ecef', '#cfd6dc', '#a3adb6')
    t.rect(5, 4, 12, 7, STEEL)
    t.rect(5, 4, 12, 4, STEEL_LIGHT)
    t.rect(18, 3, 26, 8, GLASS)            # skylight
    t.rect(18, 3, 26, 3, GLASS_LIGHT)
    for x in (20, 23):
        t.rect(x, 3, x, 8, GLASS_DARK)
    t.rect(2, 10, 29, 22, '#f1ece0')
    t.rect(29, 10, 29, 22, '#cfc9bb')
    t.rect(2, 10, 29, 12, '#d9423a')       # sign
    t.rect(9, 11, 22, 11, PAPER)
    for x in range(4, 28, 6):
        t.window(x, 14, x + 3, 16)
    t.rect(2, 18, 29, 18, '#3f6fb0')       # canopy
    for x in (4, 8, 21, 25):
        t.window(x, 19, x + 2, 21)
    t.rect(13, 19, 18, 22, '#22344d')
    t.rect(15, 19, 16, 22, GLASS_LIGHT)
    t.rect(2, 23, 29, 30, ASPHALT)         # car park
    for x in range(4, 29, 5):
        t.rect(x, 24, x, 29, PAPER)
    for x, colour in ((5, '#5bb6ce'), (15, '#d87856'), (20, '#e6c15a')):
        t.rect(x, 24, x + 3, 29, '#232831')
        t.rect(x + 1, 25, x + 2, 28, colour)
        t.rect(x + 1, 26, x + 2, 26, '#a9d8de')
    return t


def casino():
    """A casino: a dark hall full of lights, a gold marquee, palms and a red carpet."""
    t = Tile(size=2 * T)
    t.shadow(4, 1, 27, 26)
    t.slab(4, 1, 27, 6, '#5a4a7a', '#352850', '#231a38')
    t.rect(11, 2, 20, 5, '#e0b23e')        # roof sign
    t.rect(12, 3, 19, 4, '#c8322e')
    t.rect(4, 7, 27, 26, '#2b2140')
    t.rect(27, 7, 27, 26, '#1b1429')
    for y in range(9, 19, 3):
        for x in range(6, 26, 3):
            t.rect(x, y, x + 1, y + 1, '#f6e27a' if (x + y) % 2 else '#e0782f')
    t.rect(4, 20, 27, 21, '#e0b23e')       # marquee
    for x in range(5, 27, 2):
        t.rect(x, 20, x, 20, '#fff4c2')
    t.rect(12, 22, 19, 26, '#7d2a22')
    t.rect(14, 22, 17, 26, '#f6e27a')
    t.rect(15, 23, 16, 26, '#3a1512')
    t.rect(13, 27, 18, 30, '#c8322e')      # red carpet
    for x in (7, 24):                      # palms
        t.rect(x, 24, x, 29, WOOD_DARK)
        t.rect(x - 2, 23, x + 2, 23, LEAF)
        t.rect(x - 1, 22, x + 1, 22, LEAF_LIGHT)
        t.rect(x - 2, 24, x - 2, 24, LEAF_DARK)
        t.rect(x + 2, 24, x + 2, 24, LEAF_DARK)
    return t


def temple():
    """A sweeping orange roof on red pillars, with an incense burner out front."""
    t = Tile()
    t.shadow(2, 3, 13, 12)
    t.rect(1, 3, 14, 6, '#e0782f')         # roof
    t.rect(1, 3, 14, 3, '#f2a65a')
    t.rect(1, 6, 14, 6, '#b3561c')
    t.rect(0, 2, 1, 3, '#f2a65a')          # upturned eaves
    t.rect(14, 2, 15, 3, '#f2a65a')
    t.rect(4, 4, 11, 4, '#e0b23e')
    t.rect(7, 1, 8, 2, '#e0b23e')
    t.rect(2, 7, 13, 12, '#f1e3c2')        # hall
    t.rect(13, 7, 13, 12, '#cdb994')
    for x in (2, 5, 10, 13):
        t.rect(x, 7, x, 12, '#c8322e')
    t.rect(6, 8, 9, 12, '#7d2a22')
    t.rect(7, 9, 8, 12, '#3a1512')
    t.rect(6, 7, 9, 7, '#e0b23e')
    t.rect(6, 14, 9, 14, '#e0b23e')        # incense burner
    t.rect(7, 15, 8, 15, STEEL_DARK)
    return t


def hospital():
    """A white block with a red cross on the roof, a helipad and an ambulance bay."""
    t = Tile(size=2 * T)
    t.shadow(2, 2, 29, 29)
    t.slab(2, 2, 29, 16, '#f4f6f8', '#dfe4e8', '#b3bcc4')   # roof
    t.rect(6, 5, 13, 12, '#b3bcc4')        # helipad
    t.rect(7, 6, 12, 11, '#7f8a94')
    t.rect(8, 7, 8, 10, PAPER)
    t.rect(11, 7, 11, 10, PAPER)
    t.rect(8, 8, 11, 9, PAPER)
    t.rect(19, 5, 26, 12, '#f4f6f8')       # red cross
    t.rect(21, 5, 24, 12, '#e04a3c')
    t.rect(19, 7, 26, 10, '#e04a3c')
    t.rect(2, 17, 29, 29, '#ecf1f4')       # wall
    t.rect(29, 17, 29, 29, '#bcc6ce')
    t.rect(2, 17, 29, 17, '#7fc6b8')
    for y in (19, 23):
        for x in range(4, 28, 4):
            t.window(x, y, x + 1, y + 1)
    t.rect(11, 25, 20, 29, '#7fc6b8')      # entrance canopy and doors
    t.rect(13, 26, 18, 29, GLASS_LIGHT)
    t.rect(15, 26, 16, 29, '#7fc6b8')
    t.rect(4, 27, 8, 29, '#e04a3c')        # ambulance bay
    t.rect(5, 27, 7, 27, PAPER)
    return t


def university():
    """A domed hall between two wings, with a lawn and a path up to the door."""
    t = Tile(size=2 * T)
    t.shadow(2, 3, 29, 22)
    for x0, x1 in ((2, 10), (21, 29)):     # wings
        t.slab(x0, 6, x1, 11, '#c9735a', '#b05a44', '#84402f')
        t.rect(x0, 12, x1, 22, '#f1e3c2')
        t.rect(x1, 12, x1, 22, '#cdbd98')
        for x in range(x0 + 1, x1, 3):
            t.window(x, 14, x + 1, 15)
            t.window(x, 18, x + 1, 19)
    t.slab(11, 8, 20, 12, '#c9735a', '#b05a44', '#84402f')  # hall
    t.rect(11, 13, 20, 22, '#f6ecd2')
    t.rect(13, 2, 18, 8, '#8fb8c9')        # dome
    t.rect(12, 5, 19, 8, '#8fb8c9')
    t.rect(13, 2, 18, 2, '#c5e0ea')
    t.rect(12, 5, 12, 8, '#c5e0ea')
    t.rect(19, 5, 19, 8, '#5f8a9b')
    t.rect(15, 0, 16, 2, '#f4ca65')        # spire
    for x in (12, 15, 18):                 # columns
        t.rect(x, 13, x + 1, 22, PAPER)
    t.rect(14, 17, 17, 22, WOOD_DARK)
    t.rect(2, 23, 29, 29, '#6fb565')       # lawn
    t.rect(2, 23, 29, 23, '#4f9a55')
    t.rect(14, 23, 17, 29, '#d9cfa8')      # path
    for x in (5, 9, 22, 26):
        t.rect(x, 25, x + 1, 26, LEAF_DARK)
        t.rect(x, 25, x, 25, LEAF_LIGHT)
    return t


def museum():
    """A stone temple front: steps, columns and a pediment, with banners either side."""
    t = Tile(size=2 * T)
    t.shadow(3, 3, 28, 27)
    t.slab(3, 3, 28, 10, '#e6dfcf', '#cfc6b2', '#a59c88')   # roof
    for step in range(5):                  # pediment
        t.rect(6 + 2 * step, 9 - step, 25 - 2 * step, 9 - step, '#f4efe2')
    t.rect(14, 7, 17, 8, '#f4ca65')
    t.rect(3, 11, 28, 24, '#efe8d8')       # front
    t.rect(28, 11, 28, 24, '#bfb6a2')
    t.rect(3, 11, 28, 12, '#a59c88')
    for x in range(5, 27, 4):              # columns
        t.rect(x, 13, x + 1, 24, PAPER)
        t.rect(x + 1, 13, x + 1, 24, '#bfb6a2')
    t.rect(13, 16, 18, 24, '#5a4636')      # door
    t.rect(15, 17, 16, 24, '#3d2f24')
    for x, colour in ((7, '#d9423a'), (23, '#3f6fb0')):     # banners
        t.rect(x, 14, x + 1, 20, colour)
    for row, inset in enumerate((0, 1, 2)):                 # steps
        t.rect(3 + inset, 25 + row, 28 - inset, 25 + row, ('#d6cdb9', '#c4bba7', '#b0a793')[row])
    t.rect(3, 28, 28, 29, '#8f97a1')
    return t


def stadium():
    """An oval of stands round a green pitch, with floodlights at the corners."""
    t = Tile(size=2 * T)
    t.shadow(1, 3, 30, 28)
    for inset, colour in ((0, '#55575b'), (1, '#a6a9ae'), (2, '#c5c8ce')):
        t.rect(3 + inset, 3 + inset, 28 - inset, 28 - inset, colour)
        t.rect(1 + inset, 6 + inset, 30 - inset, 25 - inset, colour)
    for x in range(4, 28, 3):              # seats in two colours
        t.rect(x, 5, x + 1, 7, '#d9423a')
        t.rect(x, 24, x + 1, 26, '#3f6fb0')
    for y in range(9, 23, 3):
        t.rect(3, y, 5, y + 1, '#3f6fb0')
        t.rect(26, y, 28, y + 1, '#d9423a')
    t.rect(7, 9, 24, 22, '#6fb565')        # pitch
    for x in range(7, 25, 4):
        t.rect(x, 9, x + 1, 22, '#7cc070')
    t.rect(7, 9, 24, 9, PAPER)
    t.rect(7, 22, 24, 22, PAPER)
    t.rect(7, 9, 7, 22, PAPER)
    t.rect(24, 9, 24, 22, PAPER)
    t.rect(15, 9, 16, 22, PAPER)
    t.rect(14, 14, 17, 17, PAPER)
    t.rect(15, 15, 16, 16, '#6fb565')
    for x, y in ((1, 2), (29, 2), (1, 27), (29, 27)):       # floodlights
        t.rect(x, y, x + 1, y + 2, STEEL_DEEP)
        t.rect(x, y, x + 1, y, '#f6e27a')
    return t


# --- Homes of a kind: who lives in a home shows in what it looks like
def townhouse(wall='#c98b74', shade='#a86f5b', trim='#f1e3c2'):
    """Downtown: a narrow two-floor house with a shop window."""
    t = Tile()
    t.shadow(3, 1, 12, 14)
    t.slab(3, 1, 12, 4, '#9aa5ae', '#7f8a94', '#5d6872')
    t.rect(3, 5, 12, 14, wall)
    t.rect(12, 5, 12, 14, shade)
    t.rect(3, 5, 12, 5, trim)
    for x in (4, 7, 10):
        t.window(x, 7, x + 1, 8)
    t.rect(3, 10, 12, 10, trim)
    t.window(4, 12, 7, 13)
    t.rect(9, 11, 10, 14, WOOD_DARK)
    return t


def villa(roof=('#6b7686', '#465060', '#343c4a'), wall='#f1ece0', shade='#cfc9bb'):
    """A fine house with a garage and a pool."""
    t = Tile()
    t.shadow(1, 2, 10, 13)
    t.rect(1, 2, 10, 8, roof[1])
    t.rect(1, 2, 10, 2, roof[0])
    t.rect(1, 5, 10, 5, roof[2])
    t.rect(1, 8, 10, 8, roof[2])
    t.rect(1, 9, 10, 13, wall)
    t.rect(10, 9, 10, 13, shade)
    t.window(2, 10, 3, 11)
    t.rect(5, 11, 6, 13, WOOD_DARK)
    t.rect(7, 10, 9, 13, STEEL)
    t.rect(7, 10, 9, 10, STEEL_LIGHT)
    t.rect(7, 12, 9, 12, STEEL_DARK)
    t.rect(12, 2, 15, 8, '#e6e1d3')        # pool
    t.rect(13, 3, 14, 7, '#6fc7e0')
    t.rect(13, 3, 14, 3, '#bfeaf5')
    t.rect(12, 11, 15, 13, LEAF)           # hedge
    t.rect(12, 11, 15, 11, LEAF_LIGHT)
    t.rect(12, 13, 15, 13, LEAF_DARK)
    return t


def row_house(roof=(STEEL_LIGHT, STEEL, STEEL_DARK), wall='#b98a6a', shade='#96694d'):
    """Workers' homes: two doors under one tin roof."""
    t = Tile()
    t.shadow(1, 4, 14, 14)
    t.rect(1, 4, 14, 9, roof[1])
    t.rect(1, 4, 14, 4, roof[0])
    t.rect(1, 9, 14, 9, roof[2])
    for x in (3, 6, 9, 12):
        t.rect(x, 5, x, 8, roof[2])
    t.rect(4, 2, 5, 4, '#7d4a3e')
    t.rect(4, 2, 5, 2, STEEL_DEEP)
    t.rect(1, 10, 14, 14, wall)
    t.rect(14, 10, 14, 14, shade)
    t.rect(7, 10, 7, 14, shade)
    t.rect(2, 12, 3, 14, WOOD_DARK)
    t.window(5, 11, 6, 12)
    t.rect(12, 12, 13, 14, WOOD_DARK)
    t.window(9, 11, 10, 12)
    return t


def garden_house(roof=('#e8ad5a', '#d08a3c', '#a9682a'), flower='#e8799a'):
    """A cottage with a tree and flower beds."""
    t = Tile()
    t.shadow(1, 3, 9, 13)
    t.rect(1, 3, 9, 8, roof[1])
    t.rect(1, 3, 9, 3, roof[0])
    t.rect(1, 8, 9, 8, roof[2])
    t.rect(1, 9, 9, 13, '#ead9b5')
    t.rect(9, 9, 9, 13, '#cdb994')
    t.rect(3, 11, 4, 13, WOOD)
    t.window(6, 10, 7, 11)
    t.rect(12, 7, 13, 8, WOOD_DARK)        # tree
    t.rect(11, 2, 14, 6, LEAF)
    t.rect(12, 1, 13, 1, LEAF)
    t.rect(11, 2, 12, 3, LEAF_LIGHT)
    t.rect(11, 6, 14, 6, LEAF_DARK)
    t.rect(11, 10, 14, 13, LEAF)           # flowering bush
    t.rect(12, 11, 12, 11, flower)
    t.rect(14, 12, 14, 12, flower)
    t.rect(11, 13, 14, 13, LEAF_DARK)
    t.rect(1, 15, 9, 15, LEAF_DARK)        # flower bed
    for x in (2, 4, 6, 8):
        t.rect(x, 15, x, 15, flower)
    return t


def lake_house(roof=('#7fd0c8', '#4fa9a2', '#357f7a'), wall='#f4f6f8', shade='#cdd3d8'):
    """By the water: a white house with a wooden deck and a parasol."""
    t = Tile()
    t.shadow(2, 1, 13, 10)
    t.rect(2, 1, 13, 6, roof[1])
    t.rect(2, 1, 13, 1, roof[0])
    t.rect(2, 6, 13, 6, roof[2])
    t.rect(2, 7, 13, 10, wall)
    t.rect(13, 7, 13, 10, shade)
    t.window(3, 8, 6, 9)
    t.window(8, 8, 9, 9)
    t.rect(11, 8, 12, 10, WOOD_DARK)
    t.rect(1, 11, 14, 14, WOOD)            # deck
    t.rect(1, 11, 14, 11, '#a87650')
    for x in (1, 4, 7, 10, 13):
        t.rect(x, 12, x, 14, WOOD_DARK)
    t.rect(3, 12, 5, 14, '#e5484d')        # parasol
    t.rect(4, 13, 4, 13, '#f4f6f8')
    return t


def walkup(wall='#d9dde2', shade='#aab1ba', accent='#e5484d'):
    """By a stop: small flats over a covered doorway."""
    t = Tile()
    t.shadow(2, 1, 13, 14)
    t.slab(2, 1, 13, 4, '#c3ccd3', '#a3adb6', '#7f8a94')
    t.rect(2, 5, 13, 14, wall)
    t.rect(13, 5, 13, 14, shade)
    for y in (6, 11):
        for x in (3, 6):
            t.window(x, y, x + 1, y + 1)
    t.rect(2, 9, 13, 9, accent)
    t.rect(9, 6, 12, 14, shade)            # stairwell
    t.rect(10, 6, 11, 7, GLASS_DARK)
    t.rect(9, 10, 12, 10, accent)
    t.rect(10, 12, 11, 14, WOOD_DARK)
    return t


def study_house(roof=('#7f97c7', '#465f96', '#33487a'), wall='#f0e2b8', shade='#cdbf95'):
    """By a school: a wide house with dormers, ivy and a pennant."""
    t = Tile()
    t.shadow(1, 2, 14, 14)
    t.rect(1, 2, 14, 7, roof[1])
    t.rect(1, 2, 14, 2, roof[0])
    t.rect(1, 7, 14, 7, roof[2])
    t.window(4, 4, 5, 5)
    t.window(10, 4, 11, 5)
    t.rect(1, 8, 14, 14, wall)
    t.rect(14, 8, 14, 14, shade)
    t.rect(6, 10, 9, 10, roof[1])
    t.rect(7, 11, 8, 14, WOOD_DARK)
    t.window(3, 10, 4, 11)
    t.window(11, 10, 12, 11)
    t.rect(1, 8, 1, 13, LEAF)              # ivy
    t.rect(2, 8, 2, 9, LEAF)
    t.rect(1, 12, 2, 13, LEAF_DARK)
    t.rect(13, 0, 13, 2, STEEL_DEEP)       # pennant
    t.rect(10, 0, 12, 1, '#e0b23e')
    return t


def country_house(roof=('#b07a5a', '#8f5f43', '#6b432b'), car='#d87856'):
    """Out of town: a small house, a fence and a car in the drive."""
    t = Tile()
    t.shadow(1, 2, 8, 10)
    t.rect(1, 2, 8, 6, roof[1])
    t.rect(1, 2, 8, 2, roof[0])
    t.rect(1, 6, 8, 6, roof[2])
    t.rect(1, 7, 8, 10, '#efe9dc')
    t.rect(8, 7, 8, 10, '#c9c2b2')
    t.rect(2, 8, 3, 10, WOOD)
    t.window(5, 8, 6, 9)
    t.rect(10, 3, 14, 14, PAVEMENT)        # drive
    t.rect(10, 5, 14, 12, '#232831')       # car
    t.rect(11, 6, 13, 11, car)
    t.rect(11, 8, 13, 9, '#a9d8de')
    t.rect(0, 13, 8, 13, '#f4f6f8')        # fence
    for x in range(0, 9, 2):
        t.rect(x, 12, x, 14, '#f4f6f8')
    return t


# Wall, its shaded side and a trim colour for each kind, for its bigger buildings. The order
# is the one TileRenderer's KIND_ART uses.
KIND_PAINT = [
    ('#c98b74', '#a86f5b', '#f1e3c2'),     # downtown
    ('#f1ece0', '#cfc9bb', '#465060'),     # villa
    ('#b98a6a', '#96694d', '#787a7e'),     # worker
    ('#ead9b5', '#cdb994', '#5f9a6a'),     # garden
    ('#f4f6f8', '#cdd3d8', '#4fa9a2'),     # riverside
    ('#d9dde2', '#aab1ba', '#e5484d'),     # station
    ('#f0e2b8', '#cdbf95', '#465f96'),     # campus
    ('#efe9dc', '#c9c2b2', '#8f5f43'),     # suburb
]
# Two looks of each kind's house.
KIND_HOUSES = [
    [townhouse(), townhouse('#d9c7a0', '#b5a47e', '#8e3d35')],
    [villa(), villa(('#d77c67', '#b9584a', '#8e3d35'))],
    [row_house(), row_house(('#c98b74', '#a86f5b', '#7d4a3e'), '#c9c2b2', '#a39d8f')],
    [garden_house(), garden_house(('#86bd8f', '#5f9a6a', '#3f744a'), '#f6e27a')],
    [lake_house(), lake_house(('#8fb2d6', '#5f86b5', '#46689a'), '#f1ece0', '#cfc9bb')],
    [walkup(), walkup('#cfe3ea', '#a3bcc6', '#3f6fb0')],
    [study_house(), study_house(('#c98480', '#964646', '#7a3333'), '#efe9dc', '#c9c2b2')],
    [country_house(), country_house(('#8fb39a', '#6f9a7d', '#527a5f'), '#5bb6ce')],
]


def kind_flats(wall, shade, trim):
    """Level 2 of a kind: the two blocks of flats in its paint."""
    return [apartments().recolour({'#c98b74': wall, '#a86f5b': shade, '#bfa981': trim}),
            condo().recolour({'#e9e2d0': wall, '#c2baa5': shade, '#d0705a': trim})]


def kind_towers(wall, shade, trim):
    """Level 3 of a kind: the tower in its paint, with a plain roof or one in its trim."""
    return [tower().recolour({'#d98f6f': wall, '#b06f54': shade, '#d0705a': trim}),
            tower().recolour({'#d98f6f': wall, '#b06f54': shade, '#d0705a': trim, '#d8c59c': trim})]


# Three rows under the big buildings: a kind's houses, flats and towers, two looks side by side.
HOME_ROWS = [
    [tile for houses in KIND_HOUSES for tile in houses],
    [tile for paint in KIND_PAINT for tile in kind_flats(*paint)],
    [tile for paint in KIND_PAINT for tile in kind_towers(*paint)],
]

BIG = [housing_complex(), hospital(), university(), museum(), stadium(), mall(), casino(), amusement()]

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
     metro_station(), market(), high_school(), temple(), cinema(), parking(), library(), pool(), ktv()],
]

def shade(pixel, by):
    """A colour made lighter (by > 0) or darker (by < 0); `by` is a share of the way to white or black."""
    r, g, b, a = pixel
    if by >= 0:
        return (round(r + (255 - r) * by), round(g + (255 - g) * by), round(b + (255 - b) * by), a)
    return (round(r * (1 + by)), round(g * (1 + by)), round(b * (1 + by)), a)


GLASSES = {rgba(GLASS), rgba(GLASS_LIGHT)}


def fine(image, ground=False):
    """Doubles a tile and adds fine detail. `ground` is for roads and lots, which join their
    neighbours and so get grain only, not edges."""
    size = image.size[0]
    source = image.load()
    out = Image.new('RGBA', (2 * size, 2 * size), (0, 0, 0, 0))
    target = out.load()

    def at(x, y):
        return source[x, y] if 0 <= x < size and 0 <= y < size else None

    for Y in range(2 * size):
        for X in range(2 * size):
            x, y = X // 2, Y // 2
            pixel = source[x, y]
            if pixel[3] == 0:
                continue
            # Shadows painted half transparent stay as they are.
            if pixel[3] < 255:
                target[X, Y] = pixel
                continue
            same = lambda dx, dy: at(x + dx, y + dy) == pixel
            by = 0.0
            if pixel in GLASSES and not ground:
                # Panes: a dark bar between every two columns and every two rows, and a glint.
                if X % 4 == 3 and same(1, 0):
                    by = -0.28
                elif Y % 4 == 3 and same(0, 1):
                    by = -0.18
                elif (X + Y) % 8 == 1:
                    by = 0.3
            elif not ground:
                # A lit edge along the top and left of every surface and a shaded one along the
                # bottom and right, where the surface is thick enough to carry them.
                if Y % 2 == 0 and not same(0, -1) and same(0, 1):
                    by = 0.16
                elif X % 2 == 0 and not same(-1, 0) and same(1, 0):
                    by = 0.1
                elif Y % 2 == 1 and not same(0, 1) and same(0, -1):
                    by = -0.2
                elif X % 2 == 1 and not same(1, 0) and same(-1, 0):
                    by = -0.13
            if by == 0.0 and same(1, 0) and same(-1, 0) and same(0, 1) and same(0, -1):
                # Grain inside a flat surface, placed by a small hash so it does not line up.
                roll = (X * 73856093 ^ Y * 19349663) % 23
                by = -0.07 if roll == 0 else 0.05 if roll == 1 else 0.0
            target[X, Y] = shade(pixel, by) if by else pixel
    return out


# --- City styles: the same sheet with the homes and shops in another city's colours
import colorsys

# Each style: what a wall and what a roof or trim becomes, as (hue in degrees, saturation,
# brightness as a multiple of the original). A wall may have several, one per building in turn.
STYLES = {
    # San Francisco: painted row houses in pastels under grey-blue slate.
    'sf': {'walls': [(340, 0.26, 1.06), (150, 0.2, 1.04), (48, 0.3, 1.06), (205, 0.24, 1.05), (272, 0.2, 1.05), (22, 0.3, 1.06)],
           'roof': (215, 0.2, 0.82)},
    # Southern California: cream stucco under terracotta tiles.
    'california': {'walls': [(42, 0.13, 1.1), (36, 0.18, 1.06), (50, 0.1, 1.1)], 'roof': (15, 0.62, 0.95)},
    # New York: red brick and brownstone under dark flat roofs.
    'newyork': {'walls': [(12, 0.5, 0.72), (26, 0.4, 0.66), (8, 0.42, 0.6), (30, 0.3, 0.74)], 'roof': (222, 0.1, 0.52)},
}
# The rows that hold homes and shops, and the building of the big row that is housing.
STYLED_ROWS = (2, 3)
# Residential columns by level in row 2 (BUILDING_ART in TileRenderer.ts): the taller ones get the city's roof furniture.
TALL_HOMES = (3, 4, 5, 6, 7, 8, 9)


def restyle(sheet, style, F):
    """A copy of the sheet with homes and shops repainted in a style, and its small touches added."""
    out = sheet.copy()
    pixels = out.load()
    spec = STYLES[style]
    home_rows = range(len(ROWS) + 2, len(ROWS) + 2 + len(HOME_ROWS))

    def repaint(left, top, size, which):
        wall = spec['walls'][which % len(spec['walls'])]
        for y in range(top, top + size):
            for x in range(left, left + size):
                r, g, b, a = pixels[x, y]
                if a < 255:
                    continue
                h, sat, val = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
                hue = h * 360
                # Outlines, glass and greenery stay as they are.
                if val < 0.22 or (185 <= hue <= 235 and sat > 0.22) or (70 <= hue <= 165 and sat > 0.25):
                    continue
                to = wall if sat < 0.34 and val >= 0.55 else spec['roof']
                nr, ng, nb = colorsys.hsv_to_rgb(to[0] / 360, to[1], max(0.0, min(1.0, val * to[2])))
                pixels[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), 255)

    def solid(x, y):
        return pixels[x, y][3] == 255

    def touches(left, top, tall):
        """What each city puts on its buildings: only where there is building to put it on."""
        def put(x0, y0, x1, y1, colour, need=True):
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    if not need or solid(left + x, top + y):
                        pixels[left + x, top + y] = rgba(colour)
        if style == 'newyork' and tall:
            # A fire escape down the front, and a water tank on legs on the roof.
            for y in (13, 18, 23):
                put(11, y, 21, y, '#1b1d22')
                put(11, y + 1, 11, y + 3, '#1b1d22')
                put(21, y + 1, 21, y + 3, '#1b1d22')
            for step in range(4):
                put(13 + step * 2, 14 + step, 14 + step * 2, 14 + step, '#3a3f47')
            if solid(left + 22, top + 5):
                put(21, 1, 26, 5, '#6b432b', need=False)
                put(21, 1, 26, 1, '#8a5a3a', need=False)
                put(22, 0, 25, 0, '#55575b', need=False)
                put(21, 6, 21, 7, '#25232b', need=False)
                put(26, 6, 26, 7, '#25232b', need=False)
        elif style == 'sf':
            # White trim under the eaves and round the door: the painted-lady look.
            for y in range(4, 28):
                edge = [x for x in range(4, 28) if solid(left + x, top + y) and not solid(left + x, top + y - 1)]
                if len(edge) > 10:
                    put(min(edge), y, max(edge), y, '#fbf7ee')
                    break
            put(14, 22, 17, 22, '#fbf7ee')
        elif style == 'california' and not tall:
            # A row of darker tiles along the ridge.
            for x in range(6, 26, 4):
                put(x, 5, x + 1, 5, '#8f3f24')

    for row in STYLED_ROWS:
        for column in range(16):
            repaint(column * F, row * F, F, column + row)
            if row == 2:
                touches(column * F, row * F, column in TALL_HOMES)
    for index, row in enumerate(home_rows):
        for column in range(16):
            repaint(column * F, row * F, F, column // 2 + index)
            touches(column * F, row * F, index > 0)
    # The housing complex, first of the big buildings.
    repaint(0, len(ROWS) * F, 2 * F, 1)
    return out


if __name__ == '__main__':
    F = 2 * T
    sheet = Image.new('RGBA', (16 * F, (len(ROWS) + 2 + len(HOME_ROWS)) * F), (0, 0, 0, 0))
    for row, tiles in enumerate(ROWS):
        for column, tile in enumerate(tiles):
            sheet.paste(fine(tile.image, ground=row < 2), (column * F, row * F))
    for column, tile in enumerate(BIG):
        sheet.paste(fine(tile.image), (column * 2 * F, len(ROWS) * F))
    for row, tiles in enumerate(HOME_ROWS):
        for column, tile in enumerate(tiles):
            sheet.paste(fine(tile.image), (column * F, (len(ROWS) + 2 + row) * F))
    sheet.save(OUT)
    print(f'wrote {OUT}')
    for style in STYLES:
        path = OUT.with_name(f'city-{style}.png')
        restyle(sheet, style, F).save(path)
        print(f'wrote {path}')
