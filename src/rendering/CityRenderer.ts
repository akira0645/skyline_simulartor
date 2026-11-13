import { Application, Assets, Graphics, type Texture } from 'pixi.js';
import cityUrl from '../assets/city.png';
import tilesUrl from '../assets/tiles.png';
import { MAP_SIZE, TILE_SIZE, type Cell } from '../simulation/TileMap';
import { selection, type Tool } from '../app/tools';
import { Camera } from './Camera';
import { TileRenderer } from './TileRenderer';
import { commuterPosition } from './commuterPosition';

import type { BuildingSystem } from '../simulation/BuildingSystem';

export class CityRenderer {
  refresh?: () => void;

  constructor(private readonly city: BuildingSystem, private readonly speed: () => number) {}
  private app?: Application;
  private observer?: ResizeObserver;

  async mount(host: HTMLElement, signal: AbortSignal, getTool: () => Tool,
    report: (message: string) => void, inspect: (cell: Cell) => void): Promise<void> {
    const app = new Application();
    await app.init({ width: host.clientWidth, height: host.clientHeight,
      background: '#1d1f24', antialias: false, autoStart: false });
    const sheets = await Promise.all([tilesUrl, cityUrl].map(url => Assets.load<Texture>(url)))
      .catch((error: unknown) => {
        app.destroy(true);
        throw error;
      });
    for (const sheet of sheets) sheet.source.scaleMode = 'nearest';
    if (signal.aborted) {
      app.destroy(true);
      return;
    }

    this.app = app;
    const map = this.city.map;
    const camera = new Camera();
    const tiles = new TileRenderer(sheets[0].source, sheets[1].source);
    const canvas = app.canvas;
    app.stage.addChild(tiles.view);
    const people = new Graphics();
    app.stage.addChild(people);
    host.appendChild(canvas);

    let animationTime = 0;
    const drawPeople = () => {
      people.clear();
      people.position.set(camera.x, camera.y);
      people.scale.set(camera.scale);
      const routes = this.city.getCommutes();
      for (let i = 0; i < Math.min(routes.length, 80); i++) {
        const position = commuterPosition(routes[i], animationTime + i * 185);
        if (!position) continue;
        const x = Math.round(position.x * TILE_SIZE + 12);
        const y = Math.round(position.y * TILE_SIZE + 11);
        const stride = Math.floor(animationTime / 140 + i) % 2;
        people.rect(x - 1, y - 1, 9, 13).fill(0x25232b);
        people.rect(x + 2, y, 4, 4).fill(0xffd1a0);
        people.rect(x + 1, y + 4, 6, 4).fill(i % 2 ? 0x7edbed : 0xf6ba67);
        people.rect(x + 1, y + 8, 2, 2 + stride).rect(x + 5, y + 8, 2, 3 - stride).fill(0xece6dd);
      }
    };
    app.ticker.add(ticker => {
      const speed = this.speed();
      if (!speed || !this.city.getCommutes().length) return;
      animationTime += ticker.deltaMS * speed;
      drawPeople();
    });
    app.start();

    let preview: Cell[] = [];
    let selected: Cell | undefined;
    let drag: { id: number; tool: Tool; start: Cell; x: number; y: number } | undefined;
    const draw = () => {
      tiles.draw(this.city, camera, app.screen.width, app.screen.height, preview, selected);
      drawPeople();
      app.render();
    };
    this.refresh = draw;
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
      if (tool === 'inspect') {
        selected = start;
        inspect(start);
      } else if (tool !== 'pan') {
        const cells = selection(tool, start, boundedCell(x, y));
        const result = this.city.execute(tool === 'road' ? { type: 'BUILD_ROAD', path: cells } :
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
    this.refresh = undefined;
    this.observer?.disconnect();
    this.app?.destroy(true, { children: true });
    this.app = undefined;
  }
}
