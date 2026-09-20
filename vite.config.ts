import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { VitePWA } from 'vite-plugin-pwa'

type LocalApiHandler = (req: any, res: any) => Promise<void>;

function localApiPlugin(name: string, path: string, loadHandler: () => Promise<LocalApiHandler>, fallbackMessage: string): Plugin {
  return {
    name,
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(path, async (req, res) => {
        if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ message: '不支持的请求方法。' }));
          return;
        }

        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))));
        req.on('end', async () => {
          let body: unknown = undefined;
          try {
            const raw = Buffer.concat(chunks).toString('utf8');
            body = raw ? JSON.parse(raw) : undefined;
          } catch {
            body = undefined;
          }

          const handler = await loadHandler();
          let statusCode = 200;
          const respLike = {
            status(code: number) {
              statusCode = code;
              return respLike;
            },
            setHeader(key: string, value: string) {
              res.setHeader(key, value);
            },
            json(payload: unknown) {
              res.statusCode = statusCode;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify(payload));
            },
          };

          try {
            await handler(
              { method: req.method, headers: req.headers as any, body },
              respLike as any,
            );
          } catch {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ message: fallbackMessage }));
          }
        });
      });
    },
  };
}

const localBillsApiPlugin = () =>
  localApiPlugin('local-bills-api', '/api/bills/parse', async () => (await import('./api/bills/parse')).default, '识别失败，请稍后再试。');

const localAiApiPlugin = () =>
  localApiPlugin('local-ai-api', '/api/ai/chat', async () => (await import('./api/ai/chat')).default, 'AI 服务暂时不可用，请稍后再试。');

const localHealthApiPlugin = () =>
  localApiPlugin('local-health-api', '/api/health-reports/parse', async () => (await import('./api/health-reports/parse')).default, '解析失败，请稍后再试。');

const localAccountApiPlugin = () =>
  localApiPlugin('local-account-api', '/api/account/delete', async () => (await import('./api/account/delete')).default, '请求失败，请稍后再试。');

const localMealsApiPlugin = () =>
  localApiPlugin('local-meals-api', '/api/meals/recommend', async () => (await import('./api/meals/recommend')).default, '请求失败，请稍后再试。');

const localMembersApiPlugin = () =>
  localApiPlugin('local-members-api', '/api/members/create', async () => (await import('./api/members/create')).default, '请求失败，请稍后再试。');

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);
  const pwaDevEnabled = env.VITE_PWA_DEV === 'true';

  return {
    build: {
      sourcemap: 'hidden',
    },
    plugins: [
      react({
        babel: {
          plugins: [
            'react-dev-locator',
          ],
        },
      }),
      localBillsApiPlugin(),
      localAiApiPlugin(),
      localHealthApiPlugin(),
      localAccountApiPlugin(),
      localMealsApiPlugin(),
      localMembersApiPlugin(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'brand-mark.svg'],
        manifest: {
          name: 'Family Inc. OS',
          short_name: 'Family OS',
          description: 'Family Inc. OS',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#0b1220',
          theme_color: '#0b1220',
          icons: [
            {
              src: '/pwa-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/pwa-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: '/pwa-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [
            /^\/assets\//,
            /^\/api\//,
            /\/[^/?]+\.[^/]+$/,
          ],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/css2/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-stylesheets',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/s\//i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: pwaDevEnabled,
        },
      }),
      tsconfigPaths()
    ],
  };
})
