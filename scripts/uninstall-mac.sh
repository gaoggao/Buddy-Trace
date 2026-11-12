#!/bin/bash
# ─────────────────────────────────────────────────────────
# Buddy Trace · Mac 卸载脚本
#
#   · 停掉并移除开机自启（launchd）
#   · 杀掉正在跑的服务进程
#   · 默认【保留】你的记忆库数据（data 目录）；要连数据一起删，加 --purge
#
# 用法：
#   bash uninstall-mac.sh
#   bash uninstall-mac.sh --purge
# ─────────────────────────────────────────────────────────
set -u

LABEL="com.lbase.buddytrace"
INSTALL_DIR="${BT_INSTALL_DIR:-$HOME/BuddyTrace}"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
PURGE=0
[ "${1:-}" = "--purge" ] && PURGE=1

echo "→ 停止开机自启..."
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$PLIST_PATH" 2>/dev/null || true
rm -f "$PLIST_PATH" && echo "✅ 已移除 launchd 配置: $PLIST_PATH"

echo "→ 结束正在运行的服务进程..."
# 精确匹配：只杀跑我们 index.js 的 node，不误伤别的 node 程序
pkill -f "$INSTALL_DIR/src/index.js" 2>/dev/null && echo "✅ 已结束服务进程" || echo "   （没有正在运行的进程）"

if [ "$PURGE" = "1" ]; then
  echo "→ 连数据一起删除（--purge）..."
  rm -rf "$INSTALL_DIR"
  echo "✅ 已彻底删除: $INSTALL_DIR"
else
  echo "→ 保留你的记忆库数据：$INSTALL_DIR/data"
  echo "   （程序文件已可不管；要连数据一起删，重跑加 --purge）"
fi

echo ""
echo "卸载完成 ✅"
