#!/usr/bin/env bash
set -euo pipefail

# Codeck Installation Script
# Installs Codeck as a systemd service on Linux VPS

CODECK_VERSION="${CODECK_VERSION:-latest}"
CODECK_DIR="/opt/codeck"
CODECK_USER="codeck"
NODE_MAJOR=22

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()   { echo -e "${GREEN}[+]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

# ─── Part 1: Pre-flight checks ──────────────────────────────────────

# 1. OS detection — Linux only
if [[ "$(uname -s)" != "Linux" ]]; then
  error "Codeck systemd deployment only supports Linux. Detected: $(uname -s)"
fi
log "OS: Linux ($(uname -r))"

# 2. Root check
if [[ "$EUID" -ne 0 ]]; then
  error "This script must be run as root. Use: sudo bash install.sh"
fi
log "Running as root"

# 3. Systemd check
if ! command -v systemctl &>/dev/null; then
  error "systemd is required but not found. This script requires a systemd-based Linux distribution."
fi
log "systemd detected"

# 4. Distro detection (for package manager)
if command -v apt-get &>/dev/null; then
  PKG_MANAGER="apt"
elif command -v dnf &>/dev/null; then
  PKG_MANAGER="dnf"
elif command -v yum &>/dev/null; then
  PKG_MANAGER="yum"
else
  error "No supported package manager found (apt, dnf, yum)"
fi
log "Package manager: $PKG_MANAGER"

# ─── Part 1: Dependency installation ────────────────────────────────

# 5. Install Node.js 22+
install_nodejs() {
  if command -v node &>/dev/null; then
    local current_version
    current_version=$(node -v | sed 's/v//' | cut -d. -f1)
    if [[ "$current_version" -ge "$NODE_MAJOR" ]]; then
      log "Node.js $(node -v) already installed (>= $NODE_MAJOR)"
      return
    fi
    warn "Node.js $(node -v) found but < $NODE_MAJOR, upgrading..."
  fi

  log "Installing Node.js $NODE_MAJOR..."
  case "$PKG_MANAGER" in
    apt)
      curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
      apt-get install -y nodejs
      ;;
    dnf|yum)
      curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
      $PKG_MANAGER install -y nodejs
      ;;
  esac
  log "Node.js $(node -v) installed"
}

# 6. Install Docker
install_docker() {
  if command -v docker &>/dev/null; then
    log "Docker already installed: $(docker --version)"
    return
  fi

  log "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  log "Docker installed: $(docker --version)"
}

install_nodejs
install_docker

# Part 2 follows below (user creation, Codeck download, service setup)
