import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// Vite plugin to handle API routes
function apiPlugin(): Plugin {
  return {
    name: 'api-plugin',
    configureServer(server) {
      // Load environment variables for API handlers
      const env = loadEnv(server.config.mode || 'development', process.cwd(), '');

      // Set environment variables for the API handlers
      process.env.TURSO_DATABASE_URL = env.TURSO_DATABASE_URL || 'libsql://dentalcare-ai-zunxo7.aws-ap-south-1.turso.io';
      process.env.TURSO_AUTH_TOKEN = env.TURSO_AUTH_TOKEN || '';
      process.env.OPENAI_API_KEY = env.OPENAI_API_KEY || '';
      process.env.ADMIN_PASSWORD = env.ADMIN_PASSWORD || '';

      // Check for critical variables
      if (!process.env.TURSO_AUTH_TOKEN) {
        console.warn('⚠️  WARNING: TURSO_AUTH_TOKEN is missing. Database connections will fail.');
      }
      if (!process.env.OPENAI_API_KEY) {
        console.warn('⚠️  WARNING: OPENAI_API_KEY is missing. AI features will fail.');
      }

      server.middlewares.use('/api', async (req, res, next) => {
        try {
          // Handle both cases: req.url might be "/api/chat" or "/chat"
          const urlPath = req.url || '';
          const apiPath = urlPath.startsWith('/api') ? urlPath : `/api${urlPath}`;
          const fullUrl = `http://${req.headers.host}${apiPath}`;
          const url = new URL(fullUrl);
          const pathname = url.pathname;
          console.log('API request:', req.method, pathname, 'req.url:', req.url, 'apiPath:', apiPath);

          // Determine which API handler to use
          let handler;
          if (pathname === '/api/chat' || pathname.startsWith('/api/chat/')) {
            console.log('Routing to chat handler for:', pathname);
            const chatModule = await import('./api/chat.ts');
            handler = chatModule.default;
          } else if (pathname === '/api/suggestions' || pathname.startsWith('/api/suggestions/')) {
            console.log('Routing to suggestions handler for:', pathname);
            const suggestionsModule = await import('./api/suggestions.ts');
            handler = suggestionsModule.default;
          } else {
            console.log('Routing to main API handler for:', pathname);
            const apiModule = await import('./api/[...path].ts');
            handler = apiModule.default;
          }

          if (!handler) {
            console.error('No handler found for path:', pathname, 'req.url:', req.url);
            next();
            return;
          }

          if (handler) {
            // Convert Node request to Fetch API Request
            const body = req.method !== 'GET' && req.method !== 'HEAD'
              ? await new Promise<Buffer>((resolve) => {
                const chunks: Buffer[] = [];
                req.on('data', (chunk) => chunks.push(chunk));
                req.on('end', () => resolve(Buffer.concat(chunks)));
              })
              : null;

            const headers = new Headers();
            Object.entries(req.headers).forEach(([key, value]) => {
              if (value) {
                headers.set(key, Array.isArray(value) ? value.join(', ') : value);
              }
            });

            const request = new Request(fullUrl, {
              method: req.method,
              headers,
              body: body ? body.toString() : null,
            });

            const response = await handler(request);

            // Convert Fetch Response to Node response
            res.statusCode = response.status;
            response.headers.forEach((value, key) => {
              res.setHeader(key, value);
            });

            const responseBody = await response.text();
            res.end(responseBody);
          } else {
            next();
          }
        } catch (error: any) {
          console.error('API Error:', error);
          console.error('Error stack:', error.stack);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            error: error.message || 'Internal server error',
            details: error.stack,
            path: req.url
          }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), apiPlugin()],
    define: {
      'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY),
      'process.env.OPENROUTER_API_KEY': JSON.stringify(env.OPENROUTER_API_KEY || env.VITE_OPENROUTER_API_KEY),
      'process.env.TURSO_DATABASE_URL': JSON.stringify(env.TURSO_DATABASE_URL || 'libsql://dentalcare-ai-zunxo7.aws-ap-south-1.turso.io'),
      'process.env.TURSO_AUTH_TOKEN': JSON.stringify(env.TURSO_AUTH_TOKEN || ''),
      'process.env.ADMIN_PASSWORD': JSON.stringify(env.ADMIN_PASSWORD || ''),
      // Expose to import.meta.env for frontend
      'import.meta.env.ADMIN_PASSWORD': JSON.stringify(env.ADMIN_PASSWORD || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
