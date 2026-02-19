#!/usr/bin/env bash
# Codeck managed mode launcher — used by systemd service.
# Generates a per-boot internal secret shared by daemon and runtime,
# starts the runtime container, then runs the daemon.
set -euo pipefail

CODECK_INTERNAL_SECRET=$(openssl rand -hex 32)
export CODECK_INTERNAL_SECRET

# Start runtime container (compose picks up env vars from the process)
docker compose -f "${CODECK_COMPOSE_FILE:-docker/compose.managed.yml}" up -d --wait

# Run daemon in foreground (systemd manages lifecycle)
exec node apps/daemon/dist/index.js
