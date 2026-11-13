import { Application } from 'pixi.js';
import { MAP_SIZE, TileMap, type Cell } from '../simulation/TileMap';
import { selection, type Tool } from '../app/tools';
import { Camera } from './Camera';
import { TileRenderer } from './TileRenderer';

export class CityRenderer {
  private app?: Application;
  private observer?: ResizeObserver;

  async mount(host: HTMLElement, signal: AbortSignal, getTool: () => Tool,
    report: (message: string) => void): Promise<void> {
    const app = new Application();
    await app.init({ width: host.clientWidth, height: host.clientHeight,
      background: '#263e2d', antialias: false, autoStart: false });
    if (signal.aborted) {
      app.destroy(true);
      return;
    }

    this.app = app;
    const map = new TileMap();
    const camera = new Camera();
    const tiles = new TileRenderer();
    const canvas = app.canvas;
    app.stage.addChild(tiles.graphic);
    host.appendChild(canvas);

    let preview: Cell[] = [];
    let drag: { id: number; tool: Tool; start: Cell; x: number; y: number } | undefined;
    const draw = () => {
      tiles.draw(map, camera, app.screen.width, app.screen.height, preview);
      app.render();
    };
    const position = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const boundedCell = (x: number, y: number) => {
      const cell = camera.cellAt(x, y);
      const clamp = (value: number) => Math.min(MAP_SIZE - 1, Math.max(0, value));
      return { x: clamp(cell.x), y: clamp(cell.y) };
    };

    canvas.addEventListener('pointerdown', event => {
      if (drag || (event.button !== 0 && event.button !== 1)) return;
      const { x, y } = position(event);
      const tool = event.button === 1 ? 'pan' : getTool();
      const start = camera.cellAt(x, y);
      if (tool !== 'pan' && map.get(start) === undefined) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, tool, start, x, y };
      preview = tool === 'pan' ? [] : [start];
      draw();
    }, { signal });

    canvas.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const { x, y } = position(event);
      if (drag.tool === 'pan') camera.pan(x - drag.x, y - drag.y, app.screen.width, app.screen.height);
      else preview = selection(drag.tool, drag.start, boundedCell(x, y));
      drag.x = x;
      drag.y = y;
      draw();
    }, { signal });

    const clearDrag = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) return;
      drag = undefined;
      preview = [];
      draw();
    };
    canvas.addEventListener('pointerup', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const { tool, start } = drag;
      const { x, y } = position(event);
      if (tool !== 'pan') {
        const cells = selection(tool, start, boundedCell(x, y));
        const result = map.execute(tool === 'road' ? { type: 'BUILD_ROAD', path: cells } :
          tool === 'demolish' ? { type: 'DEMOLISH', ...start } :
          { type: 'SET_ZONE', tiles: cells, zone: tool });
        report(result.error ?? (result.changed.length ? '已更新地圖。' : '地圖無變更。'));
      }
      clearDrag(event);
    }, { signal });
    canvas.addEventListener('pointercancel', clearDrag, { signal });
    canvas.addEventListener('lostpointercapture', clearDrag, { signal });

    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      if (drag) return;
      const { x, y } = position(event);
      const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? app.screen.height : 1;
      camera.zoom(x, y, event.deltaY * multiplier, app.screen.width, app.screen.height);
      draw();
    }, { signal, passive: false });

    this.observer = new ResizeObserver(() => {
      app.renderer.resize(host.clientWidth, host.clientHeight);
      camera.pan(0, 0, app.screen.width, app.screen.height);
      draw();
    });
    this.observer.observe(host);
    draw();
  }

  destroy(): void {
    this.observer?.disconnect();
    this.app?.destroy(true, { children: true });
    this.app = undefined;
  }
}
