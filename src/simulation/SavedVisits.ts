import { MAP_SIZE, type Cell } from './TileMap';
import type { ActiveVisit } from './VisitSystem';
import { visitReasons } from './ActivityDiary';

const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const tileId = (value: unknown): value is number => count(value) && value < MAP_SIZE ** 2;
const doing = new Set(['socializing', 'care', 'remembering', 'school', 'highschool', 'university', 'daycare', 'bank', 'shopping', 'clinic',
  'hospital', 'referred', 'exhibition', 'reading', 'park', 'temple', 'cinema', 'pool', 'ktv',
  'amusement', 'casino', 'museum', 'stadium', 'nightmarket', 'delivering', 'takeout', 'bakery', 'flowers', 'cake']);
const invalid = (): never => { throw new Error('存檔資料損壞。'); };
export const isVisitDoing = (value: unknown): boolean => typeof value === 'string' && doing.has(value);
function path(value: unknown): Cell[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > MAP_SIZE ** 2) return invalid();
  return value.map(cell => {
    if (!cell || !count(cell.x) || !count(cell.y) || cell.x >= MAP_SIZE || cell.y >= MAP_SIZE) return invalid();
    return { x: cell.x, y: cell.y };
  });
}
export function parseVisits(value: unknown, tick: number): ActiveVisit[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAP_SIZE ** 2 * 16) return invalid();
  const seen = new Set<string>();
  return value.map(item => {
    if (!item || !tileId(item.home) || !count(item.slot) || !tileId(item.destination) ||
        !doing.has(item.doing) || !Number.isFinite(item.started) || item.started < 0 || item.started > tick ||
        typeof item.arrived !== 'boolean' || typeof item.returning !== 'boolean') return invalid();
    const key = `${item.home}:${item.slot}`;
    if (seen.has(key)) return invalid();
    seen.add(key);
    const transfer = item.transfer === undefined ? undefined : path(item.transfer);
    if (transfer && !tileId(item.transferDestination)) return invalid();
    if (item.reason !== undefined && !Object.hasOwn(visitReasons, item.reason)) return invalid();
    if (item.legs !== undefined && (!count(item.legs) || item.legs < 1 || item.legs > 3)) return invalid();
    if (item.ride !== undefined && (!count(item.ride) || item.ride < 1 || item.ride > 4)) return invalid();
    return { home: item.home, slot: item.slot, destination: item.destination, doing: item.doing,
      started: item.started, arrived: item.arrived, returning: item.returning, path: path(item.path),
      transfer, transferDestination: transfer ? item.transferDestination : undefined,
      ...(item.reason !== undefined ? { reason: item.reason } : {}), ...(item.legs !== undefined ? { legs: item.legs } : {}), ...(item.ride !== undefined ? { ride: item.ride } : {}) };
  });
}

export function parseScares(value: unknown): { id: number; until: number }[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAP_SIZE ** 2 ||
      !value.every(item => item && tileId(item.id) && count(item.until))) return invalid();
  return value.map(({ id, until }) => ({ id, until }));
}
export function parseCooldowns(value: unknown, ids: readonly string[]): [string, number][] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > ids.length || !value.every(item => Array.isArray(item) &&
      item.length === 2 && ids.includes(item[0]) && count(item[1])) ||
      new Set(value.map(item => item[0])).size !== value.length) return invalid();
  return value.map(([id, until]) => [id, until]);
}
