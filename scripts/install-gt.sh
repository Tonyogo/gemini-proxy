#!/usr/bin/env bash
#
# Gemini Terminal (gt) CLI One-Line Installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Tonyogo/gemini-proxy/main/scripts/install-gt.sh | bash
#   or from your proxy server:
#   curl -fsSL http://<proxy-ip>:3000/api/terminal/install | bash
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Installing Gemini Terminal CLI (gt) ===${NC}"

# 1. Check Node.js runtime
if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}[Error] Node.js is required to run gt.${NC}" >&2
  echo -e "Please install Node.js (v18+) via https://nodejs.org or your package manager first." >&2
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${YELLOW}[Warning] Node.js version is $(node -v). gt CLI is recommended on Node.js v18+.${NC}"
fi

# 2. Determine target install directory
INSTALL_DIR="/usr/local/bin"
USE_SUDO=0

if [ -w "$INSTALL_DIR" ]; then
  TARGET_DIR="$INSTALL_DIR"
elif [ -n "$SUDO_USER" ] && [ -w "/usr/local/bin" ]; then
  TARGET_DIR="/usr/local/bin"
elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
  TARGET_DIR="/usr/local/bin"
  USE_SUDO=1
else
  # Fallback to user home bin
  TARGET_DIR="$HOME/.local/bin"
  mkdir -p "$TARGET_DIR"

  # Ensure target directory is in PATH
  if [[ ":$PATH:" != *":$TARGET_DIR:"* ]]; then
    SHELL_PROFILE=""
    if [ -n "$ZSH_VERSION" ] || [ -f "$HOME/.zshrc" ]; then
      SHELL_PROFILE="$HOME/.zshrc"
    elif [ -n "$BASH_VERSION" ] || [ -f "$HOME/.bashrc" ]; then
      SHELL_PROFILE="$HOME/.bashrc"
    elif [ -f "$HOME/.profile" ]; then
      SHELL_PROFILE="$HOME/.profile"
    fi

    if [ -n "$SHELL_PROFILE" ]; then
      echo "export PATH=\"\$PATH:$TARGET_DIR\"" >> "$SHELL_PROFILE"
      echo -e "${YELLOW}[Notice] Added $TARGET_DIR to $SHELL_PROFILE. Please run 'source $SHELL_PROFILE' or restart your terminal.${NC}"
    fi
    export PATH="$PATH:$TARGET_DIR"
  fi
fi

TARGET_BIN="$TARGET_DIR/gt"
TEMP_FILE=$(mktemp /tmp/gt.XXXXXX)

# 3. Determine download URL
# Default from GitHub raw; can be overridden by GT_DOWNLOAD_URL environment variable
DEFAULT_URL="https://raw.githubusercontent.com/Tonyogo/gemini-proxy/main/scripts/gt.js"
DOWNLOAD_URL="${GT_DOWNLOAD_URL:-$DEFAULT_URL}"

echo -e "Downloading gt CLI from ${BLUE}$DOWNLOAD_URL${NC}..."

if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$DOWNLOAD_URL" -o "$TEMP_FILE"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$TEMP_FILE" "$DOWNLOAD_URL"
else
  echo -e "${RED}[Error] Neither curl nor wget was found. Please install curl or wget.${NC}" >&2
  rm -f "$TEMP_FILE"
  exit 1
fi

# Ensure downloaded file is valid and contains gt identifier
if ! grep -q "gt (Gemini Terminal)" "$TEMP_FILE"; then
  echo -e "${RED}[Error] Downloaded script verification failed.${NC}" >&2
  rm -f "$TEMP_FILE"
  exit 1
fi

chmod +x "$TEMP_FILE"

# 4. Install binary to target location
if [ "$USE_SUDO" -eq 1 ]; then
  sudo mv "$TEMP_FILE" "$TARGET_BIN"
  sudo chmod +x "$TARGET_BIN"
else
  mv "$TEMP_FILE" "$TARGET_BIN"
  chmod +x "$TARGET_BIN"
fi

echo -e "${GREEN}✓ Successfully installed gt CLI to $TARGET_BIN${NC}"
echo ""

# 5. Output version and quickstart
"$TARGET_BIN" --version || true

echo ""
echo -e "${GREEN}Quickstart:${NC}"
echo "  1. Authenticate with your hub server:"
echo "     gt auth login http://<proxy-ip>:3000 <your-admin-key>"
echo ""
echo "  2. List remote agent nodes:"
echo "     gt host ls"
echo ""
echo "  3. Execute commands remotely:"
echo "     gt exec <host> uptime"
echo ""
