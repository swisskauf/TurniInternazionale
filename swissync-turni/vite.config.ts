/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { handleAi } from './server/ai';

/**
 * Serves the same `/api/ai` endpoint that runs on Vercel while developing
 * locally, so `npm run dev` works end-to-end with a key in `.env.local`.
 */
function devAiApi(env: Record<string, string>): Plugin {
  return {
    name: 'swissync-dev-ai-api',
    configureServer(server) {
      server.middlewares.use('/api/ai', async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = Buffer.concat(chunks);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === 'string') headers.set(k, v);
        }
        const request = new Request(`http://localhost${req.url ?? ''}`, {
          method: req.method,
          headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
        });
        const response = await handleAi(request, { ...process.env, ...env });
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      devAiApi(env),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/*.png', 'icons/*.svg', 'privacy.html', 'swissync-app.json'],
        manifest: {
          id: '/',
          name: 'Swissync Turni',
          short_name: 'Turni',
          description: 'Traccia ore lavorative, turni e guadagni dal tuo piano di lavoro.',
          lang: 'it',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#0b0f17',
          theme_color: '#0b0f17',
          categories: ['productivity', 'business', 'utilities'],
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            { name: 'Importa piano', url: '/#/import', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
            { name: 'Ore del mese', url: '/#/hours', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
          globIgnores: ['tesseract/**', 'assets/pdf.worker*'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              // OCR engine + language models: loaded on first scan, then kept offline.
              urlPattern: ({ url }) => url.pathname.includes('/tesseract/') || url.pathname.includes('/assets/pdf.worker'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'ocr-assets',
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 180 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1600,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            charts: ['recharts'],
            pdf: ['jspdf', 'jspdf-autotable'],
          },
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    },
  };
});
