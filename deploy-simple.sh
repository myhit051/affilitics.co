#!/bin/bash
# Simple Coolify Deployment Script
set -e

COOLIFY_HOST="${COOLIFY_HOST:-72.60.42.157}"
COOLIFY_USER="${COOLIFY_USER:-root}"
BRANCH="${1:-001-i-have-an}"

echo "🚀 Deploying Affilitics.co to Coolify..."
echo "Branch: $BRANCH"
echo ""

# Deploy via SSH
ssh ${COOLIFY_USER}@${COOLIFY_HOST} << DEPLOY_END
set -e

# Backup
if [ -d "/opt/affilitics" ]; then
  echo "📦 Creating backup..."
  cp -r /opt/affilitics /opt/affilitics-backup-\$(date +%Y%m%d-%H%M%S)
  ls -t /opt/affilitics-backup-* | tail -n +6 | xargs rm -rf 2>/dev/null || true
fi

# Clone/Update
echo "📥 Updating code..."
rm -rf /opt/affilitics
git clone -b ${BRANCH} https://github.com/myhit051/affilitics.co.git /opt/affilitics
cd /opt/affilitics

# Setup .env
if [ -f "/tmp/affilitics.env" ]; then
  cp /tmp/affilitics.env .env
  cp /tmp/affilitics.env .env.production
  echo "✅ Environment configured"
else
  echo "❌ No .env file found at /tmp/affilitics.env"
  exit 1
fi

# Build & Deploy
echo "🏗️  Building..."
docker compose build --no-cache

echo "🔄 Deploying..."
docker compose down 2>/dev/null || true
docker compose up -d

# Health check
echo "💓 Health check..."
sleep 15

for i in {1..30}; do
  if curl -sf http://localhost:3000/api/health > /dev/null; then
    echo "✅ Deployment successful!"
    docker compose ps
    exit 0
  fi
  echo "Waiting... (\$i/30)"
  sleep 2
done

echo "❌ Health check failed"
exit 1
DEPLOY_END

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deployment completed!"
echo ""
echo "Test: curl http://${COOLIFY_HOST}:3000/api/health"
echo "Logs: ssh ${COOLIFY_USER}@${COOLIFY_HOST} 'cd /opt/affilitics && docker compose logs -f'"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
