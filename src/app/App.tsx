import { useEffect, useRef, useState } from 'react';
import { CityRenderer } from '../rendering/CityRenderer';
import type { Tool } from './tools';
import type { Cell, Tile } from '../simulation/TileMap';
import { demoCity, powerPlant, waterTower, works } from './demoCity';
import { gameHour, workShift, shiftPhase } from '../simulation/WorkShift';
import { dateAt } from '../simulation/calendar';
import { SimulationClock, type SimulationSpeed } from '../simulation/SimulationClock';
import { SimulationEngine } from '../simulation/SimulationEngine';
import { readSave, writeSave } from '../storage/SaveManager';

function serviceAt(cell: Cell, state: { demo: boolean; power: boolean; water: boolean }) {
  const covers = (facility: Cell) => Math.abs(cell.x - facility.x) + Math.abs(cell.y - facility.y) <= 12;
  const power = state.power && (!state.demo || covers(powerPlant));
  const water = state.water && (!state.demo || covers(waterTower));
  return { power, water, operating: power && water };
}

const speeds = [0, 1, 2, 4] as const;

const tools: [Tool, string][] = [
  ['pan', '移動'], ['inspect', '查看'], ['road', '道路'], ['residential', '住宅'],
  ['commercial', '商業'], ['industrial', '工業'], ['demolish', '拆除'],
];

const tileNames: Record<Tile, string> = {
  grass: '草地', road: '道路', residential: '住宅區', commercial: '商業區', industrial: '工業區',
};

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
  const [hour, setHour] = useState(7);
  const [demo, setDemo] = useState(false);
  const [services, setServices] = useState({ power: true, water: true });
  const utilities = useRef({ ...services, demo: false });

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
    rendererRef.current?.refresh?.();
    utilities.current = { power: true, water: true, demo: false };
    setServices(utilities.current);
    setDemo(false);
    setMessage('已讀取城市。');
  }

  useEffect(() => {
    lastTime.current = performance.now();
    const timer = window.setInterval(() => {
      const next = step(engine, clock, lastTime, tickMs);
      setTick(next);
      setHour(gameHour((next % 8 + clock.dayProgress) / 8));
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
      () => gameHour((engine.getSnapshot().tick % 8 + clock.dayProgress) / 8),
      cell => serviceAt(cell, utilities.current).operating,
      () => utilities.current.demo ? [powerPlant, waterTower] : []);
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
    setStats(engine.city.getStats());
    rendererRef.current?.refresh?.();
  }, [engine, tick]);

  function toggleService(key: 'power' | 'water') {
    utilities.current = { ...utilities.current, [key]: !utilities.current[key] };
    setServices(utilities.current);
    rendererRef.current?.refresh?.();
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
    setHour(7);
    utilities.current = { power: true, water: true, demo: true };
    setServices(utilities.current);
    setDemo(true);
    setStats(engine.city.getStats());
    rendererRef.current?.refresh?.();
    setMessage('示範街區已載入。辦公室和店鋪上班前會有步行與汽車通勤。');
  }

  const date = dateAt(Math.floor(tick / 8));
  const info = selected && engine.city.inspect(selected);
  const building = selected && engine.city.getBuilding(selected);
  const coverage = selected && serviceAt(selected, utilities.current);
  const shift = building && building.zone !== 'residential' ? workShift(building.zone, building.id) : undefined;

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
        <div><dt>人口</dt><dd>{stats.population}</dd></div>
        <div><dt>就業</dt><dd>{stats.employed} / {stats.jobs}</dd></div>
        <div><dt>建築</dt><dd>{stats.buildings}</dd></div>
        {debug && <>
          <div><dt>Tick</dt><dd>{tick}</dd></div>
          <div><dt>FPS</dt><dd>{fps}</dd></div>
          <div><dt>模擬耗時</dt><dd>{tickMs.current.toFixed(3)} ms / Tick</dd></div>
        </>}
      </dl>
      {demo && <div className="tools" role="group" aria-label="市政事件">
        <span>變電站 (2, 2) · 水塔 (3, 2) · 施工路段 (6, 3)</span>
        <button type="button" onClick={() => toggleService('power')}>{services.power ? '模擬停電' : '恢復供電'}</button>
        <button type="button" onClick={() => toggleService('water')}>{services.water ? '模擬停水' : '恢復供水'}</button>
        <button type="button" onClick={() => {
          const road = engine.city.map.get(works) === 'road';
          engine.city.execute(road ? { type: 'DEMOLISH', ...works } : { type: 'BUILD_ROAD', path: [works] });
          setStats(engine.city.getStats());
          rendererRef.current?.refresh?.();
          setMessage(road ? '道路施工中，通勤已重新配對。' : '施工路段已開放。');
        }}>{engine.city.map.get(works) === 'road' ? '道路施工' : '開放施工路段'}</button>
      </div>}
      <div className="board">
        <div className="viewport" ref={viewport} role="region" aria-label="城市地圖" />
        <aside aria-label="地塊資訊">
          <h2>地塊資訊</h2>
          {selected && info ? (
            <dl>
              <dt>座標</dt><dd>{selected.x}, {selected.y}</dd>
              <dt>類型</dt><dd>{tileNames[info.tile]}</dd>
              {'building' in info && <>
                <dt>道路接入</dt><dd>{info.roadAccess ? '有' : '無'}</dd>
                <dt>建築</dt><dd>{info.building ? '已建成' : info.roadAccess ? '等待需求' : '需要道路'}</dd>
                {info.building && <>
                  {demo && coverage && <>
                    <dt>供電</dt><dd>{coverage.power ? '正常' : '中斷'}</dd>
                    <dt>供水</dt><dd>{coverage.water ? '正常' : '中斷'}</dd>
                  </>}
                  {shift && <>
                    <dt>工作類型</dt><dd>{shift.title}</dd>
                    <dt>班表</dt><dd>{shift.start}:00–{shift.end}:00</dd>
                    <dt>在班</dt><dd>{coverage?.operating && shiftPhase(hour, shift.start, shift.end, 1).atWork ? info.occupants : 0} 人</dd>
                  </>}
                  <dt>{info.tile === 'residential' ? '居民' : '職缺'}</dt><dd>{info.occupants} / {info.capacity}（等級 {info.level}）</dd>
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
            setMessage('');
          }}>{label}</button>
        ))}
      </div>
      <p className="hint">拖曳鋪路或劃分區，點擊拆除或查看。選「移動」或按住滑鼠中鍵拖曳，滾輪縮放。</p>
      <p className="hint" role="status">{message}</p>
    </main>
  );
}
