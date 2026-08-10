import { defineConfig } from 'vite';

export default defineConfig({
  base: './',            // relative paths, so the build works inside a Capacitor WebView
  build: { outDir: 'dist', assetsDir: 'assets', target: 'es2020' },
  server: { host: true, port: 5173 },
});
