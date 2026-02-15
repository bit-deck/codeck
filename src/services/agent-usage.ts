import { readFileSync, existsSync } from 'fs';
import { ACTIVE_AGENT } from './agent.js';
import { markTokenExpired } from './auth-anthropic.js';
import { broadcastStatus } from '../web/websocket.js';

const CREDENTIALS_PATH = ACTIVE_AGENT.credentialsFile;
const USAGE_API_URL = 'https://api.anthropic.com/api/oauth/usage';
const CACHE_TTL = 60000; // 60 seconds

interface ClaudeUsage {
  available: boolean;
  fiveHour: {
    utilization: number;
    percent: number;
    resetsAt: string | null;
  } | null;
  sevenDay: {
    utilization: number;
    percent: number;
    resetsAt: string | null;
  } | null;
}

let usageCache: { data: ClaudeUsage; fetchedAt: number } | null = null;

function getOAuthToken(): string | null {
  // 1. Check env var
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN?.startsWith('sk-ant-oat01-')) {
    return process.env.CLAUDE_CODE_OAUTH_TOKEN;
  }

  // 2. Check credentials file
  if (existsSync(CREDENTIALS_PATH)) {
    try {
      const creds = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8'));
      const token = creds.claudeAiOauth?.accessToken;
      if (token && token.startsWith('sk-ant-oat01-')) {
        return token;
      }
    } catch { /* ignore */ }
  }

  return null;
}

export async function getClaudeUsage(): Promise<ClaudeUsage> {
  // Return cached data if fresh
  if (usageCache && (Date.now() - usageCache.fetchedAt) < CACHE_TTL) {
    return usageCache.data;
  }

  const token = getOAuthToken();
  if (!token) {
    return { available: false, fiveHour: null, sevenDay: null };
  }

  try {
    const res = await fetch(USAGE_API_URL, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      console.log(`[ClaudeUsage] API returned ${res.status}`);
      if (res.status === 401) {
        markTokenExpired();
        broadcastStatus();
      }
      return { available: false, fiveHour: null, sevenDay: null };
    }

    const data = await res.json();

    const usage: ClaudeUsage = {
      available: true,
      fiveHour: data.five_hour ? {
        utilization: data.five_hour.utilization || 0,
        percent: Math.round(data.five_hour.utilization || 0),
        resetsAt: data.five_hour.resets_at || null,
      } : null,
      sevenDay: data.seven_day ? {
        utilization: data.seven_day.utilization || 0,
        percent: Math.round(data.seven_day.utilization || 0),
        resetsAt: data.seven_day.resets_at || null,
      } : null,
    };

    usageCache = { data: usage, fetchedAt: Date.now() };
    return usage;
  } catch (err) {
    console.log('[ClaudeUsage] Error fetching usage:', (err as Error).message);
    return { available: false, fiveHour: null, sevenDay: null };
  }
}
