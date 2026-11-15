import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const longSimulations = ['Prices', 'People', 'Jobs', 'LandValue', 'Seasons', 'Services', 'Trade', 'RushHour', 'Viaduct', 'CityBalance']
  .map(name => `src/simulation/${name}.test.ts`);

export default defineConfig(({ mode }) => ({
  // Relative paths, so the built site works from any folder, such as a GitHub Pages project site.
  base: './',
  plugins: [react()],
  // Long city runs have their own serial group; ordinary regressions retain the shorter deadline.
  test: { environment: 'node', testTimeout: mode === 'simulation' ? 60000 : 30000,
    maxWorkers: mode === 'fast' ? 2 : 1,
    include: mode === 'simulation' ? longSimulations : ['src/**/*.test.ts'],
    exclude: mode === 'fast' ? longSimulations : [],
  },
}));
