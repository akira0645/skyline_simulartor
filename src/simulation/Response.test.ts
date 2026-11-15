import { expect, it } from 'vitest';
import { demoCity } from '../app/demoCity';
import { services } from './Services';
import { SimulationEngine } from './SimulationEngine';

it('gets help to a call in time on clear roads, and too late behind a jam', () => {
  const engine = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  demoCity(engine, 'small');
  const { city } = engine;
  const station = { x: 6, y: 9 };
  const home = { x: 3, y: 4 };
  // Before anyone is up the roads are all but empty: the engine loses no time to speak of.
  const clear = city.responseMinutes(station, home, 3)!;
  expect(clear.held).toBeLessThan(0.1);
  expect(clear.minutes).toBeGreaterThan(0);
  // Every road at twice what it carries: the same way now costs far more than a fire allows.
  city.congestionAt = () => 2;
  const jammed = city.responseMinutes(station, home, 3)!;
  expect(jammed.minutes).toBeGreaterThan(3 * clear.minutes);
  expect(jammed.held).toBeGreaterThan(services.response.fire);
  // And so the calls of the coming months that a station answers all come too late.
  engine.advance(8 * 120);
  const calls = city.getEvents().filter(event => event.station && /^(fire|crime|sick)/.test(event.kind));
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.some(event => event.kind.endsWith('-late'))).toBe(true);
});
