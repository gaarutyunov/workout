/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' (relative) is REQUIRED, and is what makes one bundle work at every
// path the app is served from: the custom domain root (workout.garutyunov.com,
// see public/CNAME) and every PR-preview subpath (/pr-preview/pr-<n>/).
//
// It used to be '/workout/' — the project-site path — which broke the app the
// moment the custom domain moved it to the root: every asset URL still pointed
// at /workout/assets/… and 404'd. A relative base has no such assumption to get
// wrong, so there is no VITE_BASE for a workflow to set incorrectly. Relative
// URLs resolve against the directory index.html was loaded from, which with
// HashRouter is always the app's own directory (routes live after the `#`).
const base = process.env.VITE_BASE ?? './';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
