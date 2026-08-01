import { defineConfig } from 'vite';
import { resolve } from 'path';

// Single configurable backend origin for the `/api` proxy, shared by both the
// dev server and `vite preview`. The `/api` prefix is a same-origin routing
// marker only; it is stripped before forwarding so the backend receives ROOT
// paths (`/api/auth/login` -> `/auth/login`).
const apiOrigin = process.env.API_ORIGIN || 'http://localhost:8080';

const proxy = {
  '/api': {
    target: apiOrigin,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
};

export default defineConfig({
  build: {
    outDir: 'dist',
    // The application uses top-level await (async bootstrap in src/main.ts and
    // dynamic `import()` preloads), which requires an ES2022+ / modern-browser
    // target. The Vite/esbuild default (es2020 / chrome87 …) rejects top-level
    // await, so pin a modern baseline that supports it.
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy,
  },
  preview: {
    port: 3000,
    host: true,
    proxy,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    environmentOptions: {
      jsdom: {
        url: 'http://localhost:3000',
      },
    },
  },
});