"""Approved exterior families: silhouettes first, native geometry, no image model.

Functions supply production masters to building_masters.py. Running this file only
exports design-study images; it does not overwrite the game atlases.
"""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import math
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/design-assets/buildings/exteriors'


def lighten(colour,amount):
    c=tuple(bytes.fromhex(colour[1:]))
    return '#'+''.join(f'{round(v+(255-v)*amount if amount>=0 else v*(1+amount)):02x}' for v in c)


def repaint(image, colours):
    src=np.array(image); out=src.copy()
    ramps=dict(colours)
    for old,new in colours.items():
        for amount in [-.15,-.1,.1,.15,.2,.28,.45]: ramps[lighten(old,amount)]=lighten(new,amount)
    for old,new in ramps.items():
        mask=np.all(src[...,:3]==tuple(bytes.fromhex(old[1:])),axis=-1)&(src[...,3]>0)
        out[...,:3][mask]=tuple(bytes.fromhex(new[1:]))
    return Image.fromarray(out)


class Drawing:
    def __init__(self,size=64):
        self.s=4; self.size=size
        self.image=Image.new('RGBA',(size*self.s,size*self.s))
        self.d=ImageDraw.Draw(self.image)
    def box(self,b,c): self.d.rectangle(tuple(round(x*self.s) for x in b),fill=c)
    def poly(self,p,c): self.d.polygon([(round(x*self.s),round(y*self.s)) for x,y in p],fill=c)
    def line(self,p,c,w=1): self.d.line([(round(x*self.s),round(y*self.s)) for x,y in p],fill=c,width=max(1,round(w*self.s)))
    def oval(self,b,c): self.d.ellipse(tuple(round(x*self.s) for x in b),fill=c)
    def window(self,x,y,w=7,h=9):
        self.box((x,y,x+w,y+h),'#365668')
        self.box((x+.7,y+.7,x+w-.7,y+h-1),'#75a9bf')
        self.box((x+.7,y+.7,x+w-.7,y+1.6),'#5c8398')
        self.poly([(x+1,y+1),(x+3,y+1),(x+w-1,y+h-2),(x+w-3,y+h-2)],'#aed4e0')
        self.line([(x+w/2,y+1),(x+w/2,y+h-1)],'#e7e3cc',.5)
        self.box((x-.3,y+h,x+w+.7,y+h+.8),'#dfd9c3')
        self.line([(x-.3,y+h+.8),(x+w+.7,y+h+.8)],'#a7ac9c',.5)
    def door(self,x,y,w=7,h=13):
        self.box((x-.7,y-.7,x+w+.7,y+h),'#c2ad89')
        self.box((x,y,x+w,y+h),'#503c37')
        self.box((x+1,y+1,x+w-1,y+h),'#89613e')
        self.line([(x+1,y+5),(x+w-1,y+5)],'#61442f',.5)
        self.box((x+w-2,y+h*.6,x+w-1.2,y+h*.6+.8),'#e6c26f')
    def volume(self,x,y,w,h,wall='#e5d5ad',side='#b3a180',depth=5):
        self.poly([(x+w,y),(x+w+depth,y-depth),(x+w+depth,y+h-depth),(x+w,y+h)],side)
        self.box((x,y,x+w,y+h),wall)
        if wall in ('#c88d77','#c98b74','#d3a28b','#d0ab8f') and h>=18:
            for course,yy in enumerate(range(round(y+2),round(y+h),3)):
                self.line([(x+.5,yy),(x+w-.5,yy)],lighten(wall,.1),.5)
                for xx in range(round(x+3*(course%2)),round(x+w),6):
                    self.line([(xx,yy),(xx,min(y+h-1,yy+3))],lighten(wall,.1),.5)
        self.box((x,y+h-1,x+w,y+h),'#b1a28a')
        self.poly([(x,y),(x+depth,y-depth),(x+w+depth,y-depth),(x+w,y)],'#eee0bd')
        self.line([(x,y),(x+w,y)],lighten(wall,.15),.7)
        self.line([(x+w,y),(x+w,y+h-1)],lighten(wall,-.1),.5)
    def gable(self,x,y,w,h,roof='#b85c4c',side='#8c443d',wall='#e9dabb'):
        eave=y+h*.44; bottom=y+h; ridge=x+w/2; depth=w*.17
        self.volume(x,eave,w,bottom-eave,wall,'#bfad89',depth)
        self.poly([(x,eave),(ridge,y),(x+w,eave)],wall)
        self.poly([(ridge,y),(ridge+depth,y-depth*.6),(x+w+depth,eave-depth*.6),(x+w,eave)],roof)
        self.poly([(x-2,eave),(ridge,y-1),(x+w+2,eave),(x+w,eave+2),(ridge,y+3),(x,eave+2)],side)
        for t in [.3,.6]:
            self.line([(ridge+depth*t,y-depth*.6*t),(x+w+depth*t,eave-depth*.6*t)],lighten(roof,.28),.6)
        self.line([(ridge,y),(ridge+depth,y-depth*.6)],lighten(roof,.45),1)
        rgb=tuple(bytes.fromhex(roof[1:]))
        if rgb[0]>rgb[1]*1.08:
            for t in [.22,.44,.66,.88]:
                xx=ridge+(x+w-ridge)*t; yy=y+(eave-y)*t
                self.line([(xx,yy),(xx+depth,yy-depth*.6)],lighten(roof,-.15),.5)


