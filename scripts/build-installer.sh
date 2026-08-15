#!/usr/bin/env bash
# Build the one-click installer applet (assets/一键安装.app) and ad-hoc sign it.
set -euo pipefail
cd "$(dirname "$0")/.."

osacompile -o "assets/一键安装.app" "build/一键安装.applescript"
codesign --force --sign - "assets/一键安装.app"

echo "built assets/一键安装.app"
codesign -dv "assets/一键安装.app" 2>&1 | grep -E 'Signature|Identifier' | head -3
