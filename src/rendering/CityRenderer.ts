import { Application } from 'pixi.js';

export class CityRenderer {
  private app?: Application;

  async mount(host: HTMLElement, signal: AbortSignal): Promise<void> {
    const app = new Application();
    await app.init({
      width: host.clientWidth,
      height: host.clientHeight,
      background: '#253b30',
      antialias: false,
      autoStart: false,
    });

    if (signal.aborted) {
      app.destroy(true);
      return;
    }

    this.app = app;
    app.resizeTo = host;
    host.appendChild(app.canvas);
  }

  destroy(): void {
    this.app?.destroy(true);
    this.app = undefined;
  }
}
