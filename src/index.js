#!/usr/bin/env node
/**
 * LBASE 启动入口
 *
 * 用法：
 *   node src/index.js                    # 数据存在 ./data
 *   node src/index.js --data ./mydata     # 指定数据目录
 *   node src/index.js --port 41829        # 指定端口（默认自动选）
 *   node src/index.js --no-open           # 不自动打开浏览器
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exec, spawn } from 'node:child_process';
import { Store } from './store.js';
import { Config } from './config.js';
import { createServer, listenWithFallback } from './server.js';
import { resolvePorts } from './ports.js';
import { readRuntime, writeRuntime, existingInstance } from './runtime.js';

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`
溯源 · Buddy Trace — WorkBuddy 记忆的延伸

用法:
  lbase [选项]

选项:
  --data <目录>    数据目录（默认 ./data）
  --port <端口>    监听端口（默认 41829/41830/41831 自动选）
  --no-open        启动后不自动打开浏览器
  --help           显示帮助
`);
  process.exit(0);
}

/**
 * 默认数据目录
 *
 * ── 为什么不能再用 './data'（2026-11-06 老板发现 backup 跑到 system32）──
 *
 * 原来：path.resolve('./data') 基于【当前工作目录】解析。
 * 计划任务启动 BuddyTrace.exe 时，工作目录是 C:\windows\system32，
 * 于是 dataDir = C:\windows\system32\data，备份跑到 system32\data\backup。
 *
 * 修法：默认数据目录固定跟着【程序本体】走，不跟工作目录走。
 *   · 打包版（bun 编译的 BuddyTrace.exe）→ exe 旁边的 data
 *   · 开发版（node src/index.js）→ 项目根目录的 data
 */
function defaultDataDir() {
  const execName = path.basename(process.execPath).toLowerCase();
  // 打包版：execPath 是 BuddyTrace.exe（不是 node.exe）
  if (execName.endsWith('.exe') && execName !== 'node.exe') {
    return path.join(path.dirname(process.execPath), 'data');
  }
  // 开发版：脚本在 code/src/，项目根（data 所在）在 code 的上一级
  const here = path.dirname(fileURLToPath(import.meta.url));   // .../code/src
  return path.resolve(path.join(here, '..', '..', 'data'));     // .../data
}

const dataDir = path.resolve(args.data || defaultDataDir());
// 端口备选：跳跃分布，避免"整片端口被占"时连续失败（老板 2026-11-03 要求）
// 统一从 ports.js 拿，环境变量 BT_PORTS 可覆盖（分号分隔），方便部署时改
const ports = resolvePorts({ portArg: args.port });

// 启动前检查
console.log('Buddy Trace 启动中…');
console.log(`  数据目录: ${dataDir}`);

try {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.accessSync(dataDir, fs.constants.W_OK);
} catch (err) {
  console.error(`  ✗ 数据目录不可写: ${err.message}`);
  process.exit(1);
}

// ── 单实例检查（2026-11-08 加）──
// 双击两次图标 / 计划任务与服务同时启动，都会造成两个实例各写各的库。
// 这里读 runtime.json，发现已有一个活着的实例，就不再起第二个。
//
// 注意：必须在 new Store() 之前查 —— Store 构造器会打开索引文件，
// 如果第二个实例先打开 Store 再退出，极端情况下会和第一个实例并发写 index.json。
const alreadyPort = await existingInstance(dataDir);
if (alreadyPort) {
  console.log(`  已有实例在跑（端口 ${alreadyPort}），本进程退出`);
  // 用户双击图标（没带 --no-open）→ 打开浏览器到已有实例，方便用户看到
  if (!args['no-open']) {
    openBrowser(`http://127.0.0.1:${alreadyPort}`);
  }
  process.exit(0);
}

const store = new Store(dataDir);
const config = new Config(dataDir);
const stats = store.stats();
console.log(`  已有内容: ${stats.total} 条，项目: ${stats.projects} 个`);

// 先声明端口变量，再创建 server（否则 getPort 会撞上 TDZ 错误）
//
// 踩坑记录（2026-11-03）：原来写成
//   const server = createServer(..., { getPort: () => actualPort });
//   let actualPort = 0;
//   在 let 声明之前就引用了 actualPort → 一调 getPort 就抛
//   "Cannot access 'actualPort' before initialization"。
let actualPort = 0;
const server = createServer(store, { config, dataDir, getPort: () => actualPort });

