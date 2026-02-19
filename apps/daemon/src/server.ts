import express from 'express';
import helmet from 'helmet';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.CODECK_DAEMON_PORT || '8080', 10);
// Resolve path to apps/web/dist from apps/daemon/dist/
const WEB_DIST = join(__dirname, '../../web/dist');

export async function startDaemon(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);
  const server = createServer(app);

  // Security headers — same config as runtime
  app.use(helmet({
    contentSecurityPolicy: false,
    strictTransportSecurity: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
  }));

  app.use(express.json());

  // Daemon status endpoint — public, no auth required
  app.get('/api/ui/status', (_req, res) => {
    res.json({
      status: 'ok',
      mode: 'gateway',
      uptime: process.uptime(),
    });
  });

  // Serve static web assets (same caching strategy as runtime)
  app.use(express.static(WEB_DIST, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (filePath.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));

  // SPA catch-all — serve index.html for client-side routing
  app.get('*', (_req, res) => {
    res.sendFile(join(WEB_DIST, 'index.html'));
  });

  // Error handler
  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(`[Daemon] Error: ${req.method} ${req.path}: ${err.message}`);
    const status = (err as Error & { statusCode?: number }).statusCode || 500;
    const message = status >= 500 ? 'Internal server error' : err.message;
    res.status(status).json({ error: message });
  });

  // Graceful shutdown
  function gracefulShutdown(signal: string): void {
    console.log(`[Daemon] Received ${signal}, shutting down...`);
    server.close(() => {
      console.log('[Daemon] Closed cleanly');
      process.exit(0);
    });
    setTimeout(() => {
      console.log('[Daemon] Forcing exit');
      process.exit(1);
    }, 5000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  server.listen(PORT, () => {
    console.log(`\n[Daemon] Codeck gateway running on :${PORT}`);
    console.log(`[Daemon] Serving web from ${WEB_DIST}`);
    console.log('');
  });
}
