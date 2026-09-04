#!/usr/bin/env bash
set -e

# Load user environment variables (e.g. NVM, Node, PM2 paths)
[ -s "$HOME/.nvm/nvm.sh" ] && \. "$HOME/.nvm/nvm.sh"
[ -s "$HOME/.bashrc" ] && source "$HOME/.bashrc" 2>/dev/null || true
[ -s "$HOME/.profile" ] && source "$HOME/.profile" 2>/dev/null || true

echo "=========================================="
echo "Deployment Directory : $(pwd)"
echo "Node Version         : $(node -v 2>/dev/null || echo 'not found')"
echo "NPM Version          : $(npm -v 2>/dev/null || echo 'not found')"
echo "PM2 Version          : $(pm2 -v 2>/dev/null || echo 'not found')"
echo "=========================================="

# Record current commit hash before pull to detect dependency changes
PREV_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "")

echo "===> [1/4] Pulling latest code from origin/main..."
git fetch origin main
git reset --hard origin/main

NEW_COMMIT=$(git rev-parse HEAD)

# Fast NPM flags: skip security audit (saves minutes of network latency) & skip fund & prefer offline cache
NPM_FLAGS="--no-audit --no-fund --prefer-offline --include=dev"

# Check if root dependencies changed or node_modules/tsc is missing
ROOT_DEPS_CHANGED=false
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/tsc" ]; then
  ROOT_DEPS_CHANGED=true
elif [ -n "$PREV_COMMIT" ] && [ "$PREV_COMMIT" != "$NEW_COMMIT" ]; then
  if git diff --name-only "$PREV_COMMIT" "$NEW_COMMIT" | grep -qE '^(package\.json|package-lock\.json)$'; then
    ROOT_DEPS_CHANGED=true
  fi
fi

# Check if frontend dependencies changed or frontend/node_modules/vite is missing
FRONTEND_DEPS_CHANGED=false
if [ ! -d "frontend/node_modules" ] || [ ! -f "frontend/node_modules/.bin/vite" ]; then
  FRONTEND_DEPS_CHANGED=true
elif [ -n "$PREV_COMMIT" ] && [ "$PREV_COMMIT" != "$NEW_COMMIT" ]; then
  if git diff --name-only "$PREV_COMMIT" "$NEW_COMMIT" | grep -qE '^frontend/(package\.json|package-lock\.json)$'; then
    FRONTEND_DEPS_CHANGED=true
  fi
fi

echo "===> [2/4] Checking and installing dependencies..."
if [ "$ROOT_DEPS_CHANGED" = true ]; then
  echo "-> Backend dependencies changed (or missing tsc), installing with speed flags..."
  NODE_ENV=development npm install $NPM_FLAGS
else
  echo "-> Backend dependencies unchanged, skipping npm install (instant ⚡)"
fi

if [ "$FRONTEND_DEPS_CHANGED" = true ]; then
  echo "-> Frontend dependencies changed, installing with speed flags..."
  (cd frontend && NODE_ENV=development npm install $NPM_FLAGS)
else
  echo "-> Frontend dependencies unchanged, skipping npm install (instant ⚡)"
fi

# Fallback check: ensure tsc binary is definitely present before compiling
if [ ! -f "node_modules/.bin/tsc" ]; then
  echo "-> Warning: tsc compiler binary missing, performing fallback installation..."
  NODE_ENV=development npm install $NPM_FLAGS
fi

echo "===> [3/4] Building frontend and backend..."
npm run build

echo "===> [4/4] Reloading PM2 process..."
pm2 reload ecosystem.config.js || pm2 start ecosystem.config.js

echo "===> Process Status:"
pm2 status gemini-proxy

echo "=========================================="
echo "✅ Deployment completed successfully!"
echo "=========================================="
