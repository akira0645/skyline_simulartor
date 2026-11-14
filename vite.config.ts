import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths, so the built site works from any folder, such as a GitHub Pages project site.
  base: './',
  plugins: [react()],
  // Several tests run a city for years; side by side on a busy machine they need more than the usual five seconds.
  test: { environment: 'node', testTimeout: 30000 },
});