def house(villa=False):
    p=Drawing()
    if villa:
        p.gable(5,10,31,46,'#688291','#405a6a')
        p.gable(33,29,23,27,'#688291','#405a6a')
        p.window(11,36,7,9); p.door(23,42,7,14); p.window(40,45,8,7)
        p.box((5,58,57,60),'#c7ba9b'); p.line([(8,59),(8,53),(18,53),(18,59)],'#f0e6ce',1)
    else:
        p.gable(7,11,43,45)
        p.window(12,37,9,10); p.window(36,37,9,10); p.door(26,42,7,14)
        p.oval((25,23,33,31),'#c7b797'); p.oval((26,24,32,30),'#698d9c')
        p.line([(29,24),(29,30)],'#e8e1c8',.6)
        p.box((43,9,48,20),'#a36e59'); p.box((42,8,49,10),'#d2ad88')
        p.box((24,57,36,59),'#c6b99d'); p.box((22,60,38,62),'#a99e87')
    return p.image


def apartment():
    p=Drawing()
    p.volume(9,31,43,28,'#c88d77','#976455')
    p.volume(12,15,34,18,'#c88d77','#976455')
    p.volume(17,7,24,10,'#d3a28b','#a97760')
    for y,xs in [(20,[17,30]),(36,[14,28,42]),(49,[14,28,42])]:
        for x in xs: p.window(x,y,6,8)
    for y in [31,44]:
        p.poly([(6,y),(39,y),(43,y-3),(43,y+1),(6,y+4)],'#d4c9ae')
        p.line([(7,y-5),(7,y+1),(39,y+1),(39,y-5)],'#536067',.8)
        for x in range(11,39,5): p.line([(x,y-4),(x,y+1)],'#536067',.5)
    p.door(30,47,8,13)
    return p.image


def cottage():
    p=Drawing()
    p.gable(5,19,30,37,'#cc9148','#9c6d36')
    p.window(11,39,7,8); p.door(24,43,6,13)
    p.box((49,42,52,57),'#806447')
    p.oval((43,27,59,47),'#527752'); p.oval((44,25,57,42),'#8daa65'); p.oval((43,29,52,39),'#acc27c')
    p.line([(41,58),(61,58),(61,50)],'#d9d1b6',1)
    p.box((21,57,34,60),'#b6a789')
    return p.image


def department_store():
    p=Drawing()
    p.volume(7,23,46,34,'#dcd6bf','#aaa18d',6)
    p.volume(13,11,33,15,'#c4c3ac','#929d92',6)
    for x in [14,27,40]: p.window(x,29,8,9)
    p.box((12,14,40,20),'#ad5d4d')
    for x in [17,25,33]: p.box((x,16,x+4,18),'#ead7a2')
    for x in [11,22,40]: p.window(x,44,9,11)
    p.door(31,44,6,13)
    p.poly([(4,42),(55,42),(60,37),(9,37)],'#92a8a4')
    p.line([(6,43),(6,58)],'#c9c7ad',1); p.line([(56,41),(56,57)],'#c9c7ad',1)
    return p.image


