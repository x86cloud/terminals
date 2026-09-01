#!/usr/bin/env bash
# ==============================================================================
# Terminal v3 - macOS DMG 磁盘镜像打包脚本
# 支持在 macOS 本地环境或 GitHub Actions CI (macos-latest) 中运行
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

APP_NAME="terminal-v3"
VOLUME_NAME="Terminal"
OUTPUT_DIR="${ROOT_DIR}/dist"
OUTPUT_DMG="${OUTPUT_DIR}/${APP_NAME}-macos-universal.dmg"

echo "=========================================="
echo "  Terminal v3 - macOS DMG 打包"
echo "=========================================="

mkdir -p "${OUTPUT_DIR}"

# 1. 查找编译生成的 .app 应用包
APP_PATH=""
if [ -d "${ROOT_DIR}/bin/${APP_NAME}.app" ]; then
    APP_PATH="${ROOT_DIR}/bin/${APP_NAME}.app"
elif [ -d "${ROOT_DIR}/bin/Terminal.app" ]; then
    APP_PATH="${ROOT_DIR}/bin/Terminal.app"
elif [ -d "${ROOT_DIR}/${APP_NAME}.app" ]; then
    APP_PATH="${ROOT_DIR}/${APP_NAME}.app"
fi

if [ -z "${APP_PATH}" ] || [ ! -d "${APP_PATH}" ]; then
    echo "[!] 未检测到已构建的 .app 包，尝试执行 wails3 package / task darwin:package..."
    if command -v wails3 >/dev/null 2>&1; then
        wails3 task darwin:package || wails3 package
    fi

    if [ -d "${ROOT_DIR}/bin/${APP_NAME}.app" ]; then
        APP_PATH="${ROOT_DIR}/bin/${APP_NAME}.app"
    else
        echo "[ERROR] 找不到 ${APP_NAME}.app，请先执行 wails3 task darwin:package 构建应用包！" >&2
        exit 1
    fi
fi

echo "[1/3] 应用包路径: ${APP_PATH}"

# 清理旧的同名 DMG
rm -f "${OUTPUT_DMG}"

# 2. 检查并执行 DMG 打包
echo "[2/3] 正在封装为 DMG 磁盘镜像..."

if command -v create-dmg >/dev/null 2>&1; then
    echo "使用 create-dmg 制作带样式向导的磁盘镜像..."
    create-dmg \
        --volname "${VOLUME_NAME}" \
        --window-pos 200 120 \
        --window-size 640 400 \
        --icon-size 120 \
        --icon "${APP_NAME}.app" 170 190 \
        --hide-extension "${APP_NAME}.app" \
        --app-drop-link 470 190 \
        --no-internet-enable \
        "${OUTPUT_DMG}" \
        "${APP_PATH}" || true
fi

# 兜底方案：如果 create-dmg 失败或不存在，使用 macOS 原生 hdiutil
if [ ! -f "${OUTPUT_DMG}" ]; then
    echo "使用 macOS 原生 hdiutil 构建 DMG 镜像..."
    TMP_DMG_DIR=$(mktemp -d /tmp/terminal_dmg.XXXXXX)
    cp -R "${APP_PATH}" "${TMP_DMG_DIR}/"
    ln -s /Applications "${TMP_DMG_DIR}/Applications"

    hdiutil create \
        -volname "${VOLUME_NAME}" \
        -srcfolder "${TMP_DMG_DIR}" \
        -ov \
        -format UDZO \
        "${OUTPUT_DMG}"

    rm -rf "${TMP_DMG_DIR}"
fi

# 3. 验证产物
if [ -f "${OUTPUT_DMG}" ]; then
    DMG_SIZE=$(du -h "${OUTPUT_DMG}" | cut -f1)
    echo "=========================================="
    echo "[3/3] macOS DMG 打包成功！"
    echo "产物路径: ${OUTPUT_DMG}"
    echo "产物大小: ${DMG_SIZE}"
    echo "=========================================="
else
    echo "[ERROR] DMG 文件未成功生成！" >&2
    exit 1
fi
