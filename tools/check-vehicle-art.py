"""Validate baked frame bounds and export native-size examples for independent review."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from draw_bicycles import volume, CONFIG, baker

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT/'docs/design-assets/vehicles'
DOC.mkdir(parents=True,exist_ok=True)
results=[]
for name, folder, row in [('cars','vehicles',0),('bicycles','street',16),('scooters','street',8)]:
    image=Image.open(ROOT/f'src/assets/{folder}/{name}.png').convert('RGBA')
    meta=json.loads((ROOT/f'src/assets/{folder}/{name}.json').read_text())
    frame=meta.get('frame',meta.get('frameSize'))
    rows=len(meta['sizes'])*len(meta['colours']) if name=='cars' else (meta['profiles']+1)*meta['phases']
    assert image.size==(meta['directions']*frame,rows*frame)
    for y in range(rows):
        for x in range(meta['directions']):
            a=np.array(image.crop((x*frame,y*frame,(x+1)*frame,(y+1)*frame)))
            assert a[...,3].max()==255, (name,x,y,'empty')
            assert not a[0,:,3].any() and not a[-1,:,3].any() and not a[:,0,3].any() and not a[:,-1,3].any(), (name,x,y,'clipped')
            assert set(np.unique(a[...,3])) <= {0,55,255}, (name,x,y,'fractional alpha')
    image.crop((0,row*frame,frame,(row+1)*frame)).save(DOC/f'{name}-native.png')
    results.append({'name':name,'size':image.size,'frames':rows*meta['directions'],
        'rgbaMiB':image.width*image.height*4/1024**2,'pngBytes':(ROOT/f'src/assets/{folder}/{name}.png').stat().st_size,
        'frameEdgesClear':True,'alpha':[0,55,255]})
(DOC/'atlas-check.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))

# Authoring-only scooter master; the game loads its already reduced atlas above.
model=volume(CONFIG['looks'][0],1,0,scooter=True)
for axle in [6,25]:
    for angle in np.linspace(0,np.pi*2,16,endpoint=False):
        y=round((axle+4.7*np.cos(angle))*2); z=round((5+4.7*np.sin(angle))*2)
        assert model[z,y,12,3] == 255, ('Scooter tyre must remain a complete circle',axle,angle)
master_sheet=Image.new('RGBA',(128*16,128))
for heading in range(16):
    master=baker.render(model,heading*np.pi/8,frame=128,pivot=(64,90),squash=.8,spacing=.75,outline=False)
    master_sheet.paste(master,(heading*128,0))
master_sheet.save(DOC/'scooter-master-turntable.png',optimize=True)

overview=Image.new('RGB',(1200,650),'#202a33'); draw=ImageDraw.Draw(overview)
try: font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',16)
except OSError: font=ImageFont.load_default()
draw.text((20,10),'CODE-AUTHORED VEHICLE MASTERS / SAME ATLAS AT 6x',fill='#e1d8bf',font=font)
for angle in range(8): draw.text((angle*150+55,43),f'{angle*45} deg',fill='#e1d8bf',font=font)
for row,(name,folder,profile) in enumerate([('bicycles','street',22),('scooters','street',8),('cars','vehicles',0),('cars','vehicles',9),('cars','vehicles',23)]):
    image=Image.open(ROOT/f'src/assets/{folder}/{name}.png').convert('RGBA')
    meta=json.loads((ROOT/f'src/assets/{folder}/{name}.json').read_text())
    frame=meta.get('frame',meta.get('frameSize')); dim=round(frame*6/meta['density'])
    draw.text((8,85+row*110),['Bicycle','Scooter','Compact','Sedan','Luxury'][row],fill='#e1d8bf',font=font)
    for angle in range(8):
        x=angle*150+75; y=150+row*110
        art=image.crop((angle*2*frame,profile*frame,(angle*2+1)*frame,(profile+1)*frame)).resize((dim,dim),Image.Resampling.NEAREST)
        overview.paste(art,(x-round(meta['pivot'][0]*6/meta['density']),y-round(meta['pivot'][1]*6/meta['density'])),art)
overview.save(DOC/'vehicles-overview.png',optimize=True)
