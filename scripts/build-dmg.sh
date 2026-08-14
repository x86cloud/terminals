#!/usr/bin/env bash
# ============================================================
# xClient macOS DMG 打包脚本
# 使用 create-dmg 构建带拖拽安装界面的 DMG 镜像
# ============================================================

set -euo pipefail

ARCH="${1:-universal}"
VERSION="${2:-1.0.0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$ROOT_DIR/build/bin"
APP_PATH="$BIN_DIR/xClient.app"
DMG_NAME="xClient-macos-${ARCH}.dmg"
DMG_OUTPUT="$BIN_DIR/$DMG_NAME"

echo "========================================"
echo "  xClient macOS DMG 打包构建工具 (${ARCH})"
echo "========================================"

cd "$ROOT_DIR"

# 1. 检查 xClient.app 是否已构建
if [ ! -d "$APP_PATH" ]; then
    echo "⚠️  未发现 $APP_PATH，正在通过 Wails 构建..."
    wails build -clean -platform "darwin/${ARCH}"
fi

if [ ! -d "$APP_PATH" ]; then
    echo "❌ 错误：构建产物 $APP_PATH 不存在！"
    exit 1
fi

# 2. 检查 create-dmg 工具
if ! command -v create-dmg &> /dev/null; then
    echo "⚠️  未找到 create-dmg 工具，正在通过 Homebrew 安装..."
    if command -v brew &> /dev/null; then
        brew install create-dmg
    else
        echo "❌ 错误：请先安装 Homebrew (https://brew.sh) 或 create-dmg 工具"
        exit 1
    fi
fi

# 3. 清理已存在的旧 DMG
rm -f "$DMG_OUTPUT"

# 4. 生成 DMG
echo "📦 正在生成 DMG 安装包: $DMG_NAME ..."

create-dmg \
    --volname "xClient" \
    --volicon "$ROOT_DIR/build/appicon.png" \
    --window-pos 200 120 \
    --window-size 600 400 \
    --icon-size 100 \
    --icon "xClient.app" 140 180 \
    --hide-extension "xClient.app" \
    --app-drop-link 440 180 \
    --no-internet-enable \
    "$DMG_OUTPUT" \
    "$APP_PATH" || true

if [ -f "$DMG_OUTPUT" ]; then
    SIZE=$(du -h "$DMG_OUTPUT" | cut -f1)
    echo ""
    echo "✅ DMG 安装包生成成功！"
    echo "产物路径: $DMG_OUTPUT ($SIZE)"
else
    echo "❌ DMG 构建失败，请检查 create-dmg 日志。"
    exit 1
fi
