#!/usr/bin/env bash
# ============================================================================
# UniPlanner — Deploy script
# Deploys the full stack (Caddy + Frontend + Backend + DB + Redis) with HTTPS.
# ============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Pre-flight checks ───────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1   || error "Docker is not installed."
command -v docker compose >/dev/null 2>&1 || error "Docker Compose v2 is not installed."

if [ ! -f .env ]; then
  if [ -f .env.production ]; then
    warn ".env not found — copying from .env.production"
    cp .env.production .env
    warn "Please edit .env with your actual values, then re-run this script."
    exit 1
  else
    error ".env file not found. Copy .env.production to .env and fill in your values."
  fi
fi

# ── Source .env for validation ───────────────────────────────────────────────
source .env

if [ -z "${DOMAIN:-}" ] || [ "$DOMAIN" = "uniplanner.example.com" ]; then
  warn "DOMAIN is not set or is still the placeholder value."
  warn "Set DOMAIN in .env to your actual domain (e.g., uniplanner.yourdomain.com)"
  warn "Continuing with localhost (no HTTPS)..."
fi

if [ "${JWT_ACCESS_SECRET:-}" = "change_this_access_secret_min_32_chars" ]; then
  error "JWT_ACCESS_SECRET is still the default value. Change it in .env!"
fi

if [ "${JWT_REFRESH_SECRET:-}" = "change_this_refresh_secret_min_32_chars" ]; then
  error "JWT_REFRESH_SECRET is still the default value. Change it in .env!"
fi

if [ "${REDIS_PASSWORD:-}" = "change_this_redis_password_min_16_chars" ] || [ -z "${REDIS_PASSWORD:-}" ]; then
  error "REDIS_PASSWORD is missing or still the default value. Change it in .env!"
fi

# ── Deploy ───────────────────────────────────────────────────────────────────
info "Building and starting UniPlanner..."
docker compose -f docker-compose.prod.yml up -d --build

info "Waiting for services to be healthy..."
sleep 5

# Check health
if docker compose -f docker-compose.prod.yml ps | grep -q "unhealthy"; then
  warn "Some services are unhealthy. Check logs with:"
  warn "  docker compose -f docker-compose.prod.yml logs"
else
  info "All services are running!"
fi

echo ""
info "============================================"
info "  UniPlanner deployed successfully!"
info "============================================"
if [ -n "${DOMAIN:-}" ] && [ "$DOMAIN" != "localhost" ]; then
  info "  URL: https://${DOMAIN}"
else
  info "  URL: http://localhost"
fi
echo ""
info "  Install as app on your devices:"
info "    Phone:    Open the URL in Chrome/Safari > 'Add to Home Screen'"
info "    Computer: Open the URL in Chrome/Edge > Install icon in address bar"
echo ""
info "  Useful commands:"
info "    Logs:     docker compose -f docker-compose.prod.yml logs -f"
info "    Stop:     docker compose -f docker-compose.prod.yml down"
info "    Update:   git pull && ./deploy.sh"
info "============================================"
