#!/bin/sh
# Health check script for Coolify deployment
# Checks if the application is running and responding

set -e

# Check web service
if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
  echo "✅ Web service: healthy"
  exit 0
else
  echo "❌ Web service: unhealthy"
  exit 1
fi
