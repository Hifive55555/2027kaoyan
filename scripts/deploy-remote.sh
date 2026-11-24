#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:-root@121.40.95.125}"
DEST="${DEPLOY_DEST:-/srv/yantu/app}"
TAR="/tmp/yantu-app-$(date +%Y%m%d-%H%M%S).tgz"

cd "$ROOT"

# Build on the workstation. The small 2C/1.7G server was OOM-killed when it
# ran `next build` itself, which left node_modules half-installed and made
# the service return 502. Only upload the finished .next artifact now.
echo "→ build locally"
NEXT_TELEMETRY_DISABLED=1 npm run build

echo "→ package source + .next"
tar \
  --exclude=node_modules \
  --exclude=.next/cache \
  --exclude=.next/dev \
  --exclude=data/raw \
  --exclude='data/app.db*' \
  --exclude=data/uploads \
  --exclude=data/learner \
  --exclude=.env.local \
  --exclude=AGENTS.md \
  --exclude=tsconfig.tsbuildinfo \
  -czf "$TAR" .

echo "→ upload $TAR"
scp -q "$TAR" "$HOST:/tmp/yantu-app.tgz"

echo "→ install runtime deps & restart on $HOST"
ssh "$HOST" "set -e
  systemctl stop yantu
  cd $DEST
  rm -rf .next
  tar xzf /tmp/yantu-app.tgz
  chown -R yantu:yantu $DEST
  chown root:yantu /srv/yantu
  chmod 750 /srv/yantu
  chmod 750 $DEST
  chmod 700 $DEST/data
  chmod 600 $DEST/data/app.db* 2>/dev/null || true
  chmod 700 $DEST/data/uploads
  su -s /bin/bash yantu -c 'export PATH=/usr/local/bin:\$PATH; export HOME=/srv/yantu; cd $DEST; npm ci --omit=dev --no-audit --no-fund'
  systemctl restart yantu
  sleep 2
  systemctl is-active yantu
  curl -s http://127.0.0.1:3000/api/health
  echo"

echo "✓ deployed"
