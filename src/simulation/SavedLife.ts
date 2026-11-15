import { EMPTY_LIFE, type LifeSave, type LifeEvent } from './LifeSystem';
import { parseIdentity } from './ResidentIdentity';
import { MAP_SIZE } from './TileMap';

const invalid = (): never => { throw new Error('存檔資料損壞。'); };
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const home = (value: unknown): value is number => value === -1 || (count(value) && value < MAP_SIZE ** 2);
const list = (value: unknown, max: number): unknown[] => Array.isArray(value) && value.length <= max ? value : invalid();
function ids(value: unknown, max: number): number[] {
  const values = list(value, max);
  if (!values.every(count) || new Set(values).size !== values.length) return invalid();
  return [...values];
}
export function parseLife(value: unknown, tick: number): LifeSave | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object') return invalid();
  const data = value as Record<string, unknown>;
  const result = EMPTY_LIFE();
  result.children = list(data.children, MAP_SIZE ** 2 * 4).map(raw => {
    const child = raw as Record<string, unknown>;
    if (!child || !home(child.home)) return invalid();
    const identity = parseIdentity(child.identity);
    if (!identity || identity.born > tick) return invalid();
    return { identity, home: child.home, guardians: ids(child.guardians, 8) };
  });
  result.health = list(data.health, MAP_SIZE ** 2 * 16).map(raw => {
    const item = raw as Record<string, unknown>;
    if (!item || !count(item.id) || !count(item.since) || item.since > tick || !count(item.until) ||
        !['ill', 'recovering'].includes(item.state as string) || typeof item.severe !== 'boolean') return invalid();
    return { id: item.id, since: item.since, until: item.until, state: item.state as 'ill' | 'recovering', severe: item.severe };
  });
  if (new Set(result.health.map(item => item.id)).size !== result.health.length) return invalid();
  result.events = list(data.events, 100).map(raw => {
    const event = raw as Record<string, unknown>;
    if (!event || !count(event.tick) || event.tick > tick || !count(event.person) || typeof event.name !== 'string' ||
        event.name.length > 80 || !home(event.home) ||
        !['birth', 'adult', 'retired', 'ill', 'recovered', 'death', 'care'].includes(event.kind as string)) return invalid();
    return { tick: event.tick, person: event.person, name: event.name, home: event.home, kind: event.kind as LifeEvent['kind'] };
  });
  result.families = ids(data.families, MAP_SIZE ** 2);
  if (!result.families.every(id => home(id))) return invalid();
  result.retired = ids(data.retired, MAP_SIZE ** 2 * 16);
  result.births = list(data.births, MAP_SIZE ** 2).map(raw => {
    const plan = raw as Record<string, unknown>;
    if (!plan || !home(plan.home) || plan.home === -1 || !count(plan.due)) return invalid();
    const parents = ids(plan.parents, 2);
    if (parents.length !== 2) return invalid();
    return { home: plan.home, due: plan.due, parents };
  });
  return result;
}
