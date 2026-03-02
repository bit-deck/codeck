#!/usr/bin/env node

import { startDaemon } from './server.js';

startDaemon().catch((err: Error) => {
  console.error('[Daemon] Fatal:', err.message);
  process.exit(1);
});
