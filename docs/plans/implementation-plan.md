# Implementation Plan — 4 Critical Features

## Overview

This document details the impact analysis, implementation strategy, and execution order for 4 features requested for Codeck.

---

## Execution Order (Recommended)

1. **Feature 1: Remove network_mode=host** — Low risk, mostly config changes, unblocks consistent cross-platform behavior
2. **Feature 2: Experimental socket mount** — Low-medium risk, adds new compose file + detection + UI warning
3. **Feature 4: OAuth token auto-refresh** — Medium risk, builds on existing `auth-anthropic.ts` refresh logic, mostly backend
4. **Feature 3: Systemd deployment** — Medium risk, new scripts + environment detection, independent of Docker flow

**Rationale:** Feature 1 simplifies the network model and has no code risk. Feature 2 is isolated (new compose file + small backend/frontend additions). Feature 4 extends existing token refresh infrastructure. Feature 3 is the most standalone and can be done last without blocking anything.

---

## Feature 1: Remove network_mode=host and Unify Port Mapping

### Impact Analysis

**Files affected:**
| File | Change Type | Risk |
|------|------------|------|
| `docker-compose.yml` | Remove docker.sock mount line | LOW |
| `docker-compose.lan.yml` | Remove `network_mode: host`, keep port mapping | MEDIUM |
| `src/services/port-manager.ts` | Remove `host` mode from NetworkMode type and all conditionals | LOW |
| `docs/ARCHITECTURE.md` | Remove Host Mode section, update Network Isolation Model | LOW |
| `docs/CONFIGURATION.md` | Remove CODECK_NETWORK_MODE=host references | LOW |
| `README.md` | Update LAN access section (same on all OS now) | LOW |
| `CLAUDE.md` (project) | Update dev commands if needed | LOW |

**Behavioral changes:**
- `docker-compose.lan.yml` will no longer use `network_mode: host` — it will add mDNS-specific config only (env var to enable mDNS, maybe `network_mode: bridge` explicitly)
- `CODECK_NETWORK_MODE` env var: keep as `bridge` always (or remove entirely)
- `isPortExposed()` in `port-manager.ts`: remove `if (networkMode === 'host') return true` branch
- mDNS still works inside container (it binds to 0.0.0.0:5353) — but won't reach LAN unless port 5353 is mapped or `--net=host` is used. **NOTE: mDNS requires multicast, which doesn't work in bridge mode.** The LAN compose file should instead document using the host-side mDNS advertiser script on ALL platforms.

**Risk assessment:** LOW. The main behavioral change is that Linux LAN access now works the same as Windows/macOS (host-side mDNS script required). The container-internal mDNS responder still works for `codeck.local` resolution within the container.

### Implementation Strategy

