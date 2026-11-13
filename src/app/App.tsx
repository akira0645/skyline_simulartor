import { useEffect, useRef, useState } from 'react';
import { CityRenderer } from '../rendering/CityRenderer';
import type { Tool } from './tools';
import { SimulationClock, type SimulationSpeed } from '../simulation/SimulationClock';
import { SimulationEngine } from '../simulation/SimulationEngine';

const speeds = [0, 1, 2, 4] as const;

const tools: [Tool, string][] = [
  ['pan', '移動'], ['road', '道路'], ['residential', '住宅'],
  ['commercial', '商業'], ['industrial', '工業'], ['demolish', '拆除'],
];

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

  function updateClock() {
    const now = performance.now();
    setTick(clock.advance(now - lastTime.current));
    lastTime.current = now;
  }

  useEffect(() => {
    lastTime.current = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      setTick(clock.advance(now - lastTime.current));
      lastTime.current = now;
    }, 100);
    return () => window.clearInterval(timer);
  }, [clock]);

  useEffect(() => {
    const host = viewport.current;
    if (!host) return;

    const lifetime = new AbortController();
    const renderer = new CityRenderer(engine.city);
    rendererRef.current = renderer;
    void renderer.mount(host, lifetime.signal, () => activeTool.current, message => {
      setMessage(message);
      setStats(engine.city.getStats());
    }).catch((error: unknown) => {
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

  return (
    <main>
      <header>
        <h1>Pixel City Simulator</h1>
        <div className="tools clock" role="group" aria-label="模擬時間">
          <span>Tick {tick}</span>
          {speeds.map(value => (
            <button key={value} type="button" aria-pressed={speed === value} onClick={() => {
              updateClock();
              clock.speed = value;
              setSpeed(value);
            }}>{value === 0 ? '暫停' : `${value}×`}</button>
          ))}
        </div>
      </header>
      <dl className="stats">
        <div><dt>人口</dt><dd>{stats.population}</dd></div>
        <div><dt>就業</dt><dd>{stats.employed} / {stats.jobs}</dd></div>
        <div><dt>建築</dt><dd>{stats.buildings}</dd></div>
      </dl>
      <div className="viewport" ref={viewport} role="region" aria-label="城市地圖" />
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
      <p className="hint">拖曳鋪路或劃分區，點擊拆除。選「移動」或按住滑鼠中鍵拖曳，滾輪縮放。</p>
      <p className="hint" role="status">{message}</p>
    </main>
  );
}
