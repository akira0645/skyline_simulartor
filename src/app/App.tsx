import { useEffect, useRef, useState } from 'react';
import { CityRenderer } from '../rendering/CityRenderer';

export function App() {
  const viewport = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = viewport.current;
    if (!host) return;

    const lifetime = new AbortController();
    const renderer = new CityRenderer();
    void renderer.mount(host, lifetime.signal).catch((error: unknown) => {
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
      <div className="viewport" ref={viewport} role="region" aria-label="城市畫布" />
      {failed && <p role="alert">無法初始化城市畫布。</p>}
    </main>
  );
}