def office():
    p=Drawing()
    p.volume(8,14,28,43,'#3f647c','#294555')
    p.volume(36,30,16,27,'#6c8d9a','#455c6a')
    p.oval((24,6,46,17),'#b3c7c9')
    p.box((24,11,46,44),'#597d91'); p.oval((24,38,46,49),'#45697d')
    p.box((25,11,45,42),'#74a2b5')
    for y in [19,29,39]:
        for x in [12,24,39]: p.window(x,y,7,7)
    p.poly([(20,51),(49,51),(54,47),(26,47)],'#c4d9d5')
    p.line([(22,51),(22,60),(48,60),(48,51)],'#b9c7c5',1)
    p.box((30,50,39,60),'#314a57'); p.window(31,51,7,8)
    return p.image


def shop():
    p=Drawing()
    p.volume(12,20,38,35,'#e0d9c5','#aca78e',7)
    p.poly([(9,21),(28,10),(57,13),(51,23)],'#6c8185')
    p.line([(28,10),(57,13)],'#a1b6b4',1)
    p.box((19,22,43,28),'#b5594b'); p.box((23,24,39,26),'#f1d9a0')
    p.box((12,35,50,54),'#344c58')
    p.window(14,36,11,14); p.window(37,36,11,14); p.door(28,39,6,16)
    for i in range(8):
        x=5+i*6.5
        p.poly([(x+4,29),(x+11,29),(x+7,36),(x,36)],'#c96553' if i%2==0 else '#eee1c1')
        p.oval((x,33,x+7,39),'#ad5148' if i%2==0 else '#d3c6a8')
    p.line([(7,37),(7,57)],'#b9aa89',1); p.line([(57,37),(57,56)],'#b9aa89',1)
    p.box((4,55,17,59),'#99724d'); p.box((6,52,15,55),'#d1a166')
    return p.image


def warehouse():
    p=Drawing()
    p.gable(5,11,45,45,'#7799a9','#486778','#c9cbc1')
    p.box((12,35,43,55),'#4b5e67')
    p.box((14,36,41,55),'#c6a34c')
    for y in range(39,55,3): p.line([(14,y),(41,y)],'#927b3e',.6)
    p.box((7,28,47,32),'#587c8e')
    for x in range(9,46,6): p.window(x,28,4,3)
    p.poly([(2,57),(50,57),(58,51),(58,55),(50,61),(2,61)],'#9d9c8c')
    p.box((5,52,10,56),'#9b7951')
    return p.image


def factory():
    p=Drawing()
    p.volume(5,27,49,29,'#b7b09d','#8d897a',5)
    for x in [5,21,37]:
        p.poly([(x,27),(x+13,13),(x+13,24),(x+16,27)],'#93a6a9')
        p.poly([(x+2,25),(x+12,16),(x+12,24)],'#527788')
        p.line([(x+13,13),(x+13,24)],'#c3d1ca',1)
    p.box((8,6,14,33),'#9d6554'); p.box((7,5,15,8),'#c7957b')
    p.box((10,37,21,55),'#4b4d48'); p.line([(15,37),(15,55)],'#a89e81',.7)
    for x in [28,39,49]: p.window(x,37,7,9)
    p.line([(18,30),(18,34),(55,34)],'#7b8b8a',1)
    return p.image


def water():
    p=Drawing()
    for x in [17,42]:
        p.poly([(x,29),(x+4,29),(x+7,58),(x+2,58)],'#6c7b80')
    p.line([(19,36),(46,54),(20,54),(45,36)],'#9cabad',1.5)
    p.box((13,11,51,29),'#62a8c5'); p.oval((13,23,51,36),'#4587a7')
    p.box((16,11,48,27),'#71b8d1'); p.box((18,13,22,27),'#a4d8df')
    p.oval((13,4,51,17),'#4688a8'); p.oval((14,4,50,14),'#a0d9e3')
    p.line([(50,16),(50,52),(54,52),(54,15)],'#d0d8cf',.8)
    for y in range(18,52,4): p.line([(50,y),(54,y)],'#bac8c8',.7)
    p.box((13,58,25,61),'#b2b3a8'); p.box((40,58,51,61),'#b2b3a8')
    return p.image