try {
  actualPort = await listenWithFallback(server, ports);
} catch (err) {
  console.error(`  ✗ ${err.message}`);
  console.error('  请关闭占用这些端口的程序，或用 --port 指定其它端口');
  store.close();
  process.exit(1);
}

// 记录实际端口，供 watchdog / 导出链接等外部组件读取（不写死）
writeRuntime(dataDir, { port: actualPort, pid: process.pid });

// ── WorkBuddy 自动同步（全自动，用户不点任何按钮）──
// 启动扫一次 + 之后每 30 分钟扫一次（BT_INTERVAL 可改）
let syncer = null;
if (!args['no-sync']) {
  const { WbSyncer } = await import('./wb-syncer.js');
  // 传函数而不是数字：端口万一变了（重启换了端口），导出里的地址也能跟着变
  syncer = new WbSyncer({ store, dataDir, port: () => actualPort });
  server.__syncer = syncer;   // 供 /api/sync 用
  syncer.start();
}

// ── 远程内容下发（Remote Config）──
// 二维码这类小资源：启动时静默拉最新（用户无感，不弹窗）。
// 后台换了二维码 = 上传新图到 Gitee/GitHub，用户下次启动自动拿到新的。
// 提示更新（检测 + 弹窗）是留给以后"大内容/版本"用的，二维码不提示。
try {
  const { applyRemoteUpdate } = await import('./remote.js');
  await applyRemoteUpdate(dataDir);
} catch (e) { /* 静默，用本地缓存兜底 */ }

const base = `http://127.0.0.1:${actualPort}`;
console.log(`  ✓ 服务已启动`);
console.log(`    界面: ${base}`);
console.log(`    接口: ${base}/api/health`);
if (syncer) {
  console.log(`    WorkBuddy 同步: 已启用（每 ${syncer.status().intervalMinutes} 分钟一次）`);
}
console.log('');
console.log('  按 Ctrl+C 停止');

if (!args['no-open']) {
  openBrowser(base);
}

// 优雅退出
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\n正在停止…');
    if (syncer) syncer.stop();
    server.close(() => {
      store.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 2000);
  });
}

// ── 工具 ─────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

/**
 * 打开浏览器
 *
 * ── 为什么不弹窗很重要（老板 2026-11-05）──
 *
 *   「我不在意安装包大小，我只是要不弹窗。不管你是什么方式兜不兜底儿，
 *     你不要弹窗就行。你弹窗我们这个项目就无法进行了。」
 *
 * ── 原来的问题 ──
 *
 * 用 exec(`start "" "${url}"`)：
 *   start 是 cmd.exe 的内部命令 → 必须经 cmd.exe 执行
 *   cmd.exe 是 Console 子系统 → Windows 分配控制台 → 黑窗闪一下
 *
 * ── 改法 ──
 *
 * Windows 上不用 cmd/start，直接起浏览器 exe（GUI 程序，不建控制台）。
 * 用 rundll32 也行（它是 GUI 子系统），最稳的是直接指定浏览器路径。
 *
 * 顺序：
 *   ① rundll32 url.dll,FileProtocolHandler <url>   —— GUI 子系统，一定不弹
 *   ② 找不到就用 start（兜底，可能闪一下）
 */
function openBrowser(url) {
  if (process.platform === 'win32') {
    // rundll32.exe 是 GUI 子系统（Subsystem=2），不会创建控制台
    // 它加载 url.dll 的 FileProtocolHandler，用默认浏览器打开 URL
    const sys = process.env.SystemRoot || 'C:\\Windows';
    const rundll = path.join(sys, 'System32', 'rundll32.exe');

    try {
      const child = spawn(rundll, ['url.dll,FileProtocolHandler', url], {
        detached: true,
        stdio: 'ignore',      // 不接任何管道
        windowsHide: true,    // 双保险
      });
      child.unref();
      return;
    } catch { /* 落到兜底 */ }

    // 兜底：start（可能闪一下，但至少能开）
    exec(`start "" "${url}"`, () => {});
    return;
  }

  if (process.platform === 'darwin') {
    exec(`open "${url}"`, () => {});
    return;
  }
  exec(`xdg-open "${url}"`, () => {});
}
