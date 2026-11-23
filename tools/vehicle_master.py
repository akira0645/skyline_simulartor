"""Authored car volumes at twice the previous native grid; never image upscaling.

Continuous panel profiles are rasterised into the master. All orthographic views
and headings derive from these same wheel arches, cabin, bonnet and boot.
"""
import math
import numpy as np

SCALE = 2


def car_volume(palette, size=0):
    s = SCALE
    v = np.zeros((24*s, 44*s, 24*s, 4), dtype=np.uint8)
    p = {key: tuple(bytes.fromhex(value[1:]))+(255,) for key, value in palette.items()}
    def box(x0,x1,y0,y1,z0,z1,c):
        v[round(z0*s):round((z1+1)*s),round(y0*s):round((y1+1)*s),round(x0*s):round((x1+1)*s)] = p[c]
    axles = [10,33]
    # Sculpt the lower shell and remove actual wheel openings before installing tyres.
    for iz in range(5*s,13*s):
        z = iz/s
        for iy in range(2*s,42*s):
            y = iy/s
            end = max(0, 4-y, y-39)
            inset = .45*end + max(0,z-10)*.35
            x0 = round((2+inset)*s); x1 = 24*s-x0
            v[iz,iy,x0:x1] = p['body0' if z<7 else 'body1']
            if z>10: v[iz,iy,x0:x0+1] = p['body2']
            for axle in axles:
                if (y-axle)**2+(z-3.5)**2 < 4.5**2:
                    v[iz,iy,:4*s] = 0; v[iz,iy,20*s:] = 0
    box(4,19,3,40,3,4,'deep')
    for axle in axles:
        for iz in range(1*s,8*s):
            for iy in range((axle-4)*s,(axle+4)*s):
                d = math.hypot(iy/s-axle,iz/s-3.7)
                if d>3.55: continue
                for x in list(range(s,3*s))+list(range(21*s,23*s)):
                    c = 'ink' if d>2.25 else 'metal0'
                    if d<1.65: c = 'metal2' if iz/s>3.7 else 'metal1'
                    if abs(iy/s-axle)<.4 or abs(iz/s-3.7)<.4:
                        if d<2: c='metal3'
                    v[iz,iy,x] = p[c]
    # Distinct compact / sedan / luxury cabins, sharing the world's existing footprint.
    back, front = [(9,31),(11,30),(10,31)][size]
    for iz in range(12*s,22*s):
        z = iz/s
        inset = max(0,z-13)*.23
        rear = back+max(0,z-12)*.58
        nose = front-max(0,z-12)*.62
        x0=round((4+inset)*s); x1=24*s-x0
        y0=round(rear*s); y1=round(nose*s)
        v[iz,y0:y1+1,x0:x1] = p['body1']
        if 13<z<20:
            v[iz,y1-1:y1+1,x0+2:x1-2] = p['glass1']
            v[iz,y0:y0+2,x0+2:x1-2] = p['glass0']
            for x,c in [(x0,'glass1'),(x1-1,'glass0')]:
                v[iz,y0+3:y1-2,x:x+1] = p[c]
                v[iz,20*s:21*s,x:x+1] = p['body0']
                if z>17: v[iz,y0+4:y0+7,x:x+1] = p['glass2']
            if 17<z<18:
                v[iz,y1,x0+3:x0+9] = p['glass3']
        if z>=20:
            v[iz,y0:y1+1,x0:x1] = p['body2']
            v[iz,y0+1:y1,x0:x0+1] = p['body3']
    # Raised bonnet ridge, recessed grille, bumpers, lamps and door seams.
    box(5,18,32,39,12,12,'body2')
    box(6,17,4,8,12,12,'body1')
    box(7,16,41,41,6,8,'deep')
    box(8,15,41,41,7,7,'metal1')
    for y in [2,41]: box(5,18,y,y,5,5,'metal1')
    for x in [4,17]:
        box(x,x+2,40,41,9,10,'wall3')
        box(x,x+2,2,3,8,9,'tile2')
    box(10,13,42,42,6,7,'metal3')
    box(10,13,1,1,6,7,'metal1')
    for x in [2,21]:
        box(x,x,20,20,8,11,'body0')
        box(x,x,23,25,10,10,'metal2')
        box(x-1,x+1,28,29,13,14,'body0')
        box(x-1,x+1,29,29,14,14,'body2')
    return v
