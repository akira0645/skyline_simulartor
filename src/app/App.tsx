import { useEffect, useRef, useState } from 'react';
import { CityRenderer } from '../rendering/CityRenderer';
import type { Tool } from './tools';

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

  useEffect(() => {
    const host = viewport.current;
    if (!host) return;

    const lifetime = new AbortController();
    const renderer = new CityRenderer();
    void renderer.mount(host, lifetime.signal, () => activeTool.current, setMessage).catch((error: unknown) => {
      if (lifetime.signal.aborted) return;
      console.error('PixiJS initialization failed', error);
      setFailed(true);
    });

    return () => {
      lifetime.abort();
      renderer.destroy();
    };
  }, []);

  return (
    <main>
      <h1>Pixel City Simulator</h1>
      <div className="viewport" ref={viewport} role="region" aria-label="城市地圖" />
      {failed && <p role="alert">無法初始化城市地圖。</p>}
      <div className="tools" role="group" aria-label="地圖工具">
        {tools.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={tool === value} onClick={() => {
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
