# Proactive Agents

Autonomous, scheduled agents that execute tasks periodically using `claude -p` in non-interactive mode.

## Overview

Proactive agents run Claude CLI commands on a cron schedule, persist state to disk, and are manageable from both the API and the web UI's Agents section. They use `child_process.spawn` (not PTY) for clean non-interactive execution with `--output-format stream-json` for real-time streaming output.

## Architecture

```
┌─ Frontend (Preact) ─────────────────────────────┐
│  AgentsSection.tsx                                │
│  ├── Agent list (dash-card grid)                  │
│  ├── Create agent form (modal + DirSelector)      │
│  ├── Edit agent form (modal + DirSelector)        │
│  └── Agent detail (expand/collapse, live stream)  │
└───────────────── API + WS ────────────────────────┘
        │                    ▲
        ▼                    │
┌─ Backend (Express) ─────────────────────────────┐
│  routes/agents.routes.ts    REST CRUD             │
│  services/proactive-agents.ts                     │
│  ├── Agent CRUD + state persistence               │
│  ├── node-cron scheduling                         │
│  ├── child_process.spawn('claude', ['-p', ...])   │
│  ├── Execution queue (max 2 concurrent)           │
│  └── WS broadcast (output, status)                │
└──────────────────────────────────────────────────┘
        │
        ▼
┌─ Filesystem ────────────────────────────────────┐
│  /workspace/.codeck/agents/                       │
│  ├── manifest.json                                │
│  └── {id}/ → config.json, state.json, executions/ │
└──────────────────────────────────────────────────┘
```

## Filesystem Layout

```
/workspace/.codeck/agents/
  manifest.json                     # { version: 1, agents: ["id1", ...] }
  {agent-id}/
    config.json                     # AgentConfig
    state.json                      # AgentState
    executions/
      {ISO-timestamp}.jsonl         # Raw stream-json output (JSONL)
      {ISO-timestamp}.log           # Extracted clean text
      {ISO-timestamp}.result.json   # ExecutionResult
```

## API Reference

All endpoints are under `/api/agents` and require authentication.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/agents` | Create agent |
| `GET` | `/api/agents` | List all agents |
| `GET` | `/api/agents/:id` | Agent detail |
| `PUT` | `/api/agents/:id` | Update agent config |
| `POST` | `/api/agents/:id/pause` | Pause agent (stops cron) |
| `POST` | `/api/agents/:id/resume` | Resume agent (resets failures, restarts cron) |
| `POST` | `/api/agents/:id/execute` | Manual trigger (respects concurrency queue) |
| `DELETE` | `/api/agents/:id` | Delete agent + files |
| `GET` | `/api/agents/:id/logs` | Latest execution log (text/plain) |
| `GET` | `/api/agents/:id/executions` | Execution history (limit=20) |

### Create Agent Body

```json
{
  "name": "Test Runner",
  "objective": "Run the test suite and fix any failures",
  "schedule": "0 * * * *",
  "cwd": "/workspace/my-project",
  "model": "sonnet",
  "timeoutMs": 300000,
  "maxRetries": 3
}
```

`model` is optional. When empty or omitted, the agent uses the system default from `settings.json`. Valid values: `opus`, `sonnet`, `haiku`.

## WebSocket Events

| Event | Direction | Data | Description |
|-------|-----------|------|-------------|
| `agent:update` | Server → Client | `AgentSummary` | Agent state changed |
| `agent:output` | Server → Client | `{ agentId, text }` | Streaming execution output |
| `agent:execution:start` | Server → Client | `{ agentId, executionId }` | Execution started |
| `agent:execution:complete` | Server → Client | `{ agentId, executionId, result }` | Execution finished |

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `timeoutMs` | 300000 (5m) | Max execution time before kill |
| `maxRetries` | 3 | Consecutive failures before auto-pause |
| `MAX_AGENTS` | 10 | Maximum number of agents |
| `MAX_CONCURRENT` | 2 | Maximum simultaneous executions |

## Timezone & DST Handling

All cron schedules execute in **container local time** (UTC in production Docker environment). There is no timezone conversion or DST-aware scheduling.

**Key behaviors:**
- ✅ Schedules are interpreted in UTC (no DST transitions)
- ⚠️ If `TZ` environment variable is set to a local timezone, DST behavior is **undefined** for the custom `computeNextRun()` logic
- ⚠️ Users should always use UTC times when creating schedules

**Example:** To run daily at 9 AM US Eastern (EST/EDT):
- Winter (EST = UTC-5): Use `0 14 * * *` (9 AM + 5 hours)
- Summer (EDT = UTC-4): Update schedule to `0 13 * * *` (9 AM + 4 hours)

**Misfire behavior:**
- If the container is stopped during a scheduled run, the missed execution is **skipped** (not caught up on restart)
- On restart, `nextRunAt` is recomputed from the current time forward
- This is intentional to prevent catch-up storms after long downtimes

**Best practices:**
- Keep container timezone as UTC (default behavior)
- Avoid scheduling between 1-3 AM if you ever plan to use local timezones
- Test schedules around DST transitions (March/November) if using non-UTC timezones

## Agent Lifecycle

1. **Created** → status `active`, cron scheduled
2. **Active** → cron fires, execution queued/started
3. **Paused** → cron stopped, manual trigger still possible
4. **Error** → auto-paused after `maxRetries` consecutive failures
5. **Resumed** → failures reset, cron restarted
6. **Deleted** → cron stopped, files removed

## Output Format

The agent uses `--output-format stream-json` to receive a JSONL stream. Each line is parsed for text content:
- `type: "assistant"` → `message.content[].text`
- `type: "content_block_delta"` → `delta.text`
- `type: "result"` → `result`

Clean text is broadcast via WebSocket `agent:output` events in real-time. Raw JSONL is saved to `.jsonl` files for debugging.

## Error Handling

- Timeout: process killed with SIGTERM, then SIGKILL after 5s
- Consecutive failures tracked; auto-pauses at `maxRetries`
- Already-running agents skip when cron fires again
- Queue processes next agent when a slot frees up

## Persistence

Agents survive container restarts. On init:
1. Read `manifest.json` for agent IDs
2. Load each agent's `config.json` and `state.json`
3. Re-schedule crons for active agents

On shutdown:
1. Stop all crons
2. Kill running executions
3. Save final state
