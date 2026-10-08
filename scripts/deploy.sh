#!/usr/bin/env bash
set -e

# Load user environment variables (e.g. NVM, Node, PM2 paths)
[ -s "$HOME/.nvm/nvm.sh" ] && \. "$HOME/.nvm/nvm.sh"
[ -s "$HOME/.bashrc" ] && source "$HOME/.bashrc" 2>/dev/null || true
[ -s "$HOME/.profile" ] && source "$HOME/.profile" 2>/dev/null || true

# Ensure PM2 is installed and available in PATH
ensure_pm2() {
  if command -v pm2 >/dev/null 2>&1; then
    return 0
  fi

  echo "===> PM2 command not found. Installing PM2..."
  if npm install -g pm2 2>/dev/null; then
    echo "-> PM2 installed globally successfully."
  elif [ "$(id -u)" -eq 0 ]; then
    npm install -g pm2
  elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    local NPM_BIN
    NPM_BIN="$(command -v npm)"
    sudo "$NPM_BIN" install -g pm2 2>/dev/null || sudo npm install -g pm2
  else
    echo "-> Installing PM2 locally as fallback..."
    npm install pm2 --save-dev
  fi

  # Reload shell profiles in case npm global bin path was added
  [ -s "$HOME/.bashrc" ] && source "$HOME/.bashrc" 2>/dev/null || true
  [ -s "$HOME/.profile" ] && source "$HOME/.profile" 2>/dev/null || true

  # Ensure pm2 is in PATH if installed in npm global directory or local node_modules
  if ! command -v pm2 >/dev/null 2>&1; then
    local NPM_GLOBAL_BIN
    NPM_GLOBAL_BIN="$(npm prefix -g 2>/dev/null)/bin"
    if [ -n "$NPM_GLOBAL_BIN" ] && [ -x "$NPM_GLOBAL_BIN/pm2" ]; then
      export PATH="$PATH:$NPM_GLOBAL_BIN"
    elif [ -x "node_modules/.bin/pm2" ]; then
      export PATH="$PATH:$(pwd)/node_modules/.bin"
    fi
  fi
}

# Check and ensure PM2 before printing status
ensure_pm2

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
  echo "-> Backend dependencies changed (or missing tsc), installing with --ignore-scripts..."
  NODE_ENV=development npm install $NPM_FLAGS --ignore-scripts
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
  NODE_ENV=development npm install $NPM_FLAGS --ignore-scripts
fi

echo "===> [3/4] Building frontend and backend..."
npm run build

echo "===> [4/4] Reloading PM2 process..."
ensure_pm2

# Keep gt CLI binary in sync if installed globally
if [ -f "/usr/local/bin/gt" ] && [ -f "scripts/gt.js" ]; then
  cp "scripts/gt.js" "/usr/local/bin/gt" 2>/dev/null && chmod +x "/usr/local/bin/gt" || true
fi

PM2_BIN="pm2"
if ! command -v pm2 >/dev/null 2>&1; then
  if command -v npx >/dev/null 2>&1; then
    PM2_BIN="npx pm2"
  fi
fi

$PM2_BIN reload ecosystem.config.js || $PM2_BIN start ecosystem.config.js

echo "===> Process Status:"
$PM2_BIN status gemini-proxy

echo "=========================================="
echo "✅ Deployment completed successfully!"
echo "=========================================="
