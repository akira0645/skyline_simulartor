import { MAP_SIZE, type Cell } from './TileMap';
import type { RoadBody, RoadOccupancy } from './RoadOccupancy';

export interface JunctionNetwork {
  isJunction(cell: Cell): boolean;
  green(cell: Cell, hx: number, hy: number, time: number): boolean;
}
interface Crossing {
  keys: string[]; stop: number; exit: number; direction: number; axis: number; turn: boolean;
}
export interface JunctionDecision { stop?: number; crossing?: Crossing }
interface Request { first: number; seen: number; ready: boolean; crossing: Crossing }
export interface JunctionFlowSave { owners: [string, Crossing][]; requests: [string, Request][] }
const conflicts = (a: Crossing, b: Crossing) => a.keys.some(key => b.keys.includes(key)) &&
  (a.turn || b.turn || a.axis !== b.axis);

/** Keep-clear admission. Independent straight opposing lanes may share a junction; conflicting
 * turns wait outside it. A waiting conflicting movement eventually drains newer admissions. */
export class JunctionFlow {
  private readonly owners = new Map<string, Crossing>();
  private readonly requests = new Map<string, Request>();
  clear(): void { this.owners.clear(); this.requests.clear(); }
  leave(actor: string): void { this.owners.delete(actor); this.requests.delete(actor); }
  leavePrefix(prefix: string): void {
    for (const actor of new Set([...this.owners.keys(), ...this.requests.keys()])) if (actor.startsWith(prefix)) this.leave(actor);
  }
  retainPrefix(prefix: string, live: ReadonlySet<string>): void {
    for (const actor of new Set([...this.owners.keys(), ...this.requests.keys()])) if (actor.startsWith(prefix) && !live.has(actor)) this.leave(actor);
  }
  revalidate(valid: (key: string) => boolean): void {
    for (const [actor, crossing] of this.owners) if (!crossing.keys.every(valid)) this.leave(actor);
    for (const [actor, request] of this.requests) if (!request.crossing.keys.every(valid)) this.leave(actor);
  }
  snapshot(prefix: string): JunctionFlowSave {
    const copy = (crossing: Crossing) => ({ ...crossing, keys: [...crossing.keys] });
    return { owners: [...this.owners].filter(([actor]) => actor.startsWith(prefix)).map(([actor, crossing]) => [actor, copy(crossing)]),
      requests: [...this.requests].filter(([actor]) => actor.startsWith(prefix)).map(([actor, request]) => [actor, { ...request, crossing: copy(request.crossing) }]) };
  }
  restore(save?: JunctionFlowSave): void {
    this.clear();
    for (const [actor, crossing] of save?.owners ?? []) this.owners.set(actor, { ...crossing, keys: [...crossing.keys] });
    for (const [actor, request] of save?.requests ?? []) this.requests.set(actor, { ...request, crossing: { ...request.crossing, keys: [...request.crossing.keys] } });
  }
  inspect(actor: string, progress: number, path: readonly Cell[], direction: number,
    at: (progress: number) => RoadBody, occupancy: RoadOccupancy, network: JunctionNetwork, time: number,
    end = path.length - 1): JunctionDecision {
    const owned = this.owners.get(actor);
    if (owned) {
      if (direction === owned.direction && direction * (progress - owned.exit) < -1e-6) return {};
      this.leave(actor);
    }
    const length = at(progress).length ?? 15 / 32;
    const first = direction > 0 ? Math.max(0, Math.floor(progress) - 1) : Math.min(path.length - 1, Math.ceil(progress) + 1);
    for (let node = first; node >= 0 && node < path.length && Math.abs(node - progress) <= 4; node += direction) {
      const cell = path[node];
      if (!network.isJunction(cell)) continue;
      const stop = node - direction * (0.5 + length / 2 + 1 / 32);
      let tail = node;
      const keys = [`${cell.x},${cell.y}`];
      while (tail + direction >= 0 && tail + direction < path.length && network.isJunction(path[tail + direction])) {
        tail += direction; keys.push(`${path[tail].x},${path[tail].y}`);
      }
      const exit = Math.max(0, Math.min(end, tail + direction * (0.5 + length / 2 + 1 / 32)));
      if (direction * (progress - exit) >= -1e-6) continue;
      const before = path[Math.max(0, Math.min(path.length - 1, node - direction))];
      const hx = Math.sign(cell.x - before.x), hy = Math.sign(cell.y - before.y);
      const exitBody = at(exit);
      const crossing = { keys, stop, exit, direction, axis: Math.abs(hy) > Math.abs(hx) ? 1 : 0,
        turn: hx * exitBody.hx + hy * exitBody.hy < 0.99 };
      // Loaded/spawned vehicles already within the box must be allowed to clear it, even on red.
      if (direction * (progress - stop) > 0.025) {
        this.owners.set(actor, crossing); this.requests.delete(actor); return {};
      }
      const ready = network.green(cell, hx, hy, time) && occupancy.canOccupy(exitBody);
      const previous = this.requests.get(actor);
      const distance = direction * (stop - progress);
      const leader = ready && distance <= 0.35 ? occupancy.leader(at(progress)) : undefined;
      // A turn queued behind another car cannot ask that car to yield: it would trap itself.
      const headOfQueue = distance <= 0.35 && (!leader || leader.gap >= Math.max(0, distance));
      this.requests.set(actor, { first: previous?.first ?? time, seen: time, ready: ready && headOfQueue, crossing });
      let admitted = ready;
      for (const [key, owner] of this.owners) if (key !== actor && conflicts(crossing, owner)) admitted = false;
      for (const [key, request] of this.requests) {
        if (time - request.seen > 250) { this.requests.delete(key); continue; }
        if (key !== actor && request.ready && time - request.first >= 500 && conflicts(crossing, request.crossing) &&
          (request.first < (previous?.first ?? time) || request.first === (previous?.first ?? time) && key < actor)) admitted = false;
      }
      return admitted ? { crossing } : { stop };
    }
    this.requests.delete(actor);
    return {};
  }
  commit(actor: string, progress: number, decision: JunctionDecision): void {
    const crossing = decision.crossing;
    if (crossing && crossing.direction * (progress - crossing.stop) > 1e-6) {
      this.owners.set(actor, crossing); this.requests.delete(actor);
    }
  }
}

