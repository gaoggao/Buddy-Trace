/**
 * Buddy Trace · 守护脚本
 *
 * ── 干什么 ──
 *
 * 老板定的方案（2026-11-03）：
 *   「每 30 分钟检测一次服务，这个同时扫一遍用户的目录不就得了。
 *     同时进行一个计划任务里边完成两个工作。用计划任务，不用真服务。」
 *
 * 所以这个脚本干三件事：
 *   ① 检查服务活着没有（请求 /api/health）
 *   ② 没活 → 拉起来（顺便就把用户的目录扫了一遍）
 *   ③ 活着 → 主动触发一次同步（保证每 30 分钟扫一遍）
 *
 * ── 为什么需要 ──
 *
 * 实测（2026-11-03）：服务会莫名其妙死掉 ——
 *   · 用 Start-Process 启动的 node，调用者一退出就被连带清理
 *   · 用户手动杀、杀毒软件、系统更新，都会杀掉它
 *   · 死了之后没有任何提示，用户以为软件坏了
 *
 * 所以要有外部守护，不指望服务自己活着。
 *
 * ── 怎么用 ──
 *
 *   node scripts/wb-watchdog.js
 *
 * 由 Windows 计划任务每 30 分钟调用一次（见 wb-install-task.ps1）。
 * 也可以手动跑一次，检查+修复。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

/** 端口备选（跟 index.js 保持一致，跳跃分布） */
const PORTS = [41829, 42307, 44159, 46309, 48733];

/** 日志目录 */
const LOG_DIR = path.join(ROOT, '..', 'data', 'logs');

function log(msg) {
  const line = `[${new Date().toISOString().slice(0, 19).replace('T', ' ')}] ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, 'watchdog.log'), line + '\n', 'utf8');
  } catch { /* 写不了日志就算了，别让守护脚本崩 */ }
}

/** 请求健康检查，返回 true/false */
function checkHealth(port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/api/health', timeout: timeoutMs },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try {
            const j = JSON.parse(body);
            resolve(j && j.ok ? { ok: true, port } : { ok: false, port });
          } catch {
            resolve({ ok: false, port });
          }
        });
      },
    );
    req.on('error', () => resolve({ ok: false, port }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, port }); });
  });
}

/** 找一个活着的实例 */
async function findAlive() {
  for (const p of PORTS) {
    const r = await checkHealth(p);
    if (r.ok) return p;
  }
  return 0;
}

/** 触发一次同步（带 uid 不需要，同步是服务自己的事） */
function triggerSync(port, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/api/sync?force=0', method: 'POST', timeout: timeoutMs },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch { resolve({ ok: false, error: '返回不是 JSON' }); }
        });
      },
    );
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: '超时' }); });
    req.end();
  });
}

/**
 * 启动服务
 *
 * 关键：用 detached + unref，让子进程完全脱离守护脚本
 * （否则守护脚本一退出，服务又被连带清理 —— 就是之前踩的坑）
 */
function startService() {
  const dataDir = process.env.BT_DATA || path.join(ROOT, '..', 'data');
  const outLog = path.join(LOG_DIR, 'service.log');
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch { /* ignore */ }

  const out = fs.openSync(outLog, 'a');
  const child = spawn(
    process.execPath,                                   // 用同一个 node
    [path.join(ROOT, 'src', 'index.js'), '--data', dataDir, '--no-open'],
    {
      cwd: ROOT,
      detached: true,          // 脱离父进程
      stdio: ['ignore', out, out],   // 输出写日志，不占管道
      windowsHide: true,
    },
  );
  child.unref();               // 父进程不等待它
  return child.pid;
}

/** 杀掉残留的实例（端口不响应但进程还在的情况） */
function killStale() {
  // 不做复杂处理 —— 只记日志，让用户知道
  log('  提示：如果有残留进程，可以用任务管理器结束 node.exe');
}

async function main() {
  log('════ 守护检查开始 ════');

  // ① 服务活着吗
  const alive = await findAlive();

  if (!alive) {
    log('  ❌ 服务没在跑 —— 启动它');
    const pid = startService();
    log('     已启动，PID ' + pid);
    log('     等 15 秒让它起来…');

    // 等它起来
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const p = await findAlive();
      if (p) {
        log('  ✅ 服务已启动，端口 ' + p);
        // 起来了就顺手触发一次同步
        const s = await triggerSync(p);
        log('     首次同步: ' + (s.ok ? `新增 ${s.added} / 跳过 ${s.dup}` : '失败 ' + (s.error || '')));
        return;
      }
    }
    log('  ⚠ 启动后 15 秒仍不响应 —— 可能启动失败，看 ' + path.join(LOG_DIR, 'service.log'));
    killStale();
    return;
  }

  // ② 活着 → 触发一次同步（保证每 30 分钟扫一遍用户目录）
  log('  ✅ 服务在跑（端口 ' + alive + '）');
  const s = await triggerSync(alive);
  if (s.ok) {
    log(`  同步完成：新增 ${s.added}，更新 ${s.updated || 0}，跳过 ${s.dup}，耗时 ${s.ms}ms`);
  } else {
    log('  ⚠ 同步失败: ' + (s.error || '未知'));
  }
}

main().catch((e) => {
  log('  ✗ 守护脚本自身出错: ' + (e && e.message || e));
  process.exit(1);
});
