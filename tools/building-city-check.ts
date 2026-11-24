import { SimulationEngine } from '../src/simulation/SimulationEngine';
import { hourAt } from '../src/simulation/calendar';
import { CityRenderer } from '../src/rendering/CityRenderer';
import type { Theme } from '../src/simulation/SaveData';

const params = new URLSearchParams(location.search);
const theme = (['classic','sf','california','newyork'].includes(params.get('theme') ?? '') ? params.get('theme') : 'classic') as Theme;
const zoom = Number(params.get('zoom') ?? 3);
const target = params.get('target') ?? 'residential';
for (const [id,value] of [['theme',theme],['zoom',String(zoom)],['target',target]]) {
  const select=document.querySelector<HTMLSelectElement>('#'+id)!; select.value=value;
  select.onchange=()=>{ params.set(id,select.value); location.search=params.toString(); };
}
const save = await (await fetch('../demo/medium.json')).json();
const engine = new SimulationEngine({version:1,seed:0,tick:0});
engine.load({...save,theme,tiles:Uint8Array.from(save.tiles)});
const renderer = new CityRenderer(engine.city,()=>0,()=>hourAt(engine.getSnapshot().tick),()=> 'none');
await renderer.mount(document.querySelector<HTMLElement>('#map')!,new AbortController().signal,()=> 'inspect',()=>{},()=>{});
renderer.zoomView?.(Math.log(Math.max(1,Math.min(6,zoom)))/.32);
const id = save.tiles.findIndex((_: number,index: number)=>engine.city.map.at(index)===target);
if (id>=0) renderer.lookAt?.({x:id%128,y:Math.floor(id/128)});
document.querySelector('#status')!.textContent=`${theme}・${zoom}×・${target}${id>=0?'':'（範例城市沒有此設施）'}；近看圖依正式流程按需載入。`;
