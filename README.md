# 溯源 · Buddy Trace

**WorkBuddy 记忆的延伸** —— 帮 WorkBuddy 记住它干过的所有事。

换账号、开新会话、聊久了、上下文被压缩过，WorkBuddy 之前做过什么就想不起来了。Buddy Trace 替它存一份，需要的时候，它自己会来查。

- 官网：https://buddy-trace.lbase.com
- 仅适用于 WorkBuddy，不适用于其他 AI 工具或 Agent

---

## 它解决什么

| 场景 | 问题 | Buddy Trace |
|---|---|---|
| 换账号 | 之前做的事断了 | 说一句「继续做那个项目」，新账号接上 |
| 开新会话 | 不知道上周做到哪 | 对话、搜索、命令一字不落存着 |
| 聊太久 | 早先细节丢了 | 完整记录在本地库，需要时自己查 |
| 溯源 | 「当初为什么这么改」想不起 | 几个月前的改动和推理都能查 |

## 特性

- **本地部署**：数据全在你自己的电脑上，不上传任何云端
- **只读不改**：对 WorkBuddy 只读取，一个字都不改
- **后台自动**：每 30 分钟自动收录，不用管
- **跨账号**：一台电脑上所有账号的记录合并可查

## 快速开始

### 安装包

1. 从官网下载安装包（Gitee / GitHub Release / 夸克网盘）
2. 双击安装，桌面出现「Buddy Trace」图标
3. 打开后按引导完成首次设置（复制接入指令 → 发给 WorkBuddy）

### 源码

要求：Node.js 22+

```bash
git clone https://github.com/gaoggao/Buddy-Trace.git
cd Buddy-Trace
node src/index.js
# 浏览器打开 http://127.0.0.1:41829
```

数据目录默认在程序旁边的 `data/`，可用 `--data` 指定。

## 项目结构

```
src/                    后端服务（Node.js，无第三方依赖）
  shell.js              启动器（exe 入口，优先加载外部 code，缺失则用内置兜底）
  index.js              启动入口
  server.js             HTTP 服务层（全部 API 接口）
  store.js              存储层（本地库）
  backup.js             备份
  wb-sync.js            WorkBuddy 数据同步
  wb-syncer.js          定时同步器
  wb-guide.js           给 agent 的接入说明生成
  wb-extract.js         WorkBuddy 数据提取
  wb-privacy.js         隐私脱敏
  wb-export.js          导出
  remote.js             远程内容下发（Gitee/GitHub 双源）
  updater.js            增量更新（下载/校验/备份/覆盖/回滚）
  runtime.js            运行状态（runtime.json + 单实例检查）
  ports.js              端口列表（统一来源）
  version.js            版本号（统一来源）
  help-data.js          帮助文档数据

public/                 前端界面
  index.html            页面骨架
  ui/app.js             前端逻辑
  ui/app.css            样式
  img/                  图片资源

scripts/                构建和部署脚本
  build-exe.js          打包 exe 壳 + 增量代码包
  embed-ui.js           内嵌前端资源
  wb-install.js         安装、计划任务、快捷方式
  wb-watchdog.js        守护进程

test/                   测试
docs/                   文档
installer.iss           Windows 安装包脚本（Inno Setup）
CHANGELOG.md            更新日志
```

## 更新日志

版本更新记录见 [CHANGELOG.md](CHANGELOG.md)。

## 许可

详见 [LICENSE](LICENSE)。

## 免责声明

本软件是 WorkBuddy 记忆的辅助备份工具，仅供参考，不保证数据完整、准确，因使用造成的损失作者不承担责任。
