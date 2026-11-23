import { Application, Assets, Container, Graphics, type Texture } from 'pixi.js';
import { StreetArt } from '../src/rendering/StreetArt';
import { CarSprites } from '../src/rendering/CarSprites';
import { BicycleSprites } from '../src/rendering/BicycleSprites';
import bicycleUrl from '../src/assets/street/bicycles.png';
import carsUrl from '../src/assets/vehicles/cars.png';
import type { Theme } from '../src/simulation/SaveData';
import type { StreetBuilding, StreetLandmark } from '../src/rendering/streetAppearance';
import { WalkerMotion } from '../src/rendering/WalkerMotion';
import { PreviewTraffic } from '../src/rendering/PreviewTraffic';

const app = new Application();
await app.init({ width: 1536, height: 912, antialias: false, resolution: 1, autoStart: false, background: '#8b9c77' });
document.querySelector('#canvas')!.appendChild(app.canvas);
const [art, carTexture] = await Promise.all([StreetArt.load(), Assets.load<Texture>(carsUrl)]);
carTexture.source.scaleMode = 'nearest';
const cars = new CarSprites(carTexture.source);
const bicycleTexture = await Assets.load<Texture>(bicycleUrl);
bicycleTexture.source.scaleMode = 'nearest';
const bicycles = new BicycleSprites(bicycleTexture.source);
const world = new Container();
const g = new Graphics();
world.addChild(g);
app.stage.addChild(world);
let zoom = 6, theme: Theme = 'classic', time = 0, moving = true, inspection = false;
const residential: StreetBuilding[] = ['house', 'apartment', 'shop', 'office', 'factory', 'school'];
const civic: StreetBuilding[] = ['power', 'water', 'fire', 'police', 'clinic', 'warehouse'];
let civicView = false;
let landmarkView = false;
let names = residential;
const updateLabels = () => {
  const labels = inspection ? ['右側', '正面', '左側', '背面'] : landmarkView
    ? ['醫院', '大學', '博物館', '體育場'] : civicView
    ? ['發電廠', '水塔', '消防局', '警察局', '診所', '物流倉庫']
    : ['獨棟住宅', '公寓', '街角商店', '辦公樓', '工廠', '小學'];
  document.querySelector<HTMLElement>('.labels')!.innerHTML = labels.map(label => `<span>${label}</span>`).join('');
  document.querySelector<HTMLElement>('.labels')!.style.gridTemplateColumns = `repeat(${labels.length},1fr)`;
};
const motion = new WalkerMotion();
const traffic = new PreviewTraffic();
let trafficTime = 0;

function route(seconds: number, min: number, max: number, offset = 0) {
  const speed = 10, travel = (max - min) / speed, pause = 0.6;
  const at = (seconds + offset) % (2 * (travel + pause));
  if (at < travel) return { value: min + at * speed, heading: 0 };
  if (at < travel + pause) return { value: max, heading: 0 };
  if (at < 2 * travel + pause) return { value: max - (at - travel - pause) * speed, heading: Math.PI };
  return { value: min, heading: Math.PI };
}

function pedestrian(key: string, x: number, y: number, heading: number, index: number) {
  const pose = motion.update(key, x, y, time, heading);
  art.drawPerson(g, x, y, pose.heading, index, pose.distance, moving && pose.walking);
}

function inspectActors() {
  g.rect(0, 0, 256, 152).fill(0x8b9c77);
  for (const [i, heading] of [0, Math.PI / 2, Math.PI, -Math.PI / 2].entries()) {
    const x = 32 + i * 64;
    g.rect(x - 20, 5, 40, 39).fill(0xb7bd97);
    g.rect(x - 20, 50, 40, 37).fill(0x4b535a);
    art.drawPerson(g, x - 9, 24, heading, i, time / 125 * 2, true, 8 + i);
    bicycles.draw(g, x + 9, 24, heading, 8 + i, time / 125 * 5);
    cars.draw(g, x, 70, heading, 2, 0, theme);
    art.drawTruck(g, x, 139, heading, 0x3b82f6);
  }
  g.rect(0, 92, 256, 32).fill(0x4b535a);
  for (let i = 0; i < 8; i++) cars.draw(g, 16 + i * 32, 110, i * Math.PI / 4, 2, 0, theme);
  document.querySelector('#status')!.textContent = '方向／結構檢查：人物與同造型騎士 → 汽車正向 → 汽車八角度 → 貨車';
  document.querySelector('#guide')!.textContent = '上排依序為：右側、正面、左側、背面。可暫停後按「下一幀」，逐格檢查步態；這個檢查模式刻意原地播放。';
}

function drawTraffic(offsetY = 0) {
  traffic.advance(time - trafficTime);
  trafficTime = time;
  for (const vehicle of traffic.vehicles) {
    const x = vehicle.x * 32, y = vehicle.y * 32 + offsetY, angle = vehicle.hx > 0 ? 0 : Math.PI;
    if (vehicle.index === 2) art.drawTruck(g, x, y, angle, 0x3b82f6);
    else cars.draw(g, x, y, angle, vehicle.index === 0 ? 2 : 3, vehicle.index === 0 ? 0 : 2, theme);
  }
}