def school():
    p=Drawing()
    p.gable(4,24,22,31,'#d2994f','#a06b35')
    p.gable(37,24,20,31,'#d2994f','#a06b35')
    p.volume(24,19,14,36,'#ead9b1','#c3ae88',3)
    p.gable(24,8,14,22,'#c98d43','#9b692f')
    p.oval((27,20,35,28),'#ad9470'); p.oval((28,21,34,27),'#f1e6c8')
    p.line([(31,22),(31,25),(33,25)],'#625441',.7)
    for x in [9,17,42,50]: p.window(x,40,5,8)
    p.door(28,42,7,13); p.box((24,56,39,59),'#c8bba0')
    return p.image


def civic(bank=False,cityhall=False):
    p=Drawing()
    p.volume(9,26,43,28,'#cbd3c8' if bank else '#e3d6bb','#a5b19f' if bank else '#b6a58b',5)
    p.poly([(5,27),(30,11),(58,25),(54,29)],'#577d96' if bank else '#aa7c46')
    p.poly([(12,25),(30,15),(49,25)],'#d9d4b5')
    if bank:
        p.oval((26,18,34,26),'#c6a653'); p.oval((28,20,32,24),'#ecd88f')
    elif cityhall:
        p.oval((26,18,34,26),'#bca980'); p.oval((27,19,33,25),'#eee4c5')
        p.line([(30,19),(30,23),(32,23)],'#74644f',.7)
        p.line([(30,4),(30,13)],'#b3bcb4',.7); p.poly([(30,4),(38,4),(37,8),(30,8)],'#b75f51')
    else:
        for i,c in enumerate(['#b95248','#5b7b9d','#67865e','#d9bd6f']): p.box((22+i*4,20,25+i*4,26),c)
    p.box((14,31,49,52),'#47595e')
    for x in [13,24,38,49]:
        p.box((x,31,x+3,52),'#e4dcc7'); p.box((x-1,30,x+4,32),'#f2e9d1'); p.box((x-1,51,x+4,53),'#c7baa0')
    p.window(28,36,8,15)
    p.box((8,54,56,57),'#c7bea7'); p.box((5,58,58,61),'#a9a28f')
    return p.image


def temple():
    p=Drawing()
    p.volume(15,34,34,21,'#dfcbaa','#a37f5d',4)
    for x in [18,29,43]: p.box((x,35,x+2,55),'#9f493e')
    p.door(30,42,7,13)
    for y,w in [(14,20),(25,36),(37,54)]:
        x=(64-w)/2
        p.poly([(x-2,y-6),(x+3,y-2),(32,y-10),(x+w-3,y-2),(x+w+2,y-6),(x+w,y+2),(x,y+2)],'#475d5a')
        p.line([(x-2,y-6),(x+3,y-2),(32,y-10),(x+w-3,y-2),(x+w+2,y-6)],'#a8ba9f',1)
        p.line([(x,y+2),(x+w,y+2)],'#9b6f45',1.5)
    p.box((15,57,51,60),'#c1b295')
    return p.image


def museum(hospital=False):
    p=Drawing(128)
    if hospital:
        p.volume(10,42,35,67,'#e7e5d7','#aabbb3',8)
        p.volume(84,52,30,57,'#e7e5d7','#aabbb3',7)
        p.volume(40,30,47,54,'#f1eee0','#b9c8bf',9)
        p.box((53,34,73,39),'#bd5750'); p.box((60,27,66,47),'#bd5750')
        for y in [53,69,89]:
            for x in [16,29,91,103]: p.window(x,y,7,11)
        for y in [52,67]:
            for x in [47,60,73]: p.window(x,y,8,10)
        p.poly([(43,94),(82,94),(91,87),(52,87)],'#86aaad')
        p.door(57,93,11,21); p.box((43,115,86,120),'#b4b5a5')
    else:
        p.volume(12,58,103,46,'#ddd5bb','#b6ad91',7)
        p.volume(43,35,44,37,'#e8e0c8','#b7b39e',7)
        p.oval((40,12,90,52),'#5c8b82'); p.oval((43,12,87,41),'#9bb6a1')
        p.box((40,38,90,45),'#c3c4a9')
        p.poly([(25,67),(64,45),(105,65),(101,70),(29,70)],'#b7966d')
        p.poly([(36,64),(64,50),(92,64)],'#e6d5ad')
        p.box((32,72,99,101),'#686857')
        for x in [31,44,57,70,83,96]:
            p.box((x,72,x+4,103),'#e9e0c6'); p.box((x-2,70,x+6,74),'#f3e9cc')
        p.box((23,104,108,109),'#c4baa0'); p.box((17,110,113,115),'#aba28d'); p.box((13,116,117,121),'#918c7a')
    return p.image


