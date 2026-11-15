import { expect, it } from 'vitest';
import { weatherAt, weatherTravel, wantsOutdoor } from './Weather';

it('keeps forecasts stable for a day and discourages optional outdoor activities in rain', () => {
  const rainy = Array.from({ length: 200 }, (_, day) => day * 8).find(tick => weatherAt(42, tick) === 'heavy-rain')!;
  expect(rainy).toBeDefined();
  expect(weatherAt(42, rainy + 3)).toBe('heavy-rain');
  const outgoing = Array.from({ length: 100 }, (_, home) => wantsOutdoor(42, home, 0, rainy)).filter(Boolean).length;
  expect(outgoing).toBeLessThan(20);
});
it('uses only available transport and explains rainy alternatives', () => {
  expect(weatherTravel('rain', 0, 8).way).toBe('walk');
  expect(weatherTravel('clear', 0, 8).way).toBe('bike');
  expect(weatherTravel('rain', 0, 20).way).toBe('bike');
  expect(weatherTravel('rain', 0, 20, 'bus').way).toBe('bus');
  expect(weatherTravel('heavy-rain', 2, 20).way).toBe('drive');
  expect(weatherTravel('rain', 1, 20).reason).toContain('沒有');
});
