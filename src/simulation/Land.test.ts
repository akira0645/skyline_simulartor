import { expect, it } from 'vitest';
import { ALL_LAND, land, parcelAt, parseLand } from './Land';
import { milestones } from './Economy';
import { SimulationEngine } from './SimulationEngine';

function fresh() {
  const engine = new SimulationEngine({ version: 1, seed: 7, tick: 0 });
  engine.city.startExpansion();
  return engine;
}

it('starts with the central parcel and buys only shared-edge neighbours at increasing prices', () => {
  const { city } = fresh();
  expect(city.getLand().filter(plot => plot.owned).map(plot => plot.id)).toEqual([land.start]);
  expect(city.owns({ x: 32, y: 32 })).toBe(true);
  expect(city.owns({ x: 64, y: 32 })).toBe(false);
  const funds = city.getStats().funds;
  for (const id of [-1, NaN, 1.5, 16, 0, land.start]) {
    expect(city.buyLand(id).error).toBeTruthy();
    expect(city.getStats().funds).toBe(funds);
  }
  expect(city.buyLand(6)).toEqual({ cost: 2000 });
  expect(city.getStats().funds).toBe(funds - 2000);
  expect(city.getLand().find(plot => plot.id === 7)).toMatchObject({ available: true, price: 2400 });
  expect(city.buyLand(6).cost).toBe(0);
  expect(city.owns({ x: 64, y: 32 })).toBe(true);
  expect(city.owns({ x: 128, y: 32 })).toBe(false);
});

it('rejects a cross-border road, zoning or multi-cell building without partial changes or charges', () => {
  const engine = fresh();
  engine.load({ ...engine.save(), rank: milestones.length });
  const { city } = engine;
  const funds = city.getStats().funds;
  expect(city.execute({ type: 'BUILD_ROAD', path: [{ x: 63, y: 32 }, { x: 64, y: 32 }] }).error).toBeTruthy();
  expect(city.map.get({ x: 63, y: 32 })).toBe('grass');
  expect(city.execute({ type: 'SET_ZONE', zone: 'residential', tiles: [{ x: 63, y: 33 }, { x: 64, y: 33 }] }).error).toBeTruthy();
  expect(city.map.get({ x: 63, y: 33 })).toBe('grass');
  expect(city.execute({ type: 'BUILD_FACILITY', facility: 'water', x: 64, y: 33 }).error).toBeTruthy();
  expect(city.execute({ type: 'BUILD_SERVICE', service: 'community', x: 63, y: 34 }).error).toContain('還沒買下來');
  expect(city.map.get({ x: 63, y: 34 })).toBe('grass');
  expect(city.getStats().funds).toBe(funds);
  city.buyLand(6);
  expect(city.execute({ type: 'BUILD_ROAD', path: [{ x: 63, y: 32 }, { x: 64, y: 32 }] }).error).toBeUndefined();
});

it('saves purchases, leaves the current city untouched on invalid load, and preserves old maps', () => {
  const engine = fresh();
  engine.city.buyLand(6);
  const saved = engine.save();
  const restored = fresh();
  restored.load(structuredClone(saved));
  expect(restored.save().ownedLand).toEqual([5, 6]);
  expect(restored.city.getStats().funds).toBe(engine.city.getStats().funds);
  expect(() => restored.load({ ...saved, ownedLand: [5, 5] })).toThrow();
  expect(restored.save()).toEqual(saved);
  for (const bad of [[], [16], [1.1], ['5'], Array(1), null]) expect(() => parseLand(bad)).toThrow();
  restored.load({ ...saved, schemaVersion: 6, ownedLand: undefined });
  expect(restored.save().ownedLand).toEqual(ALL_LAND);
  expect(parcelAt({ x: -1, y: 32 })).toBeUndefined();
});

it('does not grant land when funds are insufficient', () => {
  const engine = fresh();
  engine.load({ ...engine.save(), funds: 1999 });
  expect(engine.city.buyLand(6)).toMatchObject({ cost: 0 });
  expect(engine.city.getLand().find(plot => plot.id === 6)?.owned).toBe(false);
  expect(engine.city.getStats().funds).toBe(1999);
});
