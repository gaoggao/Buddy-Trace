#!/bin/bash
# ─────────────────────────────────────────────────────────
# Buddy Trace · Mac 部署版安装脚本
#
# 特点：
#   · 不写死任何绝对路径 —— node 位置、家目录、安装目录全部现算现填
#   · launchd 开机自启的 plist 在【安装这一刻】用真实路径生成
#   · 断网/没装 node 会给明确提示，不静默失败
#
# 用法：
#   bash install-mac.sh
#   BT_INSTALL_DIR=/some/path bash install-mac.sh   # 自定义安装位置
#   DRY_RUN=1 bash install-mac.sh                   # 只打印将生成的 plist，不真装（测试用）
# ─────────────────────────────────────────────────────────
set -u

REPO_URL="https://github.com/gaoggao/Buddy-Trace.git"
LABEL="com.lbase.buddytrace"

# ── 0. 找 node（不写死路径：Homebrew/官方pkg/nvm 都能找到）──
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "❌ 没找到 Node.js。请先安装（推荐 LTS 22 或更高）："
  echo "   方式一：官网 https://nodejs.org 下载 macOS 安装包(.pkg)，双击安装"
  echo "   方式二：装了 Homebrew 的话： brew install node"
  echo "   装好后【重开终端】再运行本脚本。"
  exit 1
fi

NODE_MAJOR="$("$NODE_BIN" -e 'console.log(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "❌ Node 版本太低（当前 $("$NODE_BIN" -v)，需要 22 或更高）。"
  echo "   读 WorkBuddy 数据要用 Node 22+ 内置的 sqlite，请升级 Node。"
  exit 1
fi
echo "✅ Node: $NODE_BIN  ($("$NODE_BIN" -v))"

# ── 1. 安装目录（默认 ~/BuddyTrace，可用 BT_INSTALL_DIR 覆盖）──
INSTALL_DIR="${BT_INSTALL_DIR:-$HOME/BuddyTrace}"
DATA_DIR="$INSTALL_DIR/data"

# ── 2. DRY_RUN：只生成并打印 plist，不下载不安装 ──
gen_plist() {
  # launchd 不认 ~ 和变量，这里全部展开成真实绝对路径
  cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$INSTALL_DIR/src/index.js</string>
        <string>--no-open</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>$INSTALL_DIR</string>
    <key>StandardOutPath</key>
    <string>$DATA_DIR/launchd.out.log</string>
    <key>StandardErrorPath</key>
    <string>$DATA_DIR/launchd.err.log</string>
</dict>
</plist>
PLIST
}

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "（DRY_RUN）只输出 plist 到 stdout，不下载不安装。" >&2
  echo "✅ Node: $NODE_BIN  ($("$NODE_BIN" -v))" >&2
  gen_plist
  exit 0
fi

# ── 3. 下载代码 ──
echo "→ 安装到: $INSTALL_DIR"
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "→ 已存在，执行更新 (git pull)"
  git -C "$INSTALL_DIR" pull --ff-only 2>&1 | tail -2
else
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" 2>&1 | tail -2
fi
mkdir -p "$DATA_DIR"

# ── 4. 生成并加载开机自启 ──
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/$LABEL.plist"
mkdir -p "$PLIST_DIR"
gen_plist > "$PLIST_PATH"
echo "✅ 已生成开机自启: $PLIST_PATH"

# 先卸载旧的（重复安装时），再加载
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH" 2>&1 || launchctl load "$PLIST_PATH" 2>&1
echo "✅ 开机自启已注册"

# ── 5. 立即启动一次，打开界面 ──
"$NODE_BIN" "$INSTALL_DIR/src/index.js" --no-open >/dev/null 2>&1 &
sleep 2
# 从 runtime.json 读实际端口（不写死端口）
PORT="$(cat "$DATA_DIR/runtime.json" 2>/dev/null | tr ',' '\n' | grep -o '"port":[0-9]*' | grep -o '[0-9]*' | head -1)"
PORT="${PORT:-41829}"
echo "✅ 已启动。界面地址： http://127.0.0.1:$PORT"
open "http://127.0.0.1:$PORT" 2>/dev/null || echo "   请手动在浏览器打开 http://127.0.0.1:$PORT"

echo ""
echo "完成 ✅  以后开机自动运行，每 30 分钟自动备份 WorkBuddy 记忆。"
echo "卸载： bash \"$INSTALL_DIR/scripts/uninstall-mac.sh\""
