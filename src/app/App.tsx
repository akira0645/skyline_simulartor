import { useEffect, useRef, useState } from 'react';
import { CityRenderer } from '../rendering/CityRenderer';
import type { Tool } from './tools';
import type { Cell, Tile } from '../simulation/TileMap';
import { dateAt } from '../simulation/calendar';
import { SimulationClock, type SimulationSpeed } from '../simulation/SimulationClock';
import { SimulationEngine } from '../simulation/SimulationEngine';
import { readSave, writeSave } from '../storage/SaveManager';

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
    setMessage('已讀取城市。');
  }

  useEffect(() => {
    lastTime.current = performance.now();
    const timer = window.setInterval(() => setTick(step(engine, clock, lastTime, tickMs)), 100);
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
    const renderer = new CityRenderer(engine.city);
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

  const date = dateAt(tick);
  const info = selected && engine.city.inspect(selected);

  return (
    <main>
      <header>
        <h1>Pixel City Simulator</h1>
        <div className="tools clock" role="group" aria-label="模擬時間">
          <span>{date.year} 年 {date.month} 月 {date.day} 日</span>
          {speeds.map(value => (
            <button key={value} type="button" aria-pressed={speed === value} onClick={() => {
              updateClock();
              clock.speed = value;
              setSpeed(value);
            }}>{value === 0 ? '暫停' : `${value}×`}</button>
          ))}
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
