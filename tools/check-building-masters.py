"""Check the real atlas frames and export before/after and native-master comparisons."""
import io
import json
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from building_masters import dt,ASSETS,DOC,MASTER

BASELINE='4dd3050'
SOURCE_BYTES={}
def before(path):
    if path not in SOURCE_BYTES: SOURCE_BYTES[path]=subprocess.check_output(['git','show',f'{BASELINE}:{path}'])
    return Image.open(io.BytesIO(SOURCE_BYTES[path])).convert('RGBA')
try: font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',17)
except OSError: font=ImageFont.load_default()
manifest=json.loads((DOC/'manifest.json').read_text())
master=Image.open(DOC/'city-master.png').convert('RGBA')
updated=[entry for entry in manifest['frames'] if entry['updated']]
results=[]
for style in manifest['themes']:
    name='city' if style=='classic' else f'city-{style}'
    base=Image.open(ASSETS/f'{name}.png').convert('RGBA')
    detail=Image.open(ASSETS/f'buildings/{name}-detail.png').convert('RGBA')
    old_base=before(f'src/assets/{name}.png'); old_detail=before(f'src/assets/buildings/{name}-detail.png')
    assert base.size==old_base.size and detail.size==old_detail.size
    assert np.array_equal(np.array(base.crop((0,0,base.width,64))),np.array(old_base.crop((0,0,base.width,64))))
    assert np.array_equal(np.array(detail.crop((0,0,detail.width,256))),np.array(old_detail.crop((0,0,detail.width,256))))
    # These native office panes have no regional facade attachments. Glass must
    # remain glass in every palette, including the diagonal reflected-sky colour.
    office_box=(2*128,3*128,3*128,4*128)
    office=np.array(Image.open(ASSETS/'buildings/city-detail.png').convert('RGBA').crop(office_box))
    themed=np.array(detail.crop(office_box))
    glazing=np.zeros(office.shape[:2],dtype=bool)
    for colour in ['#75a9bf','#aed4e0','#5c8398','#365668']:
        glazing|=np.all(office[...,:3]==dt.rgba(colour)[:3],axis=-1)&(office[...,3]==255)
    assert glazing.any() and np.array_equal(office[glazing],themed[glazing]),(style,'Glass repainted as wall')
    gallery=Image.new('RGB',(16*150,8*170),'#202a33'); draw=ImageDraw.Draw(gallery)
    alpha_changed=0
    for i,entry in enumerate(manifest['frames']):
        row,col,span=entry['row'],entry['column'],entry['span']
        b=(col*32,row*32,(col+span)*32,(row+span)*32)
        d=tuple(v*4 for v in b)
        small=base.crop(b); large=detail.crop(d)
        if entry['updated']:
            assert np.array_equal(np.array(small),np.array(large.resize(small.size,Image.Resampling.NEAREST))), (style,row,col,'different source')
            native=np.array(master.crop((col*MASTER,row*MASTER,(col+span)*MASTER,(row+span)*MASTER)))
            assert not native[0,:,3].any() and not native[-1,:,3].any() and not native[:,0,3].any() and not native[:,-1,3].any(),(row,col,'master clipped')
            if style=='classic':
                assert np.array_equal(np.array(large),np.array(Image.fromarray(native).resize(large.size,Image.Resampling.NEAREST)))
        else:
            assert np.array_equal(np.array(small),np.array(old_base.crop(b))), (style,row,col,'retained base changed')
            assert np.array_equal(np.array(large),np.array(old_detail.crop(d))), (style,row,col,'retained detail changed')
        assert large.getbbox() is not None
        alpha_changed+=int(not np.array_equal(np.array(small)[...,3],np.array(old_base.crop(b))[...,3]))
        thumb=large.resize((span*64,span*64),Image.Resampling.NEAREST)
        x=(i%16)*150; y=(i//16)*170
        gallery.paste(thumb,(x+(150-thumb.width)//2,y+15),thumb)
        draw.text((x+7,y+145),f'{row}:{col} {"NEW" if entry["updated"] else "retained"}',fill='#e1d8bf',font=font)
    for col in [9,10,11]:
        b=(col*32,14*32,(col+1)*32,15*32)
        assert np.array_equal(np.array(base.crop(b)),np.array(old_base.crop(b)))
        d=tuple(v*4 for v in b)
        assert np.array_equal(np.array(detail.crop(d)),np.array(old_detail.crop(d)))
    gallery.save(DOC/f'all-buildings-{style}.png',optimize=True)
    results.append({'theme':style,'frames':len(manifest['frames']),'baseSize':base.size,'detailSize':detail.size,
        'updatedFrames':len(updated),'retainedFrames':len(manifest['frames'])-len(updated),
        'updatedBaseFromDetail':True,'protectedGlazing':True,'groundUnchanged':True,'iconsUnchanged':True,'baseAlphaChangedFrames':alpha_changed,
        'detailRgbaMiB':detail.width*detail.height*4/1024**2,
        'pngBeforeBytes':len(SOURCE_BYTES[f'src/assets/{name}.png'])+len(SOURCE_BYTES[f'src/assets/buildings/{name}-detail.png']),
        'pngAfterBytes':(ASSETS/f'{name}.png').stat().st_size+(ASSETS/f'buildings/{name}-detail.png').stat().st_size})

samples=[('House',2,0),('Cottage',2,2),('Apartment',2,3),('Office',3,2),('Shop',3,0),('Factory',4,0),
         ('Warehouse',4,1),('School',5,4),('Water tower',5,1),('Library',5,13),('Bank',14,1),('Bakery',14,13)]
old=before('src/assets/buildings/city-detail.png'); new=Image.open(ASSETS/'buildings/city-detail.png').convert('RGBA')
compare=Image.new('RGB',(1200,4*250),'#202a33'); draw=ImageDraw.Draw(compare)
for i,(name,row,col) in enumerate(samples):
    x=(i%3)*400; y=(i//3)*250
    draw.text((x+8,y+5),f'{name} / BEFORE                       AFTER',fill='#e1d8bf',font=font)
    for j,image in enumerate((old,new)):
        frame=image.crop((col*128,row*128,(col+1)*128,(row+1)*128)).resize((192,192),Image.Resampling.NEAREST)
        compare.paste(frame,(x+j*200,y+32),frame)
compare.save(DOC/'before-after-6x.png',optimize=True)

# The housing complex's open courtyard is grass, never a green shingled roof.
for x,y in [(75,107),(43,103)]:
    assert master.getpixel((x*4+2,6*MASTER+y*4+2))==dt.rgba('#74965c'), 'Courtyard material changed'
process=Image.new('RGB',(1000,4*290),'#202a33'); draw=ImageDraw.Draw(process)
for i,(name,row,col) in enumerate(samples[:4]):
    y=i*290
    draw.text((15,y+4),name+' / NATIVE MASTER 256',fill='#e1d8bf',font=font)
    art=master.crop((col*MASTER,row*MASTER,(col+1)*MASTER,(row+1)*MASTER))
    process.paste(art,(0,y+25),art)
    for x,zoom in [(350,1),(500,3),(730,6)]:
        draw.text((x,y+15),f'GAME {zoom}x',fill='#e1d8bf',font=font)
        image=new.crop((col*128,row*128,(col+1)*128,(row+1)*128)).resize((32*zoom,32*zoom),Image.Resampling.NEAREST)
        process.paste(image,(x,y+85),image)
process.save(DOC/'master-to-game.png',optimize=True)
for name,row,col in [samples[0],samples[3],samples[7],samples[10]]:
    new.crop((col*128,row*128,(col+1)*128,(row+1)*128)).save(DOC/f'{name.lower()}-native.png')
(DOC/'verification.json').write_text(json.dumps({'baseline':BASELINE,'nativeExteriorFrames':len(updated),'courtyardMaterialChecks':2,'themes':results},indent=2)+'\n')
print(json.dumps({'nativeExteriorFrames':len(updated),'themes':results},indent=2))
