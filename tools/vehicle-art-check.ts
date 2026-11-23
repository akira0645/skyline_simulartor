import { Application, Assets, Container, Graphics, type Texture } from 'pixi.js';
import { CarSprites } from '../src/rendering/CarSprites';
import { BicycleSprites } from '../src/rendering/BicycleSprites';
import carsUrl from '../src/assets/vehicles/cars.png';
import bikeUrl from '../src/assets/street/bicycles.png';
import scooterUrl from '../src/assets/street/scooters.png';
import scooterAtlas from '../src/assets/street/scooters.json';

const app = new Application();
await app.init({ width: 960, height: 510, antialias: false, resolution: 1, autoStart: false, background: '#202a33' });
document.querySelector('#canvas')!.appendChild(app.canvas);
const textures = await Promise.all([carsUrl,bikeUrl,scooterUrl].map(url => Assets.load<Texture>(url)));
for (const texture of textures) texture.source.scaleMode = 'nearest';
const cars = new CarSprites(textures[0].source), bikes = new BicycleSprites(textures[1].source),
  scooters = new BicycleSprites(textures[2].source,scooterAtlas);
const world = new Container(); app.stage.addChild(world);
let zoom = 6, distance = 0;
function draw() {
  for (const child of world.removeChildren()) child.destroy();
  const background = new Graphics(); world.addChild(background);
  for (let row=0;row<5;row++) for (let angle=0;angle<8;angle++) {
    const x = 60+angle*120, y = 65+row*100;
    background.rect(x-57,y-56,114,94).fill(row%2 ? 0x293943 : 0x24333b);
    const g = new Graphics(); g.position.set(x,y); g.scale.set(zoom); world.addChild(g);
    if (row===0) bikes.draw(g,0,0,angle*Math.PI/4,11,distance);
    else if (row===1) scooters.draw(g,0,0,angle*Math.PI/4,8);
    else cars.draw(g,0,0,angle*Math.PI/4,row,0,'classic');
  }
  document.querySelector('#status')!.textContent = `${zoom}×・同一份圖集；由上而下：腳踏車、機車、小汽車、轎車、高級車。踏板 ${distance ? 'B' : 'A'}。`;
  app.render();
}
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-zoom]')) button.onclick = () => { zoom=Number(button.dataset.zoom); draw(); };
document.querySelector<HTMLButtonElement>('#pose')!.onclick = () => { distance=distance ? 0 : 5; draw(); };
draw();
