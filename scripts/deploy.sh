#!/usr/bin/env bash
# Manual deploy on the VPS, without GitHub Actions: pulls the repo, builds the
# image locally and restarts the container. Expects the layout from DEPLOY.md:
#   /opt/viet/.env   production config
#   /opt/viet/src    clone of this repository
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/viet}"
IMAGE="viet:local"

cd "$DEPLOY_DIR/src"
git pull --ff-only
docker build -t "$IMAGE" .

cd "$DEPLOY_DIR"
cp src/docker-compose.prod.yml .
sed -i '/^IMAGE=/d' .env
echo "IMAGE=$IMAGE" >> .env
docker compose -f docker-compose.prod.yml up -d --remove-orphans
docker image prune -f

port=$(grep -E '^APP_PORT=' .env | cut -d= -f2)
port=${port:-3010}
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null; then
    echo "Deployed."
    exit 0
  fi
  sleep 1
done
echo "App is not responding:" >&2
docker compose -f docker-compose.prod.yml logs --tail 50 >&2
exit 1
