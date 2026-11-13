import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths, so the built site works from any folder, such as a GitHub Pages project site.
  base: './',
  plugins: [react()],
  test: { environment: 'node' },
});
