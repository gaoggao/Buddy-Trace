# macOS 安装与使用说明

> 适用：**溯源 · Buddy Trace** 的 macOS 部署版。Windows 用户请跳过本文档，直接用安装包。

Buddy Trace 在 Mac 上不做 DMG 安装包，用一条命令完成安装 / 升级。装完开机自启，每 30 分钟自动收录 WorkBuddy 的记忆。

---

## 一、安装前提

需要 **Node.js 22 或更高**。读 WorkBuddy 数据用到 Node 22 内置的 sqlite，版本低了会直接报错退出。

确认版本：

```bash
node -v
```

没装或版本太低，二选一：

- 官网下载 macOS 安装包（.pkg）：https://nodejs.org ，双击安装
- 装了 Homebrew：`brew install node`

装完**重开终端**再继续。

## 二、安装 / 升级

一条命令，全新安装和升级**都是它**：

```bash
curl -fsSL "https://gitee.com/gaogao2013/Buddy-Trace/raw/master/scripts/install-mac.sh" -o /tmp/bt-install.sh && bash /tmp/bt-install.sh
```

脚本会自动完成：

1. 找到本机的 Node（Homebrew / 官方 pkg / nvm 都行，不写死路径）
2. 从 Gitee 拉代码（连不上自动回退 GitHub），装到 `~/BuddyTrace`
3. 换文件前先备份你的数据到 `~/.buddytrace-data-backup`，失败会自动恢复
4. 生成开机自启配置（`~/Library/LaunchAgents/com.lbase.buddytrace.plist`，路径按你本机现算现填）
5. 立即启动一次，并打开浏览器界面

看到「完成 ✅」就成了。界面地址一般是：

```
http://127.0.0.1:41829
```

端口被占会自动换（41829 → 41830 → 41831），实际端口以 `~/BuddyTrace/data/runtime.json` 里的 `port` 为准。

## 三、升级

**重跑第二节那条命令即可。**

脚本检测到已安装会走更新（`git pull`）；网络不通就从 Gitee 重新获取，**你的数据会先备份、不会丢**。

注意：Mac 版不参与 Windows 的 exe 增量更新，升级就是重跑这条命令。

## 四、接入 WorkBuddy（只需一次）

1. 打开界面，进入「设置 → WorkBuddy 接入」，复制那段引导语
2. 在 WorkBuddy 里**新开一个会话**，把这段话发给它
3. WorkBuddy 会读本机的说明文件，把自己接进去

之后每开新会话它都会自动知道来查。接入只需这一次，以后版本更新自动生效。

换 WorkBuddy 账号时，切到那个账号，**再发一次引导语**（每个账号要各自认领）。

## 五、验证是否装好

- 终端看开机自启：

  ```bash
  launchctl list | grep com.lbase.buddytrace
  ```

- 看界面能不能打开：`http://127.0.0.1:41829`
- 看记忆有没有进来：界面左侧各项计数是否非零（新装用户可能暂时为 0，等一轮 30 分钟的收录）

## 六、卸载

```bash
bash ~/BuddyTrace/scripts/uninstall-mac.sh
```

如需自定义安装位置，安装时用 `BT_INSTALL_DIR=/你的/路径 bash install-mac.sh`。

## 七、常见问题

**Q：提示「没找到 Node.js」或「Node 版本太低」**
先装 Node 22+，装完重开终端，再跑安装命令。

**Q：git pull 不通 / 下载失败**
脚本会自动回退 Gitee。两边都连不上时检查网络后重跑；你的数据已备份在 `~/.buddytrace-data-backup`，重跑会自动恢复。

**Q：界面打不开**
先看 `~/BuddyTrace/data/runtime.json` 里的真实端口；Mac 版没有 Windows 那套 watchdog，服务若卡住，杀掉进程后重跑安装命令或重启电脑。

**Q：手机 App 的会话能查吗**
不能。那部分存在云端，本地磁盘没有文件。

## 八、隐私

- 对 WorkBuddy 只读，不改动它的任何文件
- 数据只在你本地，不上云
- 安装时发一次匿名计数（随机 ID + 版本 + `mac`），不含 IP / 电脑名 / 任何内容；断网会静默跳过，不影响安装
