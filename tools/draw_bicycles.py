"""One code-authored voxel bicycle and seated rider, baked with sprite-stacking's renderer.

All diagnostic views, layer strips and 16 headings share the exact same geometry.
Two opposed pedal poses use a fixed pivot; the parked bicycle has no rider.
"""
import importlib.util
import json
import math
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from draw_residents import CONFIG, palette, DOC as PEOPLE_DOC
from pixel_actors import orthographic_views

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'src/assets/street'
DOC = ROOT/'docs/design-assets/bicycle'
spec = importlib.util.spec_from_file_location('bike_stack_baker',Path(__file__).with_name('bake-cars.py'))
baker = importlib.util.module_from_spec(spec); spec.loader.exec_module(baker)
FRAME = 64
PIVOT = (32,45)
MASTER_SCALE = 2


def volume(look, age, phase, rider=True, scooter=False):
    s = MASTER_SCALE
    v = np.zeros((44*s,32*s,14*s,4),dtype=np.uint8)
    p = {k:tuple(bytes.fromhex(c[1:]))+(255,) for k,c in palette(look,age).items()}
    def box(x0,x1,y0,y1,z0,z1,c): v[round(z0*s):round((z1+1)*s),round(y0*s):round((y1+1)*s),round(x0*s):round((x1+1)*s)] = p[c]
    def rod(a,b,c,r=.9):
        a,b = np.array(a)*s,np.array(b)*s; r *= s
        for t in np.linspace(0,1,max(2,math.ceil(math.dist(a,b)*2))):
            x,y,z = np.array(a)*(1-t)+np.array(b)*t
            for ix in range(max(0,math.floor(x-r)),min(14*s,math.ceil(x+r)+1)):
                for iy in range(max(0,math.floor(y-r)),min(32*s,math.ceil(y+r)+1)):
                    for iz in range(max(0,math.floor(z-r)),min(44*s,math.ceil(z+r)+1)):
                        if (ix-x)**2+(iy-y)**2+(iz-z)**2 <= r*r+.3: v[iz,iy,ix]=p[c]
    for axle in [6,25]:
        for iz in range(11*s):
            z=iz/s
            for iy in range((axle-5)*s,(axle+6)*s):
                y=iy/s
                radial=math.hypot(y-axle,z-5)
                if radial>5.1: continue
                if radial>=3.6: box(5.5,6.5,y,y,z,z,'ink' if radial>4.5 else 'metal2')
                elif abs(y-axle)<=.7 or abs(z-5)<=.7 or abs((y-axle)-(z-5)*(-1 if phase else 1))<.8:
                    box(6,6,y,y,z,z,'metal1')
        box(5,7,axle-1,axle+1,4,6,'metal3')
    # Separate the refined tube structure from the motor scooter's step-through body.
    for a,b in [((6,6,5),(6,12,17)),((6,12,17),(6,16,7)),((6,16,7),(6,6,5)),
                ((6,12,17),(6,23,16)),((6,23,16),(6,16,7)),((6,23,16),(6,25,5))]:
        rod(a,b,'body0',1.25); rod(a,b,'body2',.7)
    rod((6,12,17),(6,11,21),'metal1',1)
    box(3,9,8,13,20,21,'ink'); box(4,8,8,12,22,22,'wood1')
    rod((6,23,16),(6,24,21),'metal2',1)
    rod((2,24,21),(11,24,21),'ink',1.1)
    box(1,3,23,25,20,22,'wood0'); box(10,12,23,25,20,22,'wood0')
    # Chain joins the rear hub to the crank, kept visibly separate from the diagonal frame.
    rod((8,6,5),(8,16,5),'metal0',.7); rod((8,6,5),(8,16,8),'metal1',.7)
    for x,offset in [(3,phase),(10,1-phase)]:
        rod((6,16,7),(x,16+(2 if offset else -2),7+(2 if offset else -2)),'metal2',.8)
        box(x-1,x+1,15+(2 if offset else -2),17+(2 if offset else -2),7+(2 if offset else -2),7+(2 if offset else -2),'ink')
    box(5,7,30,31,12,14,'wall3'); box(5,7,0,1,12,14,'flower0')
    if scooter:
        # Keep the two wheels; replace bicycle tubes, crank and saddle with a scooter shell.
        v[11*s:] = 0
        # Clear the crank area only; both complete tyre circles must survive.
        v[:11*s,12*s:20*s] = 0
        box(2,10,7,15,10,16,'body0'); box(2,9,7,14,14,17,'body1')
        box(3,9,8,14,18,20,'ink'); box(3,8,8,13,21,21,'wood1')
        box(2,10,14,23,7,8,'metal0'); box(3,9,15,22,9,9,'metal1')
        rod((6,22,9),(6,24,20),'body1',2.4)
        rod((5,22,10),(5,24,20),'body2',1)
        rod((2,24,22),(11,24,22),'metal0',1)
        box(1,3,23,25,21,23,'ink'); box(10,12,23,25,21,23,'ink')
        box(4,8,25,26,18,21,'metal0'); box(5,7,26,26,19,20,'wall3')
        for x in [1,12]:
            rod((x,24,22),(x,24,27),'metal1',.5)
            box(x-.5,x+.5,23,24,27,28,'metal2')
        box(5,7,2,3,12,14,'flower0')
    if not rider: return v
    shrink = 5 if age==0 else 0
    hip=(6,11,25-shrink); chest=(6,17,33-shrink)
    rod(hip,chest,'body1',3)
    rod((4,12,26-shrink),(4,17,32-shrink),'body2',1.3)
    for x,offset in [(3,phase),(10,1-phase)]:
        foot=(x,20 if scooter else 16+(2 if offset else -2),10 if scooter else 9 if offset else 5)
        knee=(x,18 if offset else 14,17-shrink)
        rod((x,11,24-shrink),knee,'wood0',1.8); rod(knee,foot,'wood2',1.3)
        rod((x,foot[1]-1,foot[2]),(x,foot[1]+2,foot[2]),'ink',1.2)
        rod((x,17,31-shrink),(x,21,25-shrink),'body0',1.3)
        rod((x,21,25-shrink),(x,24,22),'skin1',1.1)
    hair='hair1'
    box(3,9,18,24,34-shrink,40-shrink,'skin1')
    box(3,8,19,24,36-shrink,39-shrink,'skin2')
    box(3,9,17,23,40-shrink,42-shrink,hair)
    box(3,4,18,22,37-shrink,40-shrink,'hair0')
    box(3,8,18,22,42-shrink,43-shrink,'hair2')
    box(4,5,24,24,38-shrink,39-shrink,'ink'); box(8,9,24,24,38-shrink,39-shrink,'ink')
    style=look['hair']
    if style in ['bob','ponytail','bun']:
        box(3,9,16,18,37-shrink,41-shrink,'hair0')
        if style in ['ponytail','bun']: box(4,8,14,17,37-shrink,40-shrink,'hair1')
    if style=='curly':
        for x,y in [(3,18),(6,17),(9,20)]: box(x-1,x+1,y-1,y+1,40-shrink,43-shrink,'hair0')
    if style=='cap':
        box(2,10,17,23,41-shrink,43-shrink,'body0'); box(2,10,24,26,40-shrink,41-shrink,'body2')
    if style=='glasses':
        box(3,9,24,24,37-shrink,38-shrink,'ink')
        box(5,7,24,24,37-shrink,37-shrink,'skin1')
        if look.get('gender')=='female':
            box(2,3,17,21,34-shrink,40-shrink,'hair0')
            box(9,10,17,21,34-shrink,40-shrink,'hair0')
    # Shirt collar and a readable ear are structural colour clusters in the master.
    rod((4,18,33-shrink),(8,18,33-shrink),'wall3',.65)
    box(2.5,3,21,22,36-shrink,37-shrink,'skin0')
    return v


