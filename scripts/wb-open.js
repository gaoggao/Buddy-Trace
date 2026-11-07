/**
 * Buddy Trace · 桌面启动器（.bat 只调这个）
 *
 * 为什么用 node 而不是纯 .bat：
 *   实测（2026-11-03）：.bat 里做 HTTP 探测、循环等待、变量作用域
 *   都极其容易出错（findstr 匹配不到带空格的 JSON、for/f 嵌套卡死、
 *   pause 卡住非交互调用）。用 node 写逻辑清清楚楚。
 *
 * 干什么：
 *   ① 探测服务（5 个端口逐个试）
 *   ② 没跑 → 跑守护脚本（它会启动服务）
 *   ③ 等它起来（最多 20 秒）
 *   ④ 打开浏览器
 *
 * 用法：
 *   node scripts/wb-open.js
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORTS = [41829, 42307, 44159, 46309, 48733];

/** 探测单个端口，返回 true/false */
function probe(port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/api/health', timeout: timeoutMs },
      (res) => {
        res.resume();                       // 丢弃 body
        resolve(res.statusCode === 200);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

/** 找活着的端口 */
async function findAlive() {
  for (const p of PORTS) {
    if (await probe(p)) return p;
  }
  return 0;
}

/** 打开浏览器 */
function openBrowser(port) {
  const url = `http://127.0.0.1:${port}`;
  // Windows: start 会立即返回
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

/** 同步跑守护脚本（它启动服务后退出） */
function runWatchdog() {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [path.join(HERE, 'wb-watchdog.js')],
      { cwd: ROOT, timeout: 90000, windowsHide: true },
      (err, stdout) => {
        if (stdout) process.stdout.write(stdout);
        resolve(!err);
      },
    );
  });
}

async function main() {
  // ① 先探测
  let port = await findAlive();

  if (!port) {
    // ② 没跑 → 跑守护（它会启动服务）
    console.log('服务没在运行，正在启动…');
    await runWatchdog();

    // ③ 等它起来（最多 20 秒）
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      port = await findAlive();
      if (port) break;
    }
  }

  // ④ 打开浏览器
  if (port) {
    console.log(`服务在跑（端口 ${port}），正在打开页面…`);
    openBrowser(port);
    // 给 spawn 一点时间，然后正常退出
    setTimeout(() => process.exit(0), 800);
    return;
  }

  console.error('');
  console.error('  ✗ 服务启动失败。');
  console.error('');
  console.error(`    日志: ${path.join(ROOT, '..', 'data', 'logs', 'service.log')}`);
  console.error(`    手动: node scripts/wb-watchdog.js`);
  console.error('');
  process.exit(1);
}

main().catch((e) => {
  console.error('启动器出错: ' + (e && e.message || e));
  process.exit(1);
});
