/**
 * Buddy Trace · 运行状态（runtime.json）
 *
 * 为什么需要（2026-11-08）：
 *   之前没有单实例检查，双击两次图标会起两个服务（一个占 41829，另一个顺延到 42307），
 *   两个实例各写各的库，数据会混乱。而且端口变了以后，watchdog / 导出链接
 *   这些外部组件不知道新端口在哪，只能猜。
 *
 * 做法：
 *   · 服务启动成功后，把「实际端口 + pid + 启动时间」写进 data/runtime.json
 *   · 启动前先读 runtime.json，探测那个端口是否还活着：
 *       - 活着 → 说明已经有一个实例在跑，本进程直接退出（单实例）
 *       - 死了 → 旧进程残留，正常启动，后面覆盖写 runtime.json
 *   · 其他组件（watchdog、导出链接等）读 runtime.json 拿真实端口，不写死
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { DEFAULT_PORTS } from './ports.js';

/** runtime.json 的文件名（固定，外部组件按这个名字找） */
export const RUNTIME_FILE = 'runtime.json';

/** 读运行状态，读不到或格式坏返回 null */
export function readRuntime(dataDir) {
  try {
    const p = path.join(dataDir, RUNTIME_FILE);
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j && Number.isInteger(j.port)) return j;
    return null;
  } catch {
    return null;
  }
}

/** 写运行状态 */
export function writeRuntime(dataDir, info) {
  try {
    const p = path.join(dataDir, RUNTIME_FILE);
    fs.writeFileSync(p, JSON.stringify({
      port: info.port,
      pid: info.pid,
      startedAt: new Date().toISOString(),
    }, null, 2));
  } catch {
    // 写不了状态文件不影响服务运行
  }
}

/**
 * 探测某端口上有没有【我们自己的】 Buddy Trace 服务。
 *
 * 关键（老板 2026-11-09 指出）：
 *   端口不强制 41829，用户 41829 被别的程序占了也照常装（顺延到备用端口）。
 *   所以探测时不能只看 ok === true —— 别的程序也可能返回 {"ok":true}，
 *   会误判成"已有实例"，导致单实例检查误伤。
 *   必须同时验证 name === 'Buddy Trace'，确认是本程序。
 */
export function probeAlive(port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/api/health', timeout: timeoutMs },
      (res) => {
        res.resume();
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try {
            const j = JSON.parse(body);
            resolve(j && j.ok === true && j.name === 'Buddy Trace');
          } catch {
            resolve(false);
          }
        });
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

/**
 * 单实例检查：
 *   ① 先 probe runtime.json 记录的端口
 *   ② 不通再扫全部备用端口（兜底：runtime.json 过期 / probe 超时都能兜住）
 * 找到任何一个【我们自己的】活实例，就返回该端口；否则返回 0。
 */
export async function existingInstance(dataDir) {
  const rt = readRuntime(dataDir);
  if (rt && (await probeAlive(rt.port))) {
    return rt.port;
  }
  for (const p of DEFAULT_PORTS) {
    if (await probeAlive(p)) return p;
  }
  return 0;
}

/**
 * 重启自己（增量更新后让新代码生效）。
 *
 * 为什么需要（2026-11-08）：
 *   增量更新只覆盖 code/ 目录的文件，但服务进程已经把旧代码 import 进内存，
 *   不重启的话新代码永远不生效（等用户手动重启或下次开机）。
 *
 * 做法：spawn 一个新的自己（detached，不阻塞），
 *       当前进程延迟一小段后退出。新进程起来会重新加载 code/ 目录。
 *
 * 传参：带上原始 argv（--data / --port / --no-open 等），
 *       这样新进程跟旧进程的启动方式完全一致。
 */
export function scheduleRestart(delayMs = 1200) {
  setTimeout(() => {
    try {
      const child = spawn(
        process.execPath,
        process.argv.slice(1),
        {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        },
      );
      child.unref();
    } catch { /* spawn 失败就不重启，别把当前进程搞死 */ }
    // 退出当前进程（让新进程接管端口）
    process.exit(0);
  }, delayMs);
}
