# Codeck

**Freedom for the agent. Claude Sandbox.**

Codeck is a dedicated environment for Claude Code — persistent workspace, memory across sessions, full tool access, accessible from any browser.

Give the agent its own machine. Let it live there.

---

## The idea

Claude Code is powerful, but it's stateless by default — every session starts from zero. Codeck changes that:

- **Persistent workspace** — projects, files, and memory survive restarts
- **Memory system** — FTS5-indexed notes, per-project context, daily journals, durable facts the agent accumulates over time
- **Always-on** — deploy to a VPS and the agent is there whenever you need it
- **Full autonomy** — terminal access, git, GitHub, Docker, internet — no hand-holding

You open a browser, the agent is ready. You close it, the agent keeps working.

---

## Deploy

### On a VPS (recommended)

The agent gets its own machine. The simplest path to a persistent, always-on sandbox.

```bash
curl -fsSL https://raw.githubusercontent.com/cyphercr0w/codeck/main/scripts/dev-setup.sh | sudo bash
```

Opens on `http://<your-ip>`. After that:

```bash
systemctl status codeck          # check service
journalctl -u codeck -f          # follow logs
```

### With Docker (local)

```bash
docker build -t codeck-base -f Dockerfile.base .   # once
docker compose up
# → http://localhost
```

### CLI (Docker lifecycle)

```bash
cd cli && npm install && npm run build && npm link

codeck init      # guided setup
codeck start     # start container
codeck open      # open in browser
codeck status    # URLs + config
codeck logs      # stream logs
```

---

## Features

**For the agent**
- Up to 5 concurrent PTY terminals (node-pty + xterm.js)
- Persistent memory: FTS5 search, per-project MEMORY.md, daily journals, global durable context
- Proactive agents — schedule recurring tasks (cron-style)
- Full environment: git, GitHub CLI, Docker, internet access

**For you**
- Browser UI — works from phones, tablets, anywhere
- Claude OAuth PKCE — automatic token refresh, no manual re-auth
- Local password auth — scrypt-hashed, 7-day sessions
- File browser with editor
- GitHub integration — SSH keys + CLI device flow
- Dashboard — CPU, memory, disk, session count, API usage
- LAN access — `codeck.local` from any device via mDNS
- Workspace export as `.tar.gz`
- Preset system — manifest-driven workspace configuration

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Codeck  (Docker container or systemd VPS service)   │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  Express + WebSocket                           │  │
│  │  ├── REST API (/api/*)                         │  │
│  │  ├── WebSocket (terminal I/O + live updates)   │  │
│  │  └── Static frontend (Vite build)              │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Claude   │  │ node-pty │  │ Memory            │  │
│  │ Code CLI │  │ sessions │  │ (SQLite FTS5)     │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
│                                                      │
│  /workspace/   /workspace/.codeck/   ~/.claude/      │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  Browser  (Preact + xterm.js)                        │
│  ├── Home     — dashboard, account, usage            │
│  ├── Claude   — PTY terminals (up to 5)              │
│  ├── Agents   — proactive / scheduled tasks          │
│  ├── Files    — browser + editor                     │
│  ├── Memory   — .codeck/ viewer and editor           │
│  ├── Integrations — GitHub SSH + CLI auth            │
│  └── Settings — password, sessions, auth log         │
└──────────────────────────────────────────────────────┘
```

---

## LAN access

```bash
codeck lan start                  # via CLI

# or manually:
docker compose -f docker-compose.yml -f docker-compose.lan.yml up
node scripts/mdns-advertiser.cjs  # (requires admin)
```

Broadcasts `codeck.local` and `{port}.codeck.local` via mDNS — reachable from any device on the network.

## Docker socket (experimental)

```bash
docker compose -f docker-compose.yml -f docker-compose.experimental.yml up
```

Mounts `/var/run/docker.sock` for Docker-in-Docker and dynamic port mapping. Removes container isolation — only for trusted personal use.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Preact 10, @preact/signals, xterm.js 5.5, Vite 5.4 |
| Backend | Node.js 22+, Express 4.18, ws 8.16 |
| Terminal | node-pty 1.0 + xterm.js |
| Memory | SQLite FTS5, session summarizer, CLAUDE.md injection |
| Networking | multicast-dns 7.2 |
| Runtime | Docker or systemd (VPS) |
| CLI tools | Claude Code, GitHub CLI, git, openssh |
| Codeck CLI | Commander, @clack/prompts, execa, conf |

## Security

- OAuth tokens at `0600`, password hashed with scrypt + random salt
- Rate limiting: 10/min on auth routes, 200/min general, 7-day session TTL
- Docker: `cap_drop ALL`, `no-new-privileges`, `pids_limit 512`
- Log sanitization: Anthropic and GitHub tokens scrubbed automatically

---

## Documentation

[`docs/`](docs/README.md) — full technical reference:

| Doc | Covers |
|-----|--------|
| [Architecture](docs/ARCHITECTURE.md) | System design, auth flows, security model |
| [API](docs/API.md) | REST endpoints and WebSocket protocol |
| [Services](docs/SERVICES.md) | Backend service layer internals |
| [Frontend](docs/FRONTEND.md) | Preact SPA, components, signals, CSS |
| [Configuration](docs/CONFIGURATION.md) | Env vars, Docker, volumes, presets |
| [Deployment](docs/DEPLOYMENT.md) | systemd install, VPS setup, troubleshooting |
| [Known Issues](docs/KNOWN-ISSUES.md) | Bugs, tech debt, planned improvements |
