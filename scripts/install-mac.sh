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
#   推荐引导（国内免梯子，重复安装/更新都用这一条）：
#     curl -fsSL "https://gitee.com/gaogao2013/Buddy-Trace/raw/master/scripts/install-mac.sh" -o /tmp/bt-install.sh && bash /tmp/bt-install.sh
#   本地执行：
#     bash install-mac.sh
#   BT_INSTALL_DIR=/some/path bash install-mac.sh   # 自定义安装位置
#   DRY_RUN=1 bash install-mac.sh                   # 只打印将生成的 plist，不真装（测试用）
#
# 行为保证：
#   · 重复安装不会报"目录已存在"——已存在就走更新，更新不通就从 Gitee 重拉
#   · 换文件前先备份用户数据（~/.buddytrace-data-backup），失败也能自动恢复
#   · 全程 Gitee 优先，GitHub 只做兜底
# ─────────────────────────────────────────────────────────
set -u

REPO_GITEE="https://gitee.com/gaogao2013/Buddy-Trace.git"
REPO_GITHUB="https://github.com/gaoggao/Buddy-Trace.git"
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
echo "✅ Node: $NODE_BIN  ($("$NODE_BIN" -v))" >&2

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

# ── 3. 获取/更新代码（全程不丢用户数据；Gitee 优先，GitHub 兜底）──
echo "→ 安装目录: $INSTALL_DIR"
DATA_BAK="$HOME/.buddytrace-data-backup"     # 数据应急备份位（固定路径，断网/重装都不丢）

# 上次安装失败留下的备份 → 自动恢复
if [ -d "$DATA_BAK" ] && [ ! -d "$DATA_DIR" ]; then
  mkdir -p "$(dirname "$INSTALL_DIR")"
  mv "$DATA_BAK" "$DATA_DIR"
  echo "✅ 检测到上次安装留下的数据备份，已自动恢复"
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "→ 已存在，尝试更新 (git pull)"
  if git -C "$INSTALL_DIR" pull --ff-only >/dev/null 2>&1; then
    echo "✅ 已更新到最新"
  else
    # pull 失败多半是旧仓库 origin 指向 GitHub、当前网络连不上
    echo "→ git pull 不通，改从 Gitee 重新获取（你的数据会先备份，不会丢）"
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true   # 先停服务，避免换文件时反复重启
    [ -d "$DATA_DIR" ] && mv "$DATA_DIR" "$DATA_BAK"
    rm -rf "$INSTALL_DIR"
    if ! git clone --depth 1 "$REPO_GITEE" "$INSTALL_DIR" >/dev/null 2>&1; then
      echo "❌ 从 Gitee 重新获取也没成功。请检查网络后重跑本脚本。"
      echo "   你的记忆库数据已备份在: $DATA_BAK —— 网络恢复后重跑本脚本会自动恢复。"
      exit 1
    fi
    mkdir -p "$INSTALL_DIR"
    [ -d "$DATA_BAK" ] && mv "$DATA_BAK" "$DATA_DIR"
    echo "✅ 已从 Gitee 重新获取，原数据已恢复"
  fi
else
  # 全新安装：Gitee 优先，GitHub 兜底
  mkdir -p "$(dirname "$INSTALL_DIR")"
  echo "→ 从 Gitee 下载..."
  git clone --depth 1 "$REPO_GITEE" "$INSTALL_DIR" >/dev/null 2>&1 || true
  if [ ! -d "$INSTALL_DIR/src" ]; then
    echo "→ Gitee 没成功，回退 GitHub..."
    rm -rf "$INSTALL_DIR"
    git clone --depth 1 "$REPO_GITHUB" "$INSTALL_DIR" >/dev/null 2>&1 || true
  fi
fi
if [ ! -d "$INSTALL_DIR/src" ]; then
  echo "❌ 下载失败（Gitee 和 GitHub 都没连上）。检查网络后重跑本脚本。"
  exit 1
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

# ── 6. 匿名安装计数（一次；重装/更新用同一个 ID，不重复计）──
#    只发一串随机 ID + 版本 + "mac"，不含 IP/电脑名/账号/任何 WorkBuddy 内容。
#    断网/超时静默跳过，绝不影响安装。
INSTALL_ID_FILE="$HOME/.buddytrace-install-id"
if [ ! -s "$INSTALL_ID_FILE" ]; then
  NEWID="$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "mac-$(date +%s)-$$")"
  echo "$NEWID" > "$INSTALL_ID_FILE" 2>/dev/null || true
fi
INSTALL_ID="$(cat "$INSTALL_ID_FILE" 2>/dev/null)"
# 版本号从仓库里读（不写死）
BT_VER="$(grep -oE "VERSION = '[^']+'" "$INSTALL_DIR/src/version.js" 2>/dev/null | grep -oE "[0-9][^']*" | head -1)"
BT_VER="${BT_VER:-unknown}"
if [ -n "$INSTALL_ID" ]; then
  curl -s -m 8 -X POST -H 'Content-Type: application/json' \
    -d "{\"id\":\"$INSTALL_ID\",\"v\":\"$BT_VER\",\"os\":\"mac\"}" \
    "https://buddy-trace.lbase.com/admin/api/install-ping" >/dev/null 2>&1 || true
fi

echo ""
echo "完成 ✅  以后开机自动运行，每 30 分钟自动备份 WorkBuddy 记忆。"
echo "卸载： bash \"$INSTALL_DIR/scripts/uninstall-mac.sh\""
