import { SUSPEND_GAP_MS, type SimulationSpeed } from '../simulation/SimulationClock';

/** Use raw frame time: Pixi's capped deltaMS otherwise slows only the animation at low FPS. */
export function animationElapsed(elapsedMS: number, speed: SimulationSpeed): number {
  return Number.isFinite(elapsedMS) && elapsedMS >= 0 && elapsedMS <= SUSPEND_GAP_MS
    ? elapsedMS * speed : 0;
}
