import { freight, freightFleetSize, type FreightRoute, type FreightSite } from './Freight';
import { MAP_SIZE } from './TileMap';
import { advancePathVehicle, roadPathKey, roadVehiclePose, type RoadVehicle } from './RoadVehicle';

const MONTH = 240000, DAY = 8000, PACE = 400;
export const freightRuntimeKey = (route: FreightRoute) => route.lineId === undefined ? `auto:${route.from}:${route.to}` : `manual:${route.lineId}`;
export interface ShippingRoute extends FreightRoute { key: string; stops: { to: number; index: number }[] }
export interface FreightMetrics {
  key: string; loaded: number; delivered: number; departures: number; completed: number;
  distance: number; emptyDistance: number; delayMs: number; cost: number; cancelled: number;
}
export interface ShipmentVehicle extends RoadVehicle {
  key: string; route: ShippingRoute; cargo: { to: number; amount: number }[];
  nextStop: number; nextDeparture: number; activity: 'moving' | 'turning' | 'queued' | 'red' | 'slow' | 'working';
}
export interface FreightRuntimeSave {
  time: number; pending?: number; directNext?: [string, number][]; stocks: [number, number][]; vehicles: ShipmentVehicle[];
  current: FreightMetrics[]; previous: FreightMetrics[];
}
const freshMetrics = (key: string): FreightMetrics => ({ key, loaded: 0, delivered: 0, departures: 0, completed: 0,
  distance: 0, emptyDistance: 0, delayMs: 0, cost: 0, cancelled: 0 });
const cloneVehicle = (v: ShipmentVehicle): ShipmentVehicle => ({ ...v, cargo: v.cargo.map(c => ({ ...c })),
  route: { ...v.route, path: v.route.path.map(cell => ({ ...cell })), stops: v.route.stops.map(stop => ({ ...stop })),
    deliveries: v.route.deliveries?.map(delivery => ({ ...delivery })) } });
export type FreightTraffic = (route: ShippingRoute, along: number, vehicle: RoadVehicle, time: number) => number | { load: number; red: boolean };
const cargoOf = (vehicle: ShipmentVehicle) => vehicle.cargo.reduce((sum, item) => sum + item.amount, 0);

/** Authoritative local stock and shipments. Independent of renderer, visibility and frame rate. */
export class FreightRuntime {
  private time = 0;
  private pending = 0;
  private stocks = new Map<number, number>();
  private vehicles: ShipmentVehicle[] = [];
  private current = new Map<string, FreightMetrics>();
  private previous: FreightMetrics[] = [];
  private routes: ShippingRoute[] = [];
  private directRoutes: ShippingRoute[] = [];
  private directNext = new Map<string, number>();
  private sources: readonly FreightSite[] = [];
  private shops: readonly FreightSite[] = [];
  private shopAmounts = new Map<number, number>();
  private reserved = new Map<number, number>();

  sync(routes: ShippingRoute[], sources: readonly FreightSite[], shops: readonly FreightSite[]): void {
    this.routes = routes.filter(route => route.path.length > 1 || route.lineId !== undefined); this.directRoutes = routes.filter(route => route.path.length === 1 && route.lineId === undefined);
    for (const key of this.directNext.keys()) if (!this.directRoutes.some(route => route.key === key)) this.directNext.delete(key);
    this.sources = sources; this.shops = shops;
    this.shopAmounts = new Map(shops.map(shop => [shop.id, shop.amount]));
    const valid = new Set([...sources, ...shops].map(site => site.id));
    for (const id of this.stocks.keys()) if (!valid.has(id)) this.stocks.delete(id);
    const expected = new Map<string, ShippingRoute | undefined>();
    if (routes.some(route => route.lineId !== undefined)) {
      for (const route of routes) for (let slot = 0; slot < (route.vehicles ?? 0); slot++) expected.set(`freight:manual:${route.lineId}:${slot}`, route);
    } else for (let slot = 0; slot < freightFleetSize(routes); slot++) expected.set(`freight:auto:${slot}`, undefined);
    this.vehicles = this.vehicles.filter(vehicle => {
      const route = routes.find(route => route.key === vehicle.route.key);
      const assigned = expected.get(vehicle.key);
      const keep = expected.has(vehicle.key) && route && (!assigned || route.key === assigned.key) &&
        roadPathKey(route.path) === roadPathKey(vehicle.route.path) && JSON.stringify(route.stops) === JSON.stringify(vehicle.route.stops);
      if (keep) vehicle.route = route!;
      else {
        const cargo = cargoOf(vehicle);
        if (sources.some(source => source.id === vehicle.route.from)) this.stocks.set(vehicle.route.from, this.stock(vehicle.route.from) + cargo);
        if (cargo > 0) this.metric(vehicle.route.key).cancelled += cargo;
      }
      return !!keep;
    });
    for (const [key, assigned] of expected) if (!this.vehicles.some(vehicle => vehicle.key === key)) {
      const route = assigned ?? this.routes[0];
      if (route) this.vehicles.push({ key, route, along: 0, returning: false, held: 0, wait: 0,
        cargo: [], nextStop: 0, nextDeparture: this.time, activity: 'working' });
    }
    this.rebuildReservations();
  }