function inspectLandmarks() {
  g.rect(0, 0, 256, 152).fill(0x8b9c77);
  const landmarks: StreetLandmark[] = ['hospital', 'university', 'museum', 'stadium'];
  for (const [i, name] of landmarks.entries()) {
    g.rect(i * 64 + 2, 19, 60, 62).fill(0xa1ac87);
    art.drawLandmark(g, name, i * 64, 12, theme);
  }
  g.rect(0, 81, 256, 8).fill(0xd1c8ac);
  g.rect(0, 98, 256, 33).fill(0x4b535a);
  for (let x = 0; x < 256; x += 16) g.rect(x + 3, 114, 8, 1).fill(0xd9c99b);
  drawTraffic(45);
  document.querySelector('#status')!.textContent = `程式繪製・${zoom}×　四種完整 2×2 大型建築／四城市配色`;
  document.querySelector('#guide')!.textContent = '醫院、大學、博物館與體育場使用與遊戲相同的完整大圖；原生 128×128，顯示占地 64×64。';
}

function paint() {
  g.clear();
  world.scale.set(zoom);
  if (inspection) {
    trafficTime = time;
    inspectActors();
    app.render();
    document.documentElement.dataset.ready = 'true';
    return;
  }
  if (landmarkView) {
    inspectLandmarks(); app.render();
    document.documentElement.dataset.ready = 'true';
    return;
  }
  g.rect(0, 0, 256, 152).fill(0x8b9c77);
  for (let x = 2; x < 255; x += 11) {
    for (let y = 2; y < 150; y += 13) {
      const shift = (x * 7 + y * 3) % 9;
      g.rect(x + shift, y, 2, 0.5).fill(0xa4ae7f).rect(x + shift + 1, y + 1, 0.5, 1).fill(0x74896b);
    }
  }
  g.rect(0, 48, 256, 7).rect(0, 87, 256, 8).fill(0xd1c8ac);
  g.rect(0, 55, 256, 32).fill(0x4b535a);
  g.rect(0, 54, 256, 1).rect(0, 87, 256, 1).fill(0x68736e);
  for (let x = 0; x < 256; x += 8) g.rect(x, 49, 0.5, 5).rect(x + 3, 88, 0.5, 6).fill(0xb8b59c);
  for (let x = 0; x < 256; x += 16) g.rect(x + 3, 70, 8, 1).fill(0xd9c99b);
  for (let i = 0; i < names.length; i++) {
    const x = 6 + i * 42;
    g.rect(x + 2, 45, 29, 3).fill({ color: 0x354b43, alpha: 0.22 });
    art.drawBuilding(g, names[i], x, 16, theme);
  }
  drawTraffic();
  for (const [i, x] of [27, 76, 123, 183, 229].entries()) {
    const at = route(time / 1000, x - 7, x + 7, i * 0.7);
    pedestrian(`street:${i}`, at.value, 48, at.heading, i);
  }
  g.rect(0, 97, 256, 2).fill(0xc2b592);
  for (const x of [8, 66, 125, 184, 221]) {
    g.ellipse(x + 16, 143, 11, 2).fill({ color: 0x344c45, alpha: 0.22 });
    art.drawTree(g, x, 84);
  }
  for (const [index, x] of [111, 168].entries()) {
    const at = route(time / 1000, 105, 124, index * 2.5);
    pedestrian(`park:${index}`, x, at.value, at.heading + Math.PI / 2, index + 1);
  }
  app.render();
  document.querySelector('#status')!.textContent = `程式繪製・${zoom}×　十二種建築／闊葉樹／四方向六幀行走／16 方向汽車與貨車`;
  document.querySelector('#guide')!.textContent = '街景人物依路徑行走、停步和轉身，車輛由畫面外進出。';
  document.documentElement.dataset.ready = 'true';
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-zoom]')) button.onclick = () => {
  zoom = Number(button.dataset.zoom);
  for (const other of document.querySelectorAll('[data-zoom]')) other.setAttribute('aria-pressed', String(other === button));
  app.renderer.resize(256 * zoom, 152 * zoom);
  paint();
};
document.querySelector<HTMLSelectElement>('#theme')!.onchange = event => {
  theme = (event.target as HTMLSelectElement).value as Theme;
  paint();
};
document.querySelector<HTMLButtonElement>('#motion')!.onclick = event => {
  moving = !moving;
  (event.target as HTMLButtonElement).textContent = moving ? '暫停動畫' : '播放動畫';
  if (moving) app.start(); else { app.stop(); paint(); }
};
document.querySelector<HTMLButtonElement>('#actors')!.onclick = event => {
  inspection = !inspection;
  (event.target as HTMLButtonElement).textContent = inspection ? '返回完整街景' : '檢查人物與車體';
  updateLabels();
  paint();
};
document.querySelector<HTMLButtonElement>('#civic')!.onclick = event => {
  landmarkView = false;
  document.querySelector<HTMLButtonElement>('#landmarks')!.textContent = '大型建築';
  civicView = !civicView; names = civicView ? civic : residential;
  inspection = false;
  document.querySelector<HTMLButtonElement>('#actors')!.textContent = '檢查人物與車體';
  (event.target as HTMLButtonElement).textContent = civicView ? '住宅與商業' : '公共設施';
  updateLabels(); paint();
};
document.querySelector<HTMLButtonElement>('#landmarks')!.onclick = event => {
  landmarkView = !landmarkView; inspection = false;
  document.querySelector<HTMLButtonElement>('#actors')!.textContent = '檢查人物與車體';
  (event.target as HTMLButtonElement).textContent = landmarkView ? '返回一般街景' : '大型建築';
  updateLabels(); paint();
};
document.querySelector<HTMLButtonElement>('#step')!.onclick = () => {
  moving = false;
  app.stop();
  document.querySelector<HTMLButtonElement>('#motion')!.textContent = '播放動畫';
  time += 125;
  paint();
};
app.ticker.add(ticker => { time += ticker.elapsedMS; paint(); });
paint();
app.start();
window.addEventListener('pagehide', () => { app.destroy(true, { children: true }); art.destroy(); cars.destroy(); }, { once: true });
