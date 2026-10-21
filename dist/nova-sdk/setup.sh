#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$SCRIPT_DIR/bin"

chmod +x "$BIN_DIR/nova" "$BIN_DIR/novac"

echo "========================================"
echo "  Nova & NVM Standalone Setup (POSIX)   "
echo "========================================"
echo ""
echo "Nova bin directory: $BIN_DIR"

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

EXPORT_LINE="export PATH=\"$BIN_DIR:\$PATH\""

if [ -n "$PROFILE_FILE" ]; then
  if grep -Fqs "$BIN_DIR" "$PROFILE_FILE"; then
    echo "Nova bin is already present in $PROFILE_FILE"
  else
    echo "" >> "$PROFILE_FILE"
    echo "# Nova Toolchain" >> "$PROFILE_FILE"
    echo "$EXPORT_LINE" >> "$PROFILE_FILE"
    echo "Added Nova bin to $PROFILE_FILE!"
  fi
else
  echo "Could not detect a shell profile file. Please add manually:"
  echo "  $EXPORT_LINE"
fi

echo ""
echo "Open a new terminal (or run 'source $PROFILE_FILE') and run:"
echo "  novac --help"
echo "  nova --help"

