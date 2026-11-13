import { useEffect, useRef, useState } from 'react';
import { CityRenderer } from '../rendering/CityRenderer';
import type { Overlay, Tool } from './tools';
import type { Cell, Tile } from '../simulation/TileMap';
import { demoCity, powerPlant, waterTower, works } from './demoCity';
import { workShift, shiftPhase } from '../simulation/WorkShift';
import { ISSUES, type Issue } from '../simulation/BuildingSystem';
import { economy, milestones, tileCost } from '../simulation/Economy';
import { dateAt, hourAt } from '../simulation/calendar';
import { traffic } from '../simulation/Traffic';
import { pollution } from '../simulation/Pollution';
import { utilities } from '../simulation/Utilities';
import { isFacility } from '../simulation/TileMap';
import { SimulationClock, type SimulationSpeed } from '../simulation/SimulationClock';
import { SimulationEngine } from '../simulation/SimulationEngine';
import { readSave, writeSave } from '../storage/SaveManager';

const speeds = [0, 1, 2, 4] as const;

const tools: [Tool, string][] = [
  ['pan', '移動'], ['inspect', '查看'], ['road', '道路'], ['avenue', '大道'], ['residential', '住宅'],
  ['commercial', '商業'], ['industrial', '工業'], ['power', '電廠'], ['water', '水塔'],
  ['park', '公園'], ['demolish', '拆除'],
];

/** What one tile of a tool costs; nothing for the tools that only look. */
const toolCost = (tool: Tool) =>
  tool === 'pan' || tool === 'inspect' ? undefined : tileCost(tool === 'demolish' ? 'grass' : tool);

/** City ranks, indexed by how many milestones have been reached. */
const rankNames = ['荒地', '小聚落', '村莊', '小鎮', '城鎮', '城市', '大都會'];
const money = (amount: number) => `${amount < 0 ? '−' : ''}$${Math.abs(Math.round(amount)).toLocaleString('en-US')}`;

const overlays: [Overlay, string][] = [
  ['none', '無'], ['traffic', '車流'], ['pollution', '污染'], ['value', '地價'], ['power', '供電'], ['water', '供水'],
];

const zones = [['residential', '住宅'], ['commercial', '商業'], ['industrial', '工業']] as const;

const issueNames: Record<Issue, string> = {
  'no-road': '沒有道路', 'no-power': '缺電', 'no-water': '缺水',
  'no-jobs': '有居民找不到工作', 'long-commute': '通勤太久', pollution: '污染太重', vacancies: '缺工',
};

const tileNames: Record<Tile, string> = {
  grass: '草地', road: '道路', avenue: '大道', residential: '住宅區', commercial: '商業區',
  industrial: '工業區', power: '電廠', water: '水塔', park: '公園',
};

/** How full a road is, in the words of the traffic layer's four colours. */
const trafficName = (load: number) =>
  load <= 0.5 ? '順暢' : load <= 1 ? '繁忙' : load <= 1.5 ? '壅塞' : '嚴重壅塞';

/** Advances the simulation by the real time that has passed and times each tick. */
function step(engine: SimulationEngine, clock: SimulationClock,
  lastTime: { current: number }, tickMs: { current: number }): number {
  const now = performance.now();
  const before = engine.getSnapshot().tick;
  const tick = clock.advance(now - lastTime.current);
  if (tick > before) tickMs.current = (performance.now() - now) / (tick - before);
  lastTime.current = now;
  return tick;
}