1. Remove `network_mode: host` and `ports: !reset []` from `docker-compose.lan.yml`
2. Convert `docker-compose.lan.yml` to just set `CODECK_NETWORK_MODE=bridge` (or remove it if unnecessary) and document mDNS advertiser
3. Remove docker.sock mount from `docker-compose.yml` (moved to Feature 2's experimental file)
4. Remove `'host'` from `NetworkMode` type in `port-manager.ts`
5. Remove `networkMode === 'host'` conditionals
6. Update all documentation

---

## Feature 2: Experimental Socket Mount with Warnings

### Impact Analysis

**Files affected:**
| File | Change Type | Risk |
|------|------------|------|
| `docker-compose.yml` | Remove `/var/run/docker.sock` volume mount | LOW |
| `docker-compose.experimental.yml` | NEW file with socket mount only | LOW |
| `src/services/environment.ts` | NEW file (or add to existing) with `detectDockerSocketMount()` | LOW |
| `src/web/server.ts` | Include `dockerExperimental` in status endpoint | LOW |
| `src/web/websocket.ts` | Include `dockerExperimental` in status broadcast | LOW |
| `src/web/src/state/store.ts` | Add `dockerExperimental` signal | LOW |
| `src/web/src/components/HomeSection.tsx` | Add experimental mode warning banner | LOW |
| `docs/CONFIGURATION.md` | Add Docker Socket Access section | LOW |
| `README.md` | Add experimental mode documentation | LOW |

**Behavioral changes:**
- Default `docker compose up` no longer mounts the Docker socket → `docker ps` inside container will fail → port-manager's `writePortOverride()` and `spawnComposeRestart()` will fail (they use `docker` CLI)
- This means **dynamic port exposure won't work** in default mode. Users must manually add ports to `docker-compose.override.yml` or use the experimental mode.
- The `detectComposeInfo()` function in `port-manager.ts` will fail silently (already handles errors gracefully)

**Risk assessment:** MEDIUM. Removing the socket breaks the dynamic port mapping feature for non-experimental users. The existing code already handles Docker CLI failures gracefully (try/catch in `detectComposeInfo`, error throw in `writePortOverride` caught by the route handler). The UI will show ports as "not exposed" and the add-port API will return an error.

### Implementation Strategy

1. Remove docker.sock mount from `docker-compose.yml`
2. Create `docker-compose.experimental.yml` with just the socket mount
3. Create `detectDockerSocketMount()` function (check `fs.existsSync('/var/run/docker.sock')`)
4. Add to status endpoint response
5. Add to WebSocket initial status broadcast
6. Add frontend signal + warning component in HomeSection
7. Update documentation

---

## Feature 3: Systemd Deployment Preparation

### Impact Analysis

**Files affected:**
| File | Change Type | Risk |
|------|------------|------|
| `scripts/install.sh` | NEW — Installation script for VPS | MEDIUM |
| `scripts/codeck.service` | NEW — systemd unit file | LOW |
| `src/services/environment.ts` | Add `detectDeploymentMode()` and `getDefaultConfig()` | LOW |
| `src/web/server.ts` | Log deployment mode at startup, use `getDefaultConfig()` | LOW |
| `docs/DEPLOYMENT.md` | NEW — Full deployment guide | LOW |
| `README.md` | Add Production Deployment section | LOW |

**Behavioral changes:**
- New `detectDeploymentMode()` function returns `'systemd' | 'docker' | 'cli-local'`
- Server startup will log the detected mode
- Default workspace/port config will adapt based on deployment mode
- No changes to existing Docker deployment flow

**Risk assessment:** LOW-MEDIUM. All changes are additive. The environment detection is used only for logging and defaults — existing explicit env vars always take precedence. The install script is standalone and doesn't affect the existing codebase.

### Implementation Strategy

1. Create `scripts/codeck.service` systemd unit file
2. Create `scripts/install.sh` with OS detection, dependency installation, user creation
3. Add `detectDeploymentMode()` and `getDefaultConfig()` to `environment.ts`
4. Integrate in `server.ts` startup
5. Create `docs/DEPLOYMENT.md`
6. Update README.md

---

## Feature 4: OAuth Token Auto-Refresh Monitor

### Impact Analysis

**Files affected:**
| File | Change Type | Risk |
|------|------------|------|
| `src/services/auth-anthropic.ts` | Add `startTokenRefreshMonitor()`, `stopTokenRefreshMonitor()`, enhance `refreshAccessToken()` | MEDIUM |
| `src/web/server.ts` | Call `startTokenRefreshMonitor()` post-listen, `stopTokenRefreshMonitor()` in shutdown | LOW |
| `src/web/websocket.ts` | Broadcast token refresh/error events | LOW |

**Behavioral changes:**
- A background interval (every 5 minutes) checks token expiry
- If token expires within 30 minutes, proactive refresh is triggered
- On successful refresh: `.credentials.json` updated, auth cache invalidated, `token_refreshed` broadcast
- On failure after 3 retries: `token_error` broadcast
- Graceful shutdown stops the monitor

**Existing infrastructure:**
- `performTokenRefresh()` already exists and works correctly
- `scheduleProactiveRefresh()` exists but only runs on auth check (reactive, not proactive)
- `readCredentials()` and `saveOAuthToken()` handle encryption/decryption
- `invalidateAuthCache()` exists
- `broadcast()` is available from `logger.ts`

**Risk assessment:** MEDIUM. The core refresh logic already exists. The new code adds a polling interval that calls existing functions. Main risk is race conditions between the monitor's refresh and the existing `scheduleProactiveRefresh()` — mitigated by the existing `refreshInProgress` flag.

### Implementation Strategy

1. Add constants: `TOKEN_CHECK_INTERVAL`, `REFRESH_MARGIN` (30 min vs existing 5 min), `MAX_REFRESH_RETRIES`
2. Implement `startTokenRefreshMonitor()` with interval timer
3. Enhance refresh to track retries and broadcast events
4. Implement `stopTokenRefreshMonitor()` for graceful shutdown
5. Wire up in `server.ts` (post-listen and shutdown)

---

## Cross-Feature Dependencies

```
Feature 1 (remove host mode) ──→ Feature 2 (experimental socket)
    └── docker.sock removal from docker-compose.yml is shared
         Feature 1 removes it, Feature 2 creates the experimental file

Feature 3 (systemd) ──→ Feature 2 (environment.ts)
    └── Both add to environment.ts (or create it)
         Feature 2 adds detectDockerSocketMount()
         Feature 3 adds detectDeploymentMode()

Feature 4 (token refresh) ──→ Independent
    └── No dependencies on other features
```

**Conclusion:** Features 1 and 2 share the docker.sock removal and should be done in sequence. Features 2 and 3 both touch environment detection and can share a file. Feature 4 is fully independent.