  private rebuildReservations(): void {
    this.reserved.clear();
    for (const vehicle of this.vehicles) for (const cargo of vehicle.cargo) this.reserved.set(cargo.to, (this.reserved.get(cargo.to) ?? 0) + cargo.amount);
  }

  get elapsedMs(): number { return this.time + this.pending; }
  stock(id: number): number { return this.stocks.get(id) ?? 0; }
  frames(): readonly ShipmentVehicle[] { return this.vehicles; }
  private metric(key: string): FreightMetrics {
    let value = this.current.get(key);
    if (!value) { value = freshMetrics(key); this.current.set(key, value); }
    return value;
  }
  advance(elapsed: number, loadAt: FreightTraffic): void {
    if (!Number.isFinite(elapsed) || elapsed <= 0) return;
    this.pending += elapsed;
    while (this.pending >= 50) {
      const dt = Math.min(50, MONTH - ((this.time + 2000) % MONTH));
      for (const source of this.sources) this.stocks.set(source.id, Math.min(Math.max(source.amount, this.stock(source.id)), this.stock(source.id) + source.amount * dt / MONTH));
      for (const shop of this.shops) this.stocks.set(shop.id, Math.max(0, this.stock(shop.id) - shop.amount * dt / MONTH));
      for (const route of this.directRoutes) {
        if (this.time < (this.directNext.get(route.key) ?? 0)) continue;
        const to = route.stops[0].to;
        const amount = Math.min(freight.load, this.stock(route.from), this.wanted(to));
        if (amount < 0.05) continue;
        this.stocks.set(route.from, this.stock(route.from) - amount);
        this.stocks.set(to, this.stock(to) + amount);
        const metric = this.metric(route.key);
        metric.loaded += amount; metric.delivered += amount; metric.departures++; metric.completed++;
        this.directNext.set(route.key, this.time + DAY);
      }
      for (const vehicle of this.vehicles) this.step(vehicle, dt, loadAt);
      this.time += dt; this.pending -= dt;
      if ((this.time + 2000) % MONTH === 0) { this.previous = [...this.current.values()].map(value => ({ ...value })); this.current.clear(); }
    }
  }
  private step(vehicle: ShipmentVehicle, dt: number, loadAt: FreightTraffic): void {
    if (vehicle.activity === 'working' && !vehicle.cargo.length && vehicle.along === 0 && !vehicle.wait) {
      if (this.time < vehicle.nextDeparture) return;
      if (this.vehicles.some(other => other !== vehicle && other.route.from === vehicle.route.from && other.activity !== 'working' && other.along < 0.8 && !other.returning)) return;
      const auto = vehicle.key.startsWith('freight:auto:');
      const offset = auto && vehicle.nextDeparture > 0 ? (this.routes.findIndex(route => route.key === vehicle.route.key) + 1) % Math.max(1, this.routes.length) : 0;
      const choices = auto ? this.routes : [vehicle.route];
      let route: ShippingRoute | undefined;
      for (let at = 0; at < choices.length; at++) {
        const candidate = choices[(offset + at) % choices.length];
        if (this.stock(candidate.from) >= 0.05 && candidate.stops.some(stop => this.wanted(stop.to) > 0.05)) { route = candidate; break; }
      }
      if (!route) { vehicle.nextDeparture = this.time + 1000; return; }
      vehicle.route = route;
      let available = Math.min(freight.load, this.stock(route.from));
      const cargo: ShipmentVehicle['cargo'] = [];
      for (const stop of route.stops) {
        const amount = Math.min(available, this.wanted(stop.to));
        if (amount > 0.000001) { cargo.push({ to: stop.to, amount }); available -= amount; }
      }
      const loaded = cargo.reduce((sum, item) => sum + item.amount, 0);
      if (loaded < 0.05) return;
      this.stocks.set(route.from, this.stock(route.from) - loaded);
      vehicle.cargo = cargo;
      for (const item of cargo) this.reserved.set(item.to, (this.reserved.get(item.to) ?? 0) + item.amount);
      vehicle.nextStop = 0; vehicle.activity = 'moving';
      vehicle.nextDeparture = this.time + DAY;
      this.metric(route.key).loaded += loaded; this.metric(route.key).departures++;
    }
    const metric = this.metric(vehicle.route.key);
    const before = vehicle.along;
    const traffic = loadAt(vehicle.route, before, vehicle, this.time);
    const load = Math.max(0, typeof traffic === 'number' ? traffic : traffic.load);
    const red = typeof traffic === 'number' ? false : traffic.red;
    const pose = roadVehiclePose(vehicle.route.path, vehicle);
    const blocked = this.vehicles.some(other => {
      if (other === vehicle || other.activity === 'working') return false;
      const at = roadVehiclePose(other.route.path, other);
      const dx = at.x - pose.x, dy = at.y - pose.y;
      const ahead = dx * pose.hx + dy * pose.hy;
      return ahead > 0.02 && ahead < 0.8 && Math.abs(dx * pose.hy - dy * pose.hx) < 0.3 && at.hx * pose.hx + at.hy * pose.hy > 0.5;
    });
    let done = advancePathVehicle(vehicle, vehicle.route.path, dt, PACE, load, blocked, red, 2600);
    const distance = Math.abs(vehicle.along - before);
    metric.distance += distance;
    if (cargoOf(vehicle) < 0.000001) metric.emptyDistance += distance;
    const delayed = load > 0 ? dt * (1 - 1 / (1 + 0.15 * load ** 4)) : 0;
    if (!vehicle.wait) metric.delayMs += vehicle.held > 0 ? dt : delayed;
    metric.cost += distance * 0.05 + dt / DAY * 2;
    vehicle.activity = vehicle.wait ? 'turning' : vehicle.held > 0 ? red ? 'red' : 'queued' : load >= 1 ? 'slow' : 'moving';
    if (!vehicle.returning || vehicle.turnFrom === false) {
      while (vehicle.nextStop < vehicle.route.stops.length && vehicle.route.stops[vehicle.nextStop].index <= vehicle.along + 1e-6) {
        const stop = vehicle.route.stops[vehicle.nextStop++];
        const cargo = vehicle.cargo.find(item => item.to === stop.to);
        if (cargo) { this.stocks.set(stop.to, this.stock(stop.to) + cargo.amount); metric.delivered += cargo.amount; this.reserved.set(cargo.to, Math.max(0, (this.reserved.get(cargo.to) ?? 0) - cargo.amount)); cargo.amount = 0; }
      }
    }
    if (vehicle.route.path.length === 1) done = 'home';
    if (done) {
      // A route edited or a receiver removed never creates a delivery: undelivered cargo goes home.
      const leftover = cargoOf(vehicle);
      if (leftover) this.stocks.set(vehicle.route.from, this.stock(vehicle.route.from) + leftover);
      for (const item of vehicle.cargo) this.reserved.set(item.to, Math.max(0, (this.reserved.get(item.to) ?? 0) - item.amount));
      vehicle.cargo = []; vehicle.activity = 'working'; metric.completed++;
    }
  }
  private wanted(id: number): number {
    return Math.max(0, (this.shopAmounts.get(id) ?? 0) / 10 - this.stock(id) - (this.reserved.get(id) ?? 0));
  }
  report() {
    return { factories: this.sources.map(site => ({ ...site, stock: this.stock(site.id) })),
      shops: this.shops.map(site => ({ ...site, stock: this.stock(site.id), target: site.amount / 10,
        incoming: this.vehicles.reduce((sum, vehicle) => sum + vehicle.cargo.filter(cargo => cargo.to === site.id).reduce((n, cargo) => n + cargo.amount, 0), 0) })),
      current: [...this.current.values()].map(value => ({ ...value })), previous: this.previous.map(value => ({ ...value })),
      inTransit: this.vehicles.reduce((sum, vehicle) => sum + cargoOf(vehicle), 0) };
  }
  save(): FreightRuntimeSave { return { time: this.time, pending: this.pending, directNext: [...this.directNext], stocks: [...this.stocks], vehicles: this.vehicles.map(cloneVehicle), current: [...this.current.values()].map(m => ({ ...m })), previous: this.previous.map(m => ({ ...m })) }; }
  load(save: FreightRuntimeSave | undefined, tick: number): void {
    this.time = save?.time ?? tick * 1000; this.pending = save?.pending ?? 0; this.directNext = new Map(save?.directNext ?? []); this.stocks = new Map(save?.stocks ?? []);
    this.vehicles = (save?.vehicles ?? []).map(cloneVehicle); this.current = new Map((save?.current ?? []).map(value => [value.key, { ...value }]));
    this.previous = (save?.previous ?? []).map(m => ({ ...m }));
    this.rebuildReservations();
  }
}

