"""Bake approved exterior families into the existing map layout, code authoring only.

Draw native 256px / 512px masters, then reduce to the existing 128px / 32px atlas
frames. Unmapped special-purpose buildings and terrain retain published artwork.
"""
import json
from pathlib import Path
from PIL import Image
import draw_tiles as dt
from draw_tiles_hd import restyle_hd
from building_exteriors import exterior_for

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'src/assets'
DOC=ROOT/'docs/design-assets/buildings'
MASTER=256
DETAIL=128


def entries():
    for row in range(2,6):
        for col,tile in enumerate(dt.ROWS[row]):
            kind='home' if row==2 else 'shop' if row==3 and col in (0,1,3,4,7) else 'office' if row==3 else 'industrial' if row==4 else 'civic'
            yield row,col,1,tile,kind,0
    for col,tile in enumerate(dt.BIG): yield 6,col*2,2,tile,'home' if col==0 else 'civic',0
    for row,tiles in enumerate(dt.HOME_ROWS,8):
        for col,tile in enumerate(tiles): yield row,col,1,tile,'home',row-7
    for row,tiles in enumerate(dt.INDUSTRY_ROWS,11):
        for col,tile in enumerate(tiles): yield row,col,1,tile,('metal','food','warehouse')[row-11],col+1
    for col,bank in enumerate((False,True)): yield 14,col,1,bank,'front',0
    for col,kind in enumerate(('culture','coldstore','square','daycare','recycling','workshop','gas'),2):
        yield 14,col,1,dt.civic_details(kind),'civic',0
    yield 14,12,1,dt.family_clinic(),'civic',0
    for col,kind in enumerate(('bakery','florist','cakeshop'),13): yield 14,col,1,dt.corner_shop(kind),'shop',0
    for col,kind in enumerate(('community','eldercare','memorial')): yield 15,col*2,2,dt.life_building(kind),'civic',0


def build():
    DOC.mkdir(parents=True,exist_ok=True)
    original=Image.open(ASSETS/'city.png').convert('RGBA')
    detail=Image.open(ASSETS/'buildings/city-detail.png').convert('RGBA')
    master_sheet=Image.new('RGBA',(original.width*8,original.height*8))
    manifest=[]
    for row,col,span,_,kind,_ in entries():
        art,name=exterior_for(row,col,span,kind)
        updated=art is not None
        if updated:
            assert art.size==(span*MASTER,span*MASTER),(row,col,'Incorrect master dimensions')
            bounds=art.getbbox()
            assert bounds and bounds[0]>0 and bounds[1]>0 and bounds[2]<art.width and bounds[3]<art.height,(row,col,'Exterior clips the master frame')
            master_sheet.paste(art,(col*MASTER,row*MASTER))
            detail.paste(art.resize((span*DETAIL,span*DETAIL),Image.Resampling.NEAREST),(col*DETAIL,row*DETAIL))
        manifest.append({'row':row,'column':col,'span':span,'kind':kind,'updated':updated,'exterior':name})
    master_sheet.save(DOC/'city-master.png',optimize=True)
    updated_frames=[entry for entry in manifest if entry['updated']]
    for style in ('classic',*dt.STYLES):
        name='city' if style=='classic' else f'city-{style}'
        styled=detail if style=='classic' else restyle_hd(detail,style,DETAIL,DETAIL//32)
        base=Image.open(ASSETS/f'{name}.png').convert('RGBA')
        previous=Image.open(ASSETS/f'buildings/{name}-detail.png').convert('RGBA')
        for entry in updated_frames:
            row,col,span=entry['row'],entry['column'],entry['span']
            box=(col*DETAIL,row*DETAIL,(col+span)*DETAIL,(row+span)*DETAIL)
            frame=styled.crop(box)
            previous.paste(frame,box[:2])
            base.paste(frame.resize((span*32,span*32),Image.Resampling.NEAREST),(col*32,row*32))
        base.save(ASSETS/f'{name}.png',optimize=True)
        previous.save(ASSETS/f'buildings/{name}-detail.png',optimize=True)
        print(f'{name}: {len(updated_frames)} exterior frames updated; {len(manifest)-len(updated_frames)} retained; atlas sizes unchanged',flush=True)
    (DOC/'manifest.json').write_text(json.dumps({'artSource':'code','masterTile':MASTER,'detailTile':DETAIL,
        'baseTile':32,'framesPerTheme':len(manifest),'updatedPerTheme':len(updated_frames),
        'themes':['classic',*dt.STYLES],'frames':manifest},indent=2)+'\n')


if __name__=='__main__': build()
