// Pure CPU benchmark; no browser automation. Run on an idle machine, sequentially.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const outfile = 'node_modules/.cache/traffic-benchmark.mjs';
const baselineRef = 'b31221d';
const baselineOccupancy = execFileSync('git', ['show', baselineRef + ':src/simulation/RoadOccupancy.ts'], { encoding: 'utf8' });
await build({ stdin: { contents: `
import { commuterPosition } from './src/rendering/commuterPosition';
import { CommuterGeometry } from './src/rendering/CommuterGeometry';
import { RoadOccupancy, clearRoadAdvance } from './src/simulation/RoadOccupancy';
import { RoadOccupancy as OldOccupancy, clearRoadAdvance as oldAdvance } from 'baseline-occupancy';
export function run() {
 const route={homeId:128,workId:198,path:Array.from({length:69},(_,x)=>({x:x+1,y:2}))};
 const geometry=new CommuterGeometry(route,'drive',false);
 const old=(along)=>{const p=commuterPosition(route,0,'drive',along/geometry.steps,false)!;return {x:(p.x+.5)*32,y:(p.y+.5)*32}};
 const cached=(along)=>geometry.at(along);
 const results=[];
 for(const variant of ['original','cached']) {
  const at=variant==='original'?old:cached;
  const advance=variant==='original'?oldAdvance:clearRoadAdvance;
  const body=(i,along)=>{const p=at(along),a=at(along-.01),b=at(along+.01),n=Math.hypot(b.x-a.x,b.y-a.y)||1;
   return {index:i,x:p.x/32,y:p.y/32+Math.floor(i/50)*2,hx:(b.x-a.x)/n,hy:(b.y-a.y)/n}};
  const run=()=>{const occupancy=variant==='original'?new OldOccupancy():new RoadOccupancy();const positions=Array.from({length:500},(_,i)=>2.1+(i%50)*1.2);
   let checksum=0;const start=performance.now();
   for(let frame=0;frame<60;frame++) {occupancy.reset(positions.map((p,i)=>body(i,p)));
    for(let i=0;i<500;i++){positions[i]=advance(positions[i],positions[i]+.08,p=>body(i,p),occupancy);occupancy.add(body(i,positions[i]));}}
   for(const p of positions)checksum+=p;
   return {ms:performance.now()-start,checksum};};
  run();const samples=Array.from({length:5},run);const sorted=samples.map(x=>x.ms).sort((a,b)=>a-b);
  results.push({variant,medianMs:sorted[2],samplesMs:samples.map(x=>x.ms),checksum:samples[0].checksum,vehicles:500,frames:60});
 }
 return results;
}`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error',
plugins: [{ name: 'baseline', setup(build) {
 build.onResolve({ filter: /^baseline-occupancy$/ }, () => ({ path: 'baseline-occupancy', namespace: 'baseline' }));
 build.onLoad({ filter: /.*/, namespace: 'baseline' }, () => ({ contents: baselineOccupancy, loader: 'ts' }));
} }] });
const { run } = await import(pathToFileURL(outfile).href);
const results = run();
console.log(JSON.stringify(results, null, 2));
const output = process.argv[2];
if (output) writeFileSync(output, JSON.stringify({ baselineRef, measuredAt: new Date().toISOString(), results }, null, 2) + '\n');
