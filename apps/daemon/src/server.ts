import express from 'express';
import helmet from 'helmet';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  isPasswordConfigured,
  validatePassword,
  validateSession,
  touchSession,
  invalidateSession,
  getActiveSessions,
  getSessionByToken,
  getSessionById,
  revokeSessionById,
  getAuthLog,
} from './services/auth.js';
import { audit, flushAudit } from './services/audit.js';

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

  // ── Rate limiting (auth endpoints) ──

  const AUTH_RATE_LIMIT = 10; // max requests per window
  const AUTH_RATE_WINDOW = 60_000; // 1 minute
  const authRateMap = new Map<string, { count: number; windowStart: number }>();

  // Cleanup stale entries every 5 minutes
  const rateCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of authRateMap) {
      if (now - entry.windowStart > AUTH_RATE_WINDOW * 2) authRateMap.delete(ip);
    }
  }, 5 * 60_000);
  rateCleanupInterval.unref();

  function checkAuthRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = authRateMap.get(ip);
    if (!entry || now - entry.windowStart > AUTH_RATE_WINDOW) {
      authRateMap.set(ip, { count: 1, windowStart: now });
      return true;
    }
    entry.count++;
    return entry.count <= AUTH_RATE_LIMIT;
  }

  // ── Brute-force lockout ──

  const LOCKOUT_THRESHOLD = 5;
  const LOCKOUT_DURATION_MS = 15 * 60_000; // 15 minutes
  const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();

  function checkLockout(ip: string): { locked: boolean; retryAfter?: number } {
    const entry = failedAttempts.get(ip);
    if (!entry) return { locked: false };
    if (entry.lockedUntil > Date.now()) {
      return { locked: true, retryAfter: Math.ceil((entry.lockedUntil - Date.now()) / 1000) };
    }
    if (entry.lockedUntil > 0) {
      failedAttempts.delete(ip);
    }
    return { locked: false };
  }

  function recordFailedLogin(ip: string): void {
    const entry = failedAttempts.get(ip) || { count: 0, lockedUntil: 0 };
    entry.count++;
    if (entry.count >= LOCKOUT_THRESHOLD) {
      entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
      entry.count = 0;
    }
    failedAttempts.set(ip, entry);
  }

  function clearFailedAttempts(ip: string): void {
    failedAttempts.delete(ip);
  }

  // ── Public endpoints (no auth required) ──

  // Daemon status
  app.get('/api/ui/status', (_req, res) => {
    res.json({
      status: 'ok',
      mode: 'gateway',
      uptime: process.uptime(),
    });
  });

  // Auth status — check if password is configured
  app.get('/api/auth/status', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ configured: isPasswordConfigured() });
  });

  // Login
  app.post('/api/auth/login', async (req, res) => {
    const ip = req.ip || 'unknown';

    if (!checkAuthRateLimit(ip)) {
      res.status(429).json({ success: false, error: 'Too many requests. Try again later.' });
      return;
    }

    const lockout = checkLockout(ip);
    if (lockout.locked) {
      res.status(429).json({
        success: false,
        error: 'Too many failed attempts. Try again later.',
        retryAfter: lockout.retryAfter,
      });
      return;
    }

    const { password, deviceId } = req.body;
    if (!password) {
      res.status(400).json({ success: false, error: 'Password required' });
      return;
    }

    const result = await validatePassword(password, ip, deviceId || 'unknown');
    if (result.success) {
      clearFailedAttempts(ip);
      audit('auth.login', ip, { sessionId: result.sessionId, deviceId: result.deviceId });
      res.json({ success: true, token: result.token });
    } else {
      audit('auth.login_failure', ip, { deviceId: deviceId || null });
      recordFailedLogin(ip);
      res.status(401).json({ success: false, error: 'Incorrect password' });
    }
  });

  // ── Auth middleware (protects all /api/* below) ──

  app.use('/api', (req, res, next) => {
    if (!isPasswordConfigured()) return next();

    const token = req.headers.authorization?.replace('Bearer ', '') || (req.query.token as string | undefined);
    if (!token || !validateSession(token)) {
      res.status(401).json({ error: 'Unauthorized', needsAuth: true });
      return;
    }

    // Update lastSeen for active session
    touchSession(token);
    next();
  });

  // ── Protected endpoints ──

  // Logout
  app.post('/api/auth/logout', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const session = getSessionByToken(token);
      audit('auth.logout', req.ip || 'unknown', {
        sessionId: session?.id,
        deviceId: session?.deviceId,
      });
      invalidateSession(token);
    }
    res.json({ success: true });
  });

  // List active sessions
  app.get('/api/auth/sessions', (req, res) => {
    const currentToken = req.headers.authorization?.replace('Bearer ', '');
    res.json({ sessions: getActiveSessions(currentToken) });
  });

  // Revoke a session by ID
  app.delete('/api/auth/sessions/:id', (req, res) => {
    const targetSession = getSessionById(req.params.id);
    const revoked = revokeSessionById(req.params.id);
    if (!revoked) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const currentToken = req.headers.authorization?.replace('Bearer ', '');
    const currentSession = currentToken ? getSessionByToken(currentToken) : undefined;
    audit('auth.session_revoked', req.ip || 'unknown', {
      sessionId: currentSession?.id,
      deviceId: currentSession?.deviceId,
      metadata: {
        revokedSessionId: targetSession?.id,
        revokedDeviceId: targetSession?.deviceId,
      },
    });
    res.json({ success: true });
  });

  // Auth event log
  app.get('/api/auth/log', (_req, res) => {
    res.json({ events: getAuthLog() });
  });

  // ── Static files & SPA ──

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
    clearInterval(rateCleanupInterval);
    flushAudit();
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