def main(scooters_only=False):
    DOC.mkdir(parents=True,exist_ok=True)
    sheet=Image.new('RGBA',(FRAME*16,FRAME*2*25))
    contact=Image.new('RGB',(16*96,5*120),'#202a33'); d=ImageDraw.Draw(contact)
    scooter_sheet=Image.new('RGBA',(FRAME*16,FRAME*25))
    masters=[]
    for profile in range(25):
        age,variant=divmod(min(profile,23),8)
        for phase in ([] if scooters_only else range(2)):
            model=volume(CONFIG['looks'][variant],age,phase,profile<24)
            for heading in range(16):
                master=baker.render(model,heading*math.tau/16,frame=FRAME*MASTER_SCALE,pivot=tuple(p*MASTER_SCALE for p in PIVOT),squash=.8,spacing=.75,outline=False)
                frame=baker.reduce_master(master,FRAME)
                if profile==8 and phase==0: masters.append(master)
                sheet.paste(frame,(heading*FRAME,(profile*2+phase)*FRAME))
                if profile in [0,8,11,16,24] and phase==0:
                    row=[0,8,11,16,24].index(profile)
                    contact.paste(frame.resize((96,96),Image.Resampling.NEAREST),(heading*96,row*120),frame.resize((96,96),Image.Resampling.NEAREST))
                    d.text((heading*96+3,row*120+98),f'{heading*22.5:g} deg',fill='#e1d8bf')
        scooter_model=volume(CONFIG['looks'][variant],age,0,profile<24,scooter=True)
        for heading in range(16):
            master=baker.render(scooter_model,heading*math.tau/16,frame=FRAME*MASTER_SCALE,pivot=tuple(p*MASTER_SCALE for p in PIVOT),squash=.8,spacing=.75,outline=False)
            scooter_sheet.paste(baker.reduce_master(master,FRAME),(heading*FRAME,profile*FRAME))
    scooter_sheet.save(OUT/'scooters.png',optimize=True)
    metadata={'artSource':'code','density':4,'frame':FRAME,'directions':16,'phases':2,'profiles':24,'parkedProfile':24,'pivot':list(PIVOT)}
    (OUT/'scooters.json').write_text(json.dumps({**metadata,'phases':1},indent=2)+'\n')
    if scooters_only:
        print('Baked 400 scooter frames, preserving both complete tyre circles.')
        return
    sheet.save(OUT/'bicycles.png',optimize=True)
    contact.save(DOC/'bicycle-turntable.png')
    master_sheet=Image.new('RGBA',(FRAME*MASTER_SCALE*16,FRAME*MASTER_SCALE))
    for heading,master in enumerate(masters):master_sheet.paste(master,(heading*FRAME*MASTER_SCALE,0))
    master_sheet.save(DOC/'bicycle-master-turntable.png',optimize=True)
    model=volume(CONFIG['looks'][0],1,0)
    strip=Image.new('RGBA',(model.shape[2]*model.shape[0],model.shape[1]))
    for z,layer in enumerate(model):strip.paste(Image.fromarray(layer),(z*model.shape[2],0))
    strip.save(DOC/'bicycle-slices.png')
    views=orthographic_views(model)
    diagnostic=Image.new('RGB',(sum(v.width for v in views)*6+200,max(v.height for v in views)*6+60),'white')
    x=20
    for name,view in zip(['TOP','SIDE','FRONT','BACK'],views):
        diagnostic.paste(view.resize((view.width*6,view.height*6),Image.Resampling.NEAREST),(x,25),view.resize((view.width*6,view.height*6),Image.Resampling.NEAREST))
        ImageDraw.Draw(diagnostic).text((x,8),name,fill='black');x+=view.width*6+40
    diagnostic.save(DOC/'bicycle-views.png')
    (OUT/'bicycles.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print('Baked 800 bicycle frames from shared voxel geometry; actor atlas %.2f MiB RGBA.'%(sheet.width*sheet.height*4/1024**2))


if __name__=='__main__':main('--scooters-only' in sys.argv)