def stadium():
    p=Drawing(128)
    p.oval((5,17,122,115),'#758b8c'); p.oval((7,13,120,108),'#c5d2ca')
    p.oval((16,23,111,100),'#687b79'); p.oval((24,31,103,94),'#91a57b')
    p.oval((30,36,97,88),'#51835b'); p.box((41,42,86,81),'#65966b')
    p.line([(41,42),(86,42),(86,81),(41,81),(41,42)],'#c6d4ae',1)
    p.line([(64,42),(64,81)],'#c6d4ae',1); p.oval((56,54,72,69),'#b4c99f'); p.oval((58,56,70,67),'#65966b')
    for angle in range(15,180,15):
        a=math.radians(angle)
        p.line([(64+50*math.cos(a),61+39*math.sin(a)),(64+40*math.cos(a),61+31*math.sin(a))],'#a4b8af',1)
    p.poly([(14,30),(27,17),(103,17),(117,31),(105,34),(25,34)],'#dedfc7')
    for x in [13,112]: p.line([(x,36),(x,6)],'#53666c',1); p.box((x-4,3,x+5,7),'#d9d9b8')
    return p.image


def homes(kind=0,variant=0):
    if kind in (1,7):
        image=house(True)
        if kind==7:
            p=Drawing(); p.image=image; p.d=ImageDraw.Draw(image)
            p.box((38,44,49,56),'#62727b')
            for y in [47,50,53]: p.line([(38,y),(49,y)],'#a7b6b7',.6)
        return image
    if kind==5: return apartment()
    p=Drawing()
    if kind==2:
        p.volume(5,24,50,32,'#d0ab8f','#9d8972',5)
        p.box((6,23,54,25),'#a7b6b4')
        for x in [12,39]: p.door(x,43,7,13)
        for x in [24,49]: p.window(x,36,6,9)
        p.box((10,57,23,60),'#b5a58c'); p.box((37,57,50,60),'#b5a58c')
    elif kind==0:
        for x,roof in [(4,'#a26b57'),(29,'#6e8793')]:
            p.gable(x,13+(2 if x==29 else 0),23,43,roof,'#63564e','#d0ab8f')
            p.window(x+4,35,6,9); p.door(x+13,43,6,13)
        p.box((3,58,58,60),'#b5a58c')
    elif kind==4:
        p.gable(7,9,42,39,'#629a95','#3f716f')
        for x in [12,44]: p.box((x,48,x+3,58),'#806448')
        p.window(13,34,8,9); p.door(29,35,7,13)
        p.line([(6,46),(6,51),(52,51),(52,46)],'#d2c7ad',1)
        for x in range(9,52,5): p.line([(x,46),(x,51)],'#d2c7ad',.5)
        for i in range(5): p.box((47+i*2,52+i*1.5,52+i*2,54+i*1.5),'#9f8a69')
    elif kind==6:
        p.gable(6,12,43,44,'#647c9e','#405978')
        p.gable(31,24,24,32,'#647c9e','#405978')
        for x in [13,24,40]: p.window(x,38,7,9)
        p.door(28,44,7,12)
    else:
        p.image=house(); p.d=ImageDraw.Draw(p.image)
        p.line([(4,49),(4,58),(21,58),(21,49)],'#ddd1ad',1)
        p.line([(4,49),(22,49)],'#8d7958',1)
        for x in [6,11,16]: p.box((x,53,x+3,57),'#617c51'); p.oval((x,51,x+3,54),'#c98988')
    return p.image


def residential_tower(variant=0):
    p=Drawing()
    p.volume(9,6,25,52,'#c88d77','#976455',5)
    p.volume(34,22 if variant else 15,18,36 if variant else 43,'#d3a28b','#a97760',5)
    for y in [13,24,35,46]:
        for x in [13,25]: p.window(x,y,6,7)
    for y in [28,40,51]: p.window(40,y,7,7)
    for y in [22,44]:
        p.poly([(6,y),(34,y),(39,y-3),(39,y+1),(6,y+3)],'#d6cbb3')
        p.line([(7,y-4),(7,y),(34,y),(34,y-4)],'#59656b',.7)
    p.door(20,47,8,12)
    return p.image