/** Validate optional freight reservation data before replacing any city state. */
export function parseJunctionFlow(value: unknown, actors: ReadonlyMap<string, number>, time: number): JunctionFlowSave | undefined {
  if (value === undefined) return undefined;
  const fail = (): never => { throw new Error('存檔路口資料損壞。'); };
  const object = (v: any): any => v && typeof v === 'object' && !Array.isArray(v) ? v : fail();
  const finite = (n: any, min: number, max: number): number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? n : fail();
  const crossing = (v: any, end: number): Crossing => {
    const c = object(v);
    if (!Array.isArray(c.keys) || !c.keys.length || c.keys.length > MAP_SIZE ** 2 || c.keys.some((key: any) =>
      typeof key !== 'string' || !/^(\d{1,3}),(\d{1,3})$/.test(key) || key.split(',').some((n: string) => Number(n) >= MAP_SIZE))) fail();
    if (![1, -1].includes(c.direction) || ![0, 1].includes(c.axis) || typeof c.turn !== 'boolean') fail();
    return { keys: [...c.keys], stop: finite(c.stop, -2, end + 2), exit: finite(c.exit, 0, end), direction: c.direction, axis: c.axis, turn: c.turn };
  };
  const root = object(value);
  const entries = <T>(value: any, parse: (value: any, end: number) => T): [string, T][] => {
    if (!Array.isArray(value) || value.length > actors.size) return fail();
    const seen = new Set<string>();
    return value.map((entry: any) => {
      if (!Array.isArray(entry) || entry.length !== 2 || !actors.has(entry[0]) || seen.has(entry[0])) fail();
      seen.add(entry[0]); return [entry[0], parse(entry[1], actors.get(entry[0])!)] as [string, T];
    });
  };
  return { owners: entries(root.owners, crossing), requests: entries(root.requests, (v, end) => {
    const r = object(v);
    if (typeof r.ready !== 'boolean') fail();
    return { first: finite(r.first, 0, time + 50), seen: finite(r.seen, 0, time + 50), ready: r.ready, crossing: crossing(r.crossing, end) };
  }) };
}