export function App() {
  const viewport = useRef<HTMLDivElement>(null);
  const activeTool = useRef<Tool>('road');
  const [tool, setTool] = useState<Tool>('road');
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [tick, setTick] = useState(0);
  const [speed, setSpeed] = useState<SimulationSpeed>(1);
  const [engine] = useState(() =>
    new SimulationEngine({ version: 1, seed: 42, tick: 0 }),
  );
  const [clock] = useState(() => new SimulationClock(engine));
  const [stats, setStats] = useState(() => engine.city.getStats());
  const rendererRef = useRef<CityRenderer>(null);
  const lastTime = useRef(0);
  const tickMs = useRef(0);
  const [selected, setSelected] = useState<Cell>();
  const [debug, setDebug] = useState(false);
  const [fps, setFps] = useState(0);
  const [hour, setHour] = useState(() => hourAt(0));
  const [demo, setDemo] = useState(false);
  const activeOverlay = useRef<Overlay>('none');
  const [overlay, setOverlay] = useState<Overlay>('none');
  const knownRank = useRef(0);

  function updateClock() {
    setTick(step(engine, clock, lastTime, tickMs));
  }

  async function save() {
    updateClock();
    try {
      await writeSave(engine.save());
      setMessage('已儲存城市。');
    } catch (error) {
      console.error('Save failed', error);
      setMessage('無法儲存城市。');
    }
  }

  async function load() {
    let data: unknown;
    try {
      data = await readSave();
    } catch (error) {
      console.error('Load failed', error);
      setMessage('無法讀取存檔。');
      return;
    }
    if (data === undefined) {
      setMessage('尚未儲存過城市。');
      return;
    }
    try {
      engine.load(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '存檔資料損壞。');
      return;
    }
    clock.reset();
    lastTime.current = performance.now();
    setTick(engine.getSnapshot().tick);
    setStats(engine.city.getStats());
    knownRank.current = engine.city.getStats().rank;
    rendererRef.current?.refresh?.();
    setDemo(false);
    setMessage('已讀取城市。');
  }

  useEffect(() => {
    lastTime.current = performance.now();
    const timer = window.setInterval(() => {
      const next = step(engine, clock, lastTime, tickMs);
      setTick(next);
      setHour(hourAt(next, clock.tickProgress));
    }, 40);
    return () => window.clearInterval(timer);
  }, [engine, clock]);

  useEffect(() => {
    if (!debug) return;
    let frames = 0;
    let since = performance.now();
    let request = requestAnimationFrame(function count(now) {
      frames++;
      if (now - since >= 500) {
        setFps(Math.round(frames * 1000 / (now - since)));
        frames = 0;
        since = now;
      }
      request = requestAnimationFrame(count);
    });
    return () => cancelAnimationFrame(request);
  }, [debug]);

  useEffect(() => {
    const host = viewport.current;
    if (!host) return;

    const lifetime = new AbortController();
    const renderer = new CityRenderer(engine.city, () => clock.speed,
      () => hourAt(engine.getSnapshot().tick, clock.tickProgress), () => activeOverlay.current);
    rendererRef.current = renderer;
    void renderer.mount(host, lifetime.signal, () => activeTool.current, message => {
      setMessage(message);
      setStats(engine.city.getStats());
    }, setSelected).catch((error: unknown) => {
      if (lifetime.signal.aborted) return;
      console.error('PixiJS initialization failed', error);
      setFailed(true);
    });

    return () => {
      lifetime.abort();
      renderer.destroy();
    };
  }, [engine]);

  useEffect(() => {
    const next = engine.city.getStats();
    setStats(next);
    if (next.rank > knownRank.current) {
      setMessage(`城市升級為「${rankNames[next.rank]}」，獲得補助 ${money(milestones[next.rank - 1].grant)}。`);
    }
    knownRank.current = next.rank;
    rendererRef.current?.refresh?.();
  }, [engine, tick]);

  /** Runs a command from a button rather than the map, then shows the result. */
  function command(action: Parameters<typeof engine.city.execute>[0], done: string) {
    const result = engine.city.execute(action);
    setStats(engine.city.getStats());
    rendererRef.current?.refresh?.();
    setMessage(result.error ?? done);
  }

  function startDemo() {
    if (engine.city.map.save().some(code => code !== 0) &&
        !window.confirm('示範街區會替換目前地圖。確定繼續？')) return;
    const sample = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
    demoCity(sample);
    engine.load(sample.save());
    clock.reset();
    lastTime.current = performance.now();
    setTick(0);
    setHour(hourAt(0));
    setDemo(true);
    knownRank.current = 0;
    setStats(engine.city.getStats());
    rendererRef.current?.refresh?.();
    setMessage('示範街區已載入：一座會自己成長、升級的小鎮。調到 4× 看它長大，或試試下面的停電、停水與道路施工。');
  }

  const date = dateAt(tick);
  const info = selected && engine.city.inspect(selected);
  const building = selected && engine.city.getBuilding(selected);
  const demoTile = (cell: Cell) => engine.city.map.get(cell);
  const shift = building && building.zone !== 'residential' ? workShift(building.zone, building.id) : undefined;
  const nextRank = milestones[stats.rank];
  const complaints = ISSUES.filter(issue => stats.complaints[issue] > 0)
    .sort((a, b) => stats.complaints[b] - stats.complaints[a]).slice(0, 3);

  return (
    <main>
      <header>
        <h1>Pixel City Simulator</h1>
        <div className="tools clock" role="group" aria-label="模擬時間">
          <span>{date.year} 年 {date.month} 月 {date.day} 日 {String(Math.floor(hour)).padStart(2, '0')}:{String(Math.floor(hour % 1 * 60)).padStart(2, '0')}</span>
          {speeds.map(value => (
            <button key={value} type="button" aria-pressed={speed === value} onClick={() => {
              updateClock();
              clock.speed = value;
              setSpeed(value);
            }}>{value === 0 ? '暫停' : `${value}×`}</button>
          ))}
          <button type="button" onClick={startDemo}>示範街區</button>
          <button type="button" onClick={() => void save()}>儲存</button>
          <button type="button" onClick={() => void load()}>讀取</button>
          <button type="button" aria-pressed={debug} onClick={() => setDebug(!debug)}>除錯</button>
        </div>
      </header>
      <dl className="stats">
        <div title={`每月稅收 ${money(stats.budget.tax)}，維護費 ${money(stats.budget.upkeep)}。每月 1 日前後結算。`}>
          <dt>資金</dt>
          <dd>{money(stats.funds)}（<span className={stats.budget.net < 0 ? 'loss' : undefined}>每月 {stats.budget.net >= 0 ? '+' : ''}{money(stats.budget.net)}</span>）</dd>
        </div>
        <div><dt>規模</dt><dd>{rankNames[stats.rank]}{nextRank && `（${nextRank.population} 人升級）`}</dd></div>
        <div><dt>人口</dt><dd>{stats.population}</dd></div>
        <div><dt>就業</dt><dd>{stats.employed} / {stats.jobs}</dd></div>
        <div><dt>建築</dt><dd>{stats.buildings}</dd></div>
        <div><dt>平均通勤</dt><dd>{stats.employed ? `${Math.round(stats.commute)} 分` : '—'}</dd></div>
        <div className="demand" title="需求為正時，有道路的分區才會蓋出建築。">
          <dt>需求</dt>
          {zones.map(([zone, label]) => (
            <dd key={zone}>
              {label} {stats.demand[zone] > 0 ? '+' : ''}{Math.round(stats.demand[zone])}
              <meter min={-100} max={100} value={stats.demand[zone]} aria-label={`${label}需求`} />
            </dd>
          ))}
        </div>
        <div><dt>市民反映</dt><dd>{complaints.length ?
          complaints.map(issue => `${issueNames[issue]} ${stats.complaints[issue]} 棟`).join('、') : '沒有問題'}</dd></div>
        {debug && <>
          <div><dt>Tick</dt><dd>{tick}</dd></div>
          <div><dt>FPS</dt><dd>{fps}</dd></div>
          <div><dt>模擬耗時</dt><dd>{tickMs.current.toFixed(3)} ms / Tick</dd></div>
        </>}
      </dl>
      {demo && <div className="tools" role="group" aria-label="市政事件">
        <span>西側電廠 ({powerPlant.x}, {powerPlant.y}) · 西側水塔 ({waterTower.x}, {waterTower.y}) · 通往工業區的大道 ({works.x}, {works.y})</span>
        {demoTile(powerPlant) === 'power' ?
          <button type="button" onClick={() => command({ type: 'DEMOLISH', ...powerPlant },
            '電廠停機，沒電的建築只剩一半容量。')}>模擬停電</button> :
          <button type="button" onClick={() => command({ type: 'BUILD_FACILITY', ...powerPlant, facility: 'power' },
            '已恢復供電。')}>恢復供電</button>}
        {demoTile(waterTower) === 'water' ?
          <button type="button" onClick={() => command({ type: 'DEMOLISH', ...waterTower },
            '水塔停止供水，沒水的建築只剩一半容量。')}>模擬停水</button> :
          <button type="button" onClick={() => command({ type: 'BUILD_FACILITY', ...waterTower, facility: 'water' },
            '已恢復供水。')}>恢復供水</button>}
        {demoTile(works) === 'avenue' ?
          <button type="button" onClick={() => command({ type: 'DEMOLISH', ...works },
            '大道施工中，工業區的人上不了班。')}>道路施工</button> :
          <button type="button" onClick={() => command({ type: 'BUILD_ROAD', path: [works], road: 'avenue' },
            '施工路段已開放。')}>開放施工路段</button>}
      </div>}
      <div className="board">
        <div className="viewport" ref={viewport} role="region" aria-label="城市地圖" />
        <aside aria-label="地塊資訊">
          <h2>地塊資訊</h2>
          {selected && info ? (
            <dl>
              <dt>座標</dt><dd>{selected.x}, {selected.y}</dd>
              <dt>類型</dt><dd>{tileNames[info.tile]}</dd>
              {info.pollution !== undefined && <>
                <dt>污染</dt><dd>{info.pollution}{info.tile === 'residential' && `（超過 ${pollution.limit} 不再遷入）`}</dd>
              </>}
              {info.value !== undefined && <>
                <dt>地價</dt><dd>{info.value}{info.building && (info.nextLevel === undefined ? '（已是最高等級）' :
                  `（住滿且達 ${info.nextLevel} 會升級）`)}</dd>
              </>}
              {info.tile === 'park' && <><dt>維護費</dt><dd>每月 {money(economy.upkeep.park)}</dd></>}
              {info.flow !== undefined && <>
                <dt>通勤車流</dt><dd>{info.flow} 人</dd>
                <dt>路況</dt><dd>{trafficName(info.congestion)}（容量 {info.roadCapacity} 人的 {Math.round(info.congestion * 100)}%）</dd>
                <dt>維護費</dt><dd>每月 {money(economy.upkeep[info.tile])}</dd>
              </>}
              {info.serving !== undefined && <>
                <dt>服務建築</dt><dd>{info.serving} / {info.capacity} 棟</dd>
                <dt>維護費</dt><dd>每月 {money(economy.upkeep[info.tile])}</dd>
              </>}
              {info.building !== undefined && <>
                <dt>道路接入</dt><dd>{info.roadAccess ? '有' : '無'}</dd>
                {!info.building && <><dt>建築</dt><dd>{info.roadAccess ? '等待需求' : '需要道路'}</dd></>}
                {info.building && <>
                  <dt>{info.tile === 'residential' ? '居民' : '員工'}</dt><dd>{info.occupants} / {info.capacity}（等級 {info.level}）</dd>
                  {info.tile === 'residential' && <>
                    <dt>就業</dt><dd>{info.employed} / {info.occupants}</dd>
                    <dt>通勤</dt><dd>{info.commute === undefined ? '—' : `${Math.round(info.commute)} 分（超過 ${traffic.longCommute} 分不再遷入）`}</dd>
                  </>}
                  <dt>供電</dt><dd>{info.power ? '正常' : '無'}</dd>
                  <dt>供水</dt><dd>{info.water ? '正常' : '無'}</dd>
                  {shift && <>
                    <dt>工作類型</dt><dd>{shift.title}</dd>
                    <dt>班表</dt><dd>{shift.start}:00–{shift.end}:00</dd>
                    <dt>在班</dt><dd>{shiftPhase(hour, shift.start, shift.end, 1).atWork ? info.occupants : 0} 人</dd>
                  </>}
                  <dt>狀態</dt><dd>{info.issues.length ? info.issues.map(issue => issueNames[issue]).join('、') : '正常'}</dd>
                </>}
              </>}
            </dl>
          ) : <p className="hint">選「查看」後點擊地塊。</p>}
        </aside>
      </div>
      {failed && <p role="alert">無法初始化城市地圖。</p>}
      <div className="tools" role="group" aria-label="地圖工具">
        {tools.map(([value, label]) => (
          <button key={value} type="button" data-tool={value} aria-pressed={tool === value} onClick={() => {
            activeTool.current = value;
            setTool(value);
            setMessage(isFacility(value) ? `框線內是服務範圍（${utilities.radius} 格），每座最多服務 ${utilities.capacity[value]} 棟建築。綠色建築已有服務，紅色沒有。` : '');
            rendererRef.current?.refresh?.();
          }}>{label}{toolCost(value) !== undefined && <small>{money(toolCost(value)!)}</small>}</button>
        ))}
      </div>
      <div className="tools" role="group" aria-label="地圖圖層">
        <span>圖層</span>
        {overlays.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={overlay === value} onClick={() => {
            activeOverlay.current = value;
            setOverlay(value);
            rendererRef.current?.refresh?.();
          }}>{label}</button>
        ))}
      </div>
      <p className="hint">拖曳鋪路或劃分區，點擊放置電廠與水塔、拆除或查看。價格是每一格的費用；大道比道路快一倍、容量三倍，可以直接鋪在道路上升級。工廠、電廠與塞車的道路會污染周圍，住宅要離遠一點或用公園隔開。有水電、靠近公園、通勤短、污染低的地段地價高，住滿的建築會升級（右上角的金色方塊）並容納更多人。沒有水電的建築只有一半容量。選「移動」或按住滑鼠中鍵拖曳，滾輪縮放。</p>
      <p className="hint" role="status">{message}</p>
    </main>
  );
}