def housing_complex():
    p=Drawing(128)
    p.box((25,45,103,114),'#74965c')
    p.volume(25,17,70,28,'#d9c8a7','#b2a27f',7)
    p.volume(8,27,30,77,'#c98b74','#9d6959',8)
    p.volume(88,40,26,62,'#e5d3b0','#b8aa8b',7)
    p.volume(10,16,23,15,'#dfcca9','#b4a384',5)
    for y in [37,55,73,89]:
        for x in [13,25]: p.window(x,y,7,10)
    for y in [51,69,86]:
        for x in [93,104]: p.window(x,y,6,9)
    for x in [43,59,75]: p.window(x,27,9,10)
    p.box((55,47,64,113),'#c7ba97'); p.box((37,83,90,91),'#c7ba97')
    p.oval((65,56,88,76),'#52754d'); p.oval((67,55,85,70),'#91ae63')
    for x,y in [(42,65),(74,97)]: p.box((x,y,x+12,y+4),'#9c7954')
    p.door(18,89,10,16); p.door(95,90,8,13)
    return p.image


def industrial_tanks():
    p=Drawing()
    for x,y,w,h in [(4,14,24,40),(30,20,25,34)]:
        p.box((x,y+7,x+w,y+h-5),'#c6c9c2')
        p.oval((x,y+h-12,x+w,y+h),'#a2ada7')
        p.oval((x,y,x+w,y+15),'#e1dfcc')
        p.box((x+4,y+10,x+6,y+h-6),'#e4e7d9')
    p.line([(21,49),(33,49),(33,55),(57,55)],'#73888b',2)
    p.line([(52,33),(52,55)],'#b7c6bf',1)
    return p.image


def university():
    p=Drawing(128)
    p.gable(8,47,36,62,'#9d6653','#714f48')
    p.gable(83,47,33,62,'#9d6653','#714f48')
    p.volume(43,50,41,49,'#ded0af','#afa081',5)
    p.gable(50,16,25,55,'#9d6653','#714f48')
    p.oval((56,45,69,58),'#b7a37d'); p.oval((58,47,67,56),'#eee4c7')
    p.line([(63,48),(63,53),(66,53)],'#726249',.9)
    for y in [77,93]:
        for x in [14,28,89,102]: p.window(x,y,9,11)
    p.door(56,83,14,20); p.box((46,105,83,110),'#b8aa8c')
    return p.image


def clinic():
    p=Drawing()
    p.volume(8,18,29,38,'#e8e9db','#b5c6ba',6)
    p.volume(36,32,17,24,'#e8e9db','#b5c6ba',5)
    p.box((18,24,30,28),'#629a87'); p.box((22,20,26,33),'#629a87')
    p.window(12,39,8,9); p.window(40,39,8,9); p.door(26,43,7,13)
    p.poly([(22,45),(37,45),(42,41),(27,41)],'#8fb4ae')
    p.box((22,57,39,60),'#bab79e')
    return p.image


