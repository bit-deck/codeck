# Codeck Refactor Plan — Monorepo + Daemon/Runtime (Gateway Mode)

> **COMPLETADO** — Todos los milestones (0-7) están implementados. Este documento es histórico.
> La terminología fue actualizada post-refactor: `local` → `isolated`, `gateway` → `managed`.
> La fuente de verdad actual es `docs/ARCHITECTURE.md`.

---

# MODOS SOPORTADOS (terminología histórica — ver ARCHITECTURE.md para nombres actuales)

## local → ahora llamado "isolated"
- Todo corre en un contenedor.
- Runtime sirve la webapp.
- Browser → runtime directamente.

## gateway → ahora llamado "managed"
- nginx → daemon:8080
- daemon → runtime (docker network privada)
- runtime NO está expuesto.
- browser nunca habla con runtime.

---

# DECISIONES CERRADAS

- Modo público se llama: `gateway`
- daemon puerto: 8080
- runtime internal HTTP: 7777
- runtime internal WS: 7778
- docker network: codeck_net
- runtime container name: codeck-runtime
- frontend SIEMPRE usa rutas relativas `/api`
- NO docker services (postgres etc)
- NO host.exec
- Rate limit en daemon
- Sesiones múltiples por dispositivo
- Auditoría por eventos

---

# ESTRUCTURA MONOREPO TARGET

apps/
  web/
  daemon/
  runtime/
  cli/

container/
docs/
scripts/

---

# CURRENT NEXT BLOCK

- [x] MILESTONE 0 — PREPARACIÓN (completado)
- [x] MILESTONE 1 — WEBAPP (completado)
- [x] MILESTONE 2 — RUNTIME (completado)
- [x] MILESTONE 3 — DAEMON (completado)
- [x] MILESTONE 4 — NETWORKING (completado)
- [x] MILESTONE 5 — CLI (completado)
- [x] MILESTONE 6 — CONSOLIDATION (completado)
- [x] MILESTONE 7 — E2E SMOKE TEST (completado)

---

# MILESTONE 0 — PREPARACIÓN

- [x] Crear rama refactor/daemon-runtime-gateway
- [x] Crear estructura monorepo (apps/, packages/)
- [x] Agregar turbo.json
- [x] Configurar workspaces
- [x] Crear packages/shared
- [x] Crear packages/protocols
- [x] Crear REFRACTOR_LOG.md

DONE cuando:
- El repo compila como monorepo vacío.

---

# MILESTONE 1 — WEBAPP

- [x] Mover SPA a apps/web
- [x] Configurar build output apps/web/dist
- [x] Eliminar hardcodes de host
- [x] Usar API_BASE=/api relativo

DONE cuando:
- Web build funciona aislado.

---

# MILESTONE 2 — RUNTIME

## 2.1 Server base
- [x] Crear apps/runtime
- [x] Implementar /internal/status
- [x] Servir web en modo local

## 2.2 PTY
- [x] Migrar node-pty
- [x] WS /internal/pty/:id
- [x] Limitar sesiones concurrentes

## 2.3 Filesystem
- [x] read/write/list/delete/rename

## 2.4 Proactive Agents
- [x] CRUD
- [x] Scheduler
- [x] Eventos create/update/delete/run

## 2.5 Memory/Index
- [x] Migrar implementación existente

DONE cuando:
- local mode funciona igual que el sistema actual.

---

# MILESTONE 3 — DAEMON

## 3.1 Server base
- [x] apps/daemon en :8080
- [x] Servir web estática
- [x] /api/ui/status

## 3.2 Auth + sesiones
- [x] login/logout
- [x] listar sesiones
- [x] revoke session
- [x] deviceId estable
- [x] lastSeen update

## 3.3 Auditoría
- [x] audit.log JSONL
- [x] eventos auth

## 3.4 Rate limit
- [x] auth agresivo
- [x] writes moderado
- [x] configurable por env

## 3.5 Proxy HTTP
- [x] /api/runtime/* → runtime internal

## 3.6 Proxy WS
- [x] Browser WS → daemon → runtime
- [x] límite conexiones
- [x] heartbeat

DONE cuando:
- gateway mode funciona con runtime privado.

---

# MILESTONE 4 — NETWORKING

- [x] Crear docker network codeck_net
- [x] runtime container name codeck-runtime
- [x] runtime puertos 7777/7778 internos
- [x] daemon conecta por nombre contenedor

DONE cuando:
- nginx → daemon → runtime funciona.

---

# MILESTONE 5 — CLI

- [x] codeck init
- [x] codeck start --mode local
- [x] codeck start --mode gateway
- [x] stop/status/logs

DONE cuando:
- Ambos modos arrancan desde CLI.

---

# MILESTONE 6 — CONSOLIDATION

## 6.1 Eliminar packages vacíos
- [x] `git rm -r packages/shared packages/protocols`
- [x] Root `package.json`: workspaces `["apps/*"]` (sin packages/)
- [x] Root `tsconfig.json`: exclude `["apps"]` (sin packages)
- [x] `npm install` para regenerar lockfile

## 6.2 Migrar CLI a apps/cli/
- [x] Eliminar placeholder `apps/cli/package.json`
- [x] `git mv` de cli/src, cli/tsconfig.json, cli/package.json a apps/cli/
- [x] Rename a `@codeck/cli`, agregar `private: true`
- [x] Root: `build:cli` → `npm run build -w @codeck/cli`
- [x] `.gitignore`: eliminar cli/dist y cli/node_modules
- [x] Eliminar directorio cli/ residual

## 6.3 Arreglar build scripts
- [x] `build` incluye `&& npm run build:cli`
- [x] `clean` incluye `apps/daemon/dist apps/cli/dist`

DONE cuando:
- `npm run clean && npm run build` compila las 4 apps.
- `cli/` ya no existe en raíz.

---

# MILESTONE 7 — E2E SMOKE TEST

- [x] 7.1: Build completo — 4 outputs verificados
- [x] 7.2: Runtime local mode — /internal/status, /api/auth/status, SPA 200
- [x] 7.3: Daemon + proxy HTTP — daemon-owned routes, HTTP proxy 401 passthrough
- [x] 7.4: WS proxy — runtime WS direct OK, daemon rejects unauth (expected)
- [x] 7.5: docker-compose.gateway.yml — syntax valid, config verified

DONE cuando:
- Todos los smoke tests pasan. Fixes documentados.

---

# EVENTOS DE AUDITORÍA

Registrar:

auth.login
auth.logout
auth.session_revoked
pty.open
pty.close
files.write
files.delete
files.rename
proactive.create
proactive.update
proactive.delete
proactive.run_start
proactive.run_end
runtime.restart

Cada evento debe incluir:
timestamp
sessionId
deviceId
actor
metadata
