#!/usr/bin/env bash
# Nova Language & NVM Standalone Installer for macOS and Linux
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/<USER>/<REPO>/main/install.sh | bash
# or run locally:
#   bash install.sh

set -e

echo "=============================================="
echo "   Nova Language & Virtual Machine Installer  "
echo "=============================================="
echo ""

INSTALL_DIR="$HOME/.nova"
BIN_DIR="$INSTALL_DIR/bin"

echo "Installing Nova to: $INSTALL_DIR"

# 1. Clean or create install dir
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"
LOCAL_ZIP="$SCRIPT_DIR/dist/nova-sdk.zip"

if [ -n "$LOCAL_ZIP" ] && [ -f "$LOCAL_ZIP" ]; then
    echo "Extracting local package: $LOCAL_ZIP"
    unzip -q -o "$LOCAL_ZIP" -d "$INSTALL_DIR"
else
    ZIP_URL="${NOVA_REPO_URL:-https://github.com/ritesh/nova/releases/latest/download/nova-sdk.zip}"
    echo "Downloading Nova SDK from: $ZIP_URL"
    TEMP_ZIP="/tmp/nova-sdk.zip"
    curl -fsSL "$ZIP_URL" -o "$TEMP_ZIP"
    unzip -q -o "$TEMP_ZIP" -d "$INSTALL_DIR"
    rm -f "$TEMP_ZIP"
fi

chmod +x "$BIN_DIR/nova" "$BIN_DIR/novac"

# 2. Add to shell profile
PROFILE_FILE=""
if [ -f "$HOME/.zshrc" ]; then
    PROFILE_FILE="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    PROFILE_FILE="$HOME/.bashrc"
elif [ -f "$HOME/.bash_profile" ]; then
    PROFILE_FILE="$HOME/.bash_profile"
elif [ -f "$HOME/.profile" ]; then
    PROFILE_FILE="$HOME/.profile"
fi

EXPORT_LINES="
# Nova Language & NVM Environment
export NOVA_HOME=\"$INSTALL_DIR\"
export PATH=\"\$NOVA_HOME/bin:\$PATH\""

if [ -n "$PROFILE_FILE" ]; then
    if ! grep -Fqs "NOVA_HOME" "$PROFILE_FILE"; then
        echo "$EXPORT_LINES" >> "$PROFILE_FILE"
        echo "Configured environment variables in $PROFILE_FILE"
    else
        echo "Environment variables already configured in $PROFILE_FILE"
    fi
fi

echo ""
echo "Installation successful!"
echo "----------------------------------------------"
echo "Available commands:"
echo "  novac <file.nova>  - Compile Nova source into NVM binary"
echo "  nova <file.nvm>    - Execute NVM binary on Virtual Machine"
echo "  nova <file.nova>   - Compile and run in one step"
echo "----------------------------------------------"
echo "Open a new terminal (or run 'source $PROFILE_FILE') and try:"
echo "  nova --help"
echo "  novac --help"

