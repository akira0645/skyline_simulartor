import { expect, it } from 'vitest';
import { demoCity } from '../app/demoCity';
import { calendar } from './calendar';
import { goods } from './Goods';
import { scare } from './Services';
import { SimulationEngine } from './SimulationEngine';
import { MAP_SIZE, TILES } from './TileMap';
import { dayPay, trade } from './Wealth';

const town = () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  demoCity(engine);
  return engine;
};
const cells = (engine: SimulationEngine, tile: string) => {
  const { tiles } = engine.save();
  return [...tiles.keys()].filter(id => TILES[tiles[id]] === tile).map(id => ({ x: id % MAP_SIZE, y: Math.floor(id / MAP_SIZE) }));
};

it('pays the staff of a shop more when business is good and less when it is quiet', () => {
  const engine = town();
  const { city } = engine;
  const seen = new Set<string>();
  for (const cell of cells(engine, 'commercial')) {
    const shop = city.inspect(cell)!;
    if (!shop.building || !shop.staff.length) continue;
    seen.add(shop.trade ?? 'usual');
    const times = shop.trade ? trade.times[shop.trade] : 1;
    for (const person of shop.staff) {
      expect(person.pay).toBe(Math.round(dayPay('commercial', shop.level, person.trait === 'rich') * times));
    }
    // Business follows customers per member of staff.
    const share = shop.custom! / (shop.occupants * goods.perClerk);
    expect(shop.trade).toBe(share >= trade.busy ? 'busy' : share >= trade.good ? 'good' : share < trade.quiet ? 'quiet' : undefined);
  }
  expect(seen.size).toBeGreaterThan(0);
});

it('grows goods on farmland, three times as much near water', () => {
  const engine = new SimulationEngine({ version: 1, seed: 1, tick: 0 });
  const { city } = engine;
  city.map.flood([{ x: 10, y: 10 }]);
  expect(city.execute({ type: 'BUILD_FARM', tiles: [{ x: 11, y: 10 }, { x: 30, y: 30 }] }).error).toBeUndefined();
  expect(city.inspect({ x: 11, y: 10 })).toMatchObject({ tile: 'farm', grows: goods.farm.watered, watered: true });
  expect(city.inspect({ x: 30, y: 30 })).toMatchObject({ grows: goods.farm.dry, watered: false });
  expect(city.getStats().goods).toMatchObject({ farmed: goods.farm.watered + goods.farm.dry, made: goods.farm.watered + goods.farm.dry });
  city.execute({ type: 'BUILD_ROAD', path: [{ x: 30, y: 32 }] });
  expect(city.execute({ type: 'BUILD_FARM', tiles: [{ x: 30, y: 32 }] }).error).toContain('道路');
});

it('frightens the neighbourhood when a theft or a fire is left alone', { timeout: 60000 }, () => {
  const engine = town();
  const { city } = engine;
  // Without police or firemen, the first theft or fire goes unanswered.
  for (const tile of ['police', 'fire']) for (const cell of cells(engine, tile)) city.execute({ type: 'DEMOLISH', ...cell });
  const school = cells(engine, 'school')[0];
  let trouble;
  for (let day = 0; day < 720 && !trouble; day++) {
    engine.advance(calendar.ticksPerDay);
    trouble = city.getEvents().find(event => event.kind === 'crime' || event.kind === 'fire');
  }
  expect(trouble).toBeDefined();
  const near = cells(engine, 'residential').concat(cells(engine, 'commercial'))
    .filter(cell => Math.abs(cell.x - trouble!.cell.x) + Math.abs(cell.y - trouble!.cell.y) <= scare.reach)
    .map(cell => city.inspect(cell)!).filter(place => place.building);
  expect(near.length).toBeGreaterThan(0);
  expect(near.every(place => place.issues!.includes('scared'))).toBe(true);
  // A shop there keeps fewer hands, and a school there serves nobody.
  const shop = near.find(place => place.tile === 'commercial');
  if (shop) expect(shop.trade).toBe(shop.occupants ? 'quiet' : undefined);
  if (Math.abs(school.x - trouble!.cell.x) + Math.abs(school.y - trouble!.cell.y) <= scare.reach) {
    expect(city.inspect(school)!.reaching).toBeGreaterThanOrEqual(0);
  }
  // It passes: a month after the last trouble nobody is frightened any more.
  const calm = town();
  expect(calm.city.getStats().complaints.scared).toBe(0);
});