/** Validate before loading replaces any city state; never trust nested vehicle manifests. */
export function parseFreightRuntime(value: unknown): FreightRuntimeSave | undefined {
  if (value === undefined) return undefined;
  const fail = (): never => { throw new Error('存檔物流資料損壞。'); };
  const object = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : fail();
  const number = (v: unknown, max = 1e12): number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : fail();
  const integer = (v: unknown, max: number): number => Number.isInteger(number(v, max)) ? v as number : fail();
  const id = (v: unknown) => integer(v, MAP_SIZE ** 2 - 1);
  const array = (v: unknown, max: number): any[] => Array.isArray(v) && v.length <= max ? Array.from(v) : fail();
  const key = (v: unknown): string => typeof v === 'string' && /^(manual:\d{1,9}|auto:\d{1,5}:\d{1,5})$/.test(v) ? v : fail();
  const unique = <T>(values: T[], identity: (v: T) => unknown): T[] => new Set(values.map(identity)).size === values.length ? values : fail();
  const metrics = (v: unknown): FreightMetrics[] => unique(array(v, MAP_SIZE ** 2).map(entry => {
    const m = object(entry); const result = freshMetrics(key(m.key));
    for (const field of ['loaded', 'delivered', 'departures', 'completed', 'distance', 'emptyDistance', 'delayMs', 'cost', 'cancelled'] as const) result[field] = number(m[field]);
    if (result.emptyDistance > result.distance + 1e-6) fail();
    return result;
  }), entry => entry.key);
  const s = object(value);
  const stocks: [number, number][] = unique(array(s.stocks, MAP_SIZE ** 2).map(entry => {
    if (!Array.isArray(entry) || entry.length !== 2) fail();
    return [id(entry[0]), number(entry[1])] as [number, number];
  }), entry => entry[0]);
  const vehicles: ShipmentVehicle[] = unique(array(s.vehicles, freight.maxVehicles).map(entry => {
    const v = object(entry), r = object(v.route);
    const path = array(r.path, MAP_SIZE ** 2 * 16).map(entry => { const c = object(entry); return { x: integer(c.x, MAP_SIZE - 1), y: integer(c.y, MAP_SIZE - 1) }; });
    if (!path.length || path.some((cell, at) => at > 0 && Math.abs(cell.x - path[at - 1].x) + Math.abs(cell.y - path[at - 1].y) !== 1)) fail();
    const route: ShippingRoute = { key: key(r.key), from: id(r.from), to: id(r.to), goods: number(r.goods), trucks: number(r.trucks), minutes: number(r.minutes), path,
      lineId: r.lineId === undefined ? undefined : integer(r.lineId, 999999999), vehicles: r.vehicles === undefined ? undefined : integer(r.vehicles, 8),
      stops: unique(array(r.stops, 15).map(entry => { const stop = object(entry); return { to: id(stop.to), index: integer(stop.index, path.length - 1) }; }), stop => stop.to) };
    if (route.key !== freightRuntimeKey(route) || !route.stops.length || route.stops.some((stop, at) => at > 0 && stop.index < route.stops[at - 1].index)) fail();
    if (typeof v.key !== 'string' || !/^freight:(auto:[0-7]|manual:\d{1,9}:[0-7])$/.test(v.key) || typeof v.returning !== 'boolean' || !['moving', 'turning', 'queued', 'red', 'slow', 'working'].includes(v.activity)) fail();
    const cargo = unique(array(v.cargo, 15).map(entry => { const c = object(entry); return { to: id(c.to), amount: number(c.amount, freight.load) }; }), c => c.to);
    if (cargo.reduce((sum, c) => sum + c.amount, 0) > freight.load + 1e-6 || cargo.some(c => !route.stops.some(stop => stop.to === c.to))) fail();
    if (v.turnFrom !== undefined && typeof v.turnFrom !== 'boolean') fail();
    return { key: v.key, route, cargo, nextStop: integer(v.nextStop, route.stops.length), nextDeparture: number(v.nextDeparture),
      activity: v.activity, along: number(v.along, path.length - 1), returning: v.returning, held: number(v.held), wait: number(v.wait, 650),
      turnFrom: v.turnFrom, turnNode: v.turnNode === undefined ? undefined : integer(v.turnNode, path.length - 1) };
  }), vehicle => vehicle.key);
  const pending = number(s.pending ?? 0, 50);
  if (pending >= 50) fail();
  const directNext: [string, number][] = unique(array(s.directNext ?? [], MAP_SIZE ** 2).map(entry => {
    if (!Array.isArray(entry) || entry.length !== 2) fail();
    return [key(entry[0]), number(entry[1])] as [string, number];
  }), entry => entry[0]);
  return { time: number(s.time), pending, directNext, stocks, vehicles, current: metrics(s.current), previous: metrics(s.previous) };
}