def exterior_for(row,col,span,kind):
    """First production batch: original atlas identities get explicit exterior families."""
    label=None; image=None
    if row==2:
        image=cottage() if col==2 else house(col==1) if col in (0,1,10) else apartment() if col in (3,4,6,7) else residential_tower(col%2)
        label='house' if col in (0,1,2,10) else 'apartments' if col in (3,4,6,7) else 'residential-tower'
        if col==10: image=repaint(image,{'#b85c4c':'#638a69','#8c443d':'#3e6450'})
    elif 8<=row<=10:
        home_kind=col//2
        image=homes(home_kind,col%2) if row==8 else (apartment() if col%2==0 else residential_tower(1)) if row==9 else residential_tower(col%2)
        label=f'home-kind-{home_kind}-level-{row-7}'
        paints=[('#c88d77','#976455'),('#e5d9bd','#b6aa8c'),('#b59174','#876e5d'),('#d9cbaa','#aca183'),
            ('#dce6d9','#a9c1b9'),('#c0d1d8','#889eaa'),('#e6d5af','#b7a47d'),('#dfd7c4','#b5a98f')]
        wall,side=paints[home_kind]
        image=repaint(image,{'#c88d77':wall,'#976455':side,'#d3a28b':lighten(wall,.12),'#a97760':side,'#d0ab8f':wall})
        if col%2: image=repaint(image,{'#b85c4c':'#78939b','#8c443d':'#506e7a','#9f493e':'#557c78',
            '#a26b57':'#9c7b64','#6e8793':'#748e83','#688291':'#b78566','#405a6a':'#845b47',
            '#647c9e':'#71958e','#405978':'#456c67','#629a95':'#7d98ae','#3f716f':'#566e88'})
    elif row==3:
        image=department_store() if col in (4,7) else shop() if col in (0,1,3) else office(); label='department-store' if col in (4,7) else 'arcade-shop' if col in (0,1,3) else 'rounded-office'
        if col in (1,6,8): image=repaint(image,{'#c96553':'#5a8c73','#ad5148':'#3e6c55','#3f647c':'#4e7b78'})
        if col in (3,7): image=repaint(image,{'#c96553':'#678aa1','#ad5148':'#43677d'})
    elif row==4 or 11<=row<=13:
        if row==4: which='warehouse' if col in (1,5) else 'tanks' if col==2 else 'factory'
        else: which='warehouse' if row in (12,13) and col<2 or row==13 else 'tanks' if row==12 and col==2 else 'factory'
        image={'warehouse':warehouse,'factory':factory,'tanks':industrial_tanks}[which](); label=which
        if col%2: image=repaint(image,{'#7799a9':'#938c7c','#486778':'#686253','#b7b09d':'#a9b7b9'})
    elif row==5 and col in (1,4,5,9,10,13):
        image={1:water,4:school,5:clinic,9:school,10:temple,13:civic}[col](); label={1:'water-tower',4:'school',5:'clinic',9:'highschool',10:'temple',13:'library'}[col]
        if col==9: image=repaint(image,{'#d2994f':'#6f8ba0','#a06b35':'#4e697d'})
    elif row==6 and col in (0,2,4,6,8):
        image={0:housing_complex,2:lambda:museum(True),4:university,6:museum,8:stadium}[col](); label={0:'housing-complex',2:'hospital',4:'university',6:'museum',8:'stadium'}[col]
    elif row==14 and col in (0,1,2,3,5,7,12,13,14,15):
        if col in (0,1): image=civic(col==1,col==0); label='cityhall' if col==0 else 'bank'
        elif col in (3,7): image=warehouse(); label='coldstore' if col==3 else 'workshop'
        elif col in (5,12): image=house(True) if col==5 else clinic(); label='daycare' if col==5 else 'familyclinic'
        elif col==2: image=museum().resize((256,256),Image.Resampling.NEAREST); label='culture'
        else: image=shop(); label={13:'bakery',14:'florist',15:'cakeshop'}[col]
        if col==13:
            p=Drawing(); p.image=image; p.d=ImageDraw.Draw(image)
            p.box((45,7,50,24),'#a76850'); p.box((44,6,51,9),'#cc9976')
            p.oval((25,20,37,27),'#d9ac55'); p.line([(29,21),(28,25)],'#f1d38c',.7)
        if col==14: image=repaint(image,{'#c96553':'#75a48a','#ad5148':'#4d7c60'})
        if col==15: image=repaint(image,{'#c96553':'#c18497','#ad5148':'#945f78'})
    return image,label


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    samples=[('Gabled home',house()),('L-shaped villa',house(True)),('Stepped apartments',apartment()),('Rounded office',office()),
        ('Arcade shop',shop()),('Gabled warehouse',warehouse()),('Sawtooth factory',factory()),('Cylindrical water tower',water()),
        ('School wings + clock',school()),('Colonnade library',civic()),('Bank + entrance court',civic(True)),('Swept-eave temple',temple()),
        ('Domed museum',museum()),('Hospital wings',museum(True)),('Oval stadium',stadium())]
    board=Image.new('RGB',(1200,4*330),'#202a33'); d=ImageDraw.Draw(board)
    try: font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',19)
    except OSError: font=ImageFont.load_default()
    for i,(name,image) in enumerate(samples):
        slug=name.lower().replace(' ','-').replace('+','and')
        image.save(OUT/f'{slug}-master.png',optimize=True)
        x=i%4*300; y=i//4*330
        d.text((x+12,y+10),name,fill='#e1d8bf',font=font)
        art=image.resize((256,256),Image.Resampling.NEAREST)
        board.paste(art,(x+20,y+45),art)
    board.save(OUT/'silhouette-studies.png',optimize=True)
    print('Saved 15 exterior studies; game atlases were not modified.')


if __name__=='__main__': main()
