/**
 * Buddy Trace · 运行状态（runtime.json）+ 实例锁
 *
 * 2026-11-14 修（老板实测踩坑，2.1.9）：
 *   老的重启做法是「先 spawn 新的，自己 1.2 秒后退出」。
 *   新进程启动时探活打到【还没退干净】的旧进程 → 判定"已有实例在跑" → 自己退出。
 *   结果新旧全没了，服务真空；用户再点图标，几个进程抢端口，
 *   一路顺延到第三个端口（44159），runtime.json 指向它，点图标打开是死链。
 *
 *   现在：
 *     · 重启 = 先关自己（端口立刻释放）→ 再 spawn 带 --restart 的新进程
 *     · --restart 的新进程跳过"已有实例就退出"，并且绑定端口时重试（等旧的彻底放手）
 *     · 实例锁（instance.lock，原子创建 + PID 存活校验）挡住重复启动
 *     · 起不来时给用户一个看得见的说明页（不再是一片空白 / 死链）
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { DEFAULT_PORTS } from './ports.js';

/** runtime.json 的文件名（固定，外部组件按这个名字找） */
export const RUNTIME_FILE = 'runtime.json';

/** 实例锁文件名 */
export const LOCK_FILE = 'instance.lock';

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

/** 进程还活着吗（EPERM = 存在但没权限，也算活着） */
export function isPidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  if (n === process.pid) return true;
  try {
    process.kill(n, 0);
    return true;
  } catch (e) {
    return e && e.code === 'EPERM';
  }
}

function lockPath(dataDir) { return path.join(dataDir, LOCK_FILE); }

/** 读实例锁 */
export function readLock(dataDir) {
  try {
    return JSON.parse(fs.readFileSync(lockPath(dataDir), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 取实例锁（原子创建）。
 * 返回 { ok: true } 表示拿到；{ ok: false, holder } 表示已有活实例。
 */
export function acquireLock(dataDir, info = {}) {
  const p = lockPath(dataDir);
  const cur = readLock(dataDir);
  if (cur && isPidAlive(cur.pid)) return { ok: false, holder: cur };
  if (cur) { try { fs.unlinkSync(p); } catch { /* 残留锁，删掉 */ } }
  try {
    const fd = fs.openSync(p, 'wx');   // 'wx' = 不存在才创建，天然原子
    fs.writeSync(fd, JSON.stringify({ pid: info.pid || process.pid, port: info.port || 0, at: new Date().toISOString() }));
    fs.closeSync(fd);
    return { ok: true };
  } catch {
    // 并发竞争：别人抢先创建了
    return { ok: false, holder: readLock(dataDir) };
  }
}

/** 启动成功后把实际端口补进锁里（watchdog / 外部组件从这里读也一样准） */
export function updateLockPort(dataDir, port) {
  try {
    const cur = readLock(dataDir);
    if (!cur || cur.pid !== process.pid) return;
    fs.writeFileSync(lockPath(dataDir), JSON.stringify({ ...cur, port }));
  } catch { /* 忽略 */ }
}

/** 释放锁（只释放自己的，别把别人的删了） */
export function releaseLock(dataDir, pid = process.pid) {
  try {
    const cur = readLock(dataDir);
    if (cur && Number(cur.pid) === Number(pid)) fs.unlinkSync(lockPath(dataDir));
  } catch { /* 忽略 */ }
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
 *
 * @param {string} dataDir
 * @param {{scanPorts?: boolean}} [opts]
 *   scanPorts=false 时只认 runtime.json 那个端口。
 *   用于"用户显式指定了 --port / --data"的场景：这时扫默认端口会误伤
 *   本机另一个数据目录上正在跑的实例（2.1.9 修）。
 */
export async function existingInstance(dataDir, opts = {}) {
  const rt = readRuntime(dataDir);
  if (rt && (await probeAlive(rt.port))) {
    return rt.port;
  }
  if (opts.scanPorts === false) return 0;
  for (const p of DEFAULT_PORTS) {
    if (await probeAlive(p)) return p;
  }
  return 0;
}

/**
 * 重启自己（增量更新后让新代码生效）。
 *
 * 2.1.9 重写。老做法的两个坑：
 *   ① 先起新的、自己 1.2 秒后才退出 → 新进程探活打到旧进程，判定"已有实例"直接退出
 *   ② 新进程和旧进程同时抢同一个端口 → 顺延到 42307 / 44159，runtime.json 指向漂移端口
 *
 * 现在：先关自己（端口立刻释放）→ 再 spawn 带 --restart 的新进程
 *       --restart 让新进程跳过"已有实例就退出"，并且失败时重试绑定。
 *
 * @param {number} delayMs
 * @param {{closeServer?: Function, dataDir?: string}} opts
 */
export function scheduleRestart(delayMs = 800, opts = {}) {
  setTimeout(async () => {
    // ① 先把自己关掉：端口立刻释放，新进程才有机会绑上同一个端口
    try { await opts.closeServer?.(); } catch { /* 关不掉也要继续 */ }
    try { releaseLock(opts.dataDir); } catch { /* 忽略 */ }

    // ② 起新进程
    try {
      // 过滤掉 bun 打包版的内部路径参数（形如 B:/~BUN/root/xxx.exe），它不是真正的启动参数
      const argv = process.argv.slice(1)
        .filter((a) => typeof a === 'string' && !/~BUN[\\/]/i.test(a) && a !== '--restart');
      const child = spawn(process.execPath, [...argv, '--restart'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
    } catch { /* spawn 失败也要退出，交给 watchdog/用户下次启动 */ }

    process.exit(0);
  }, delayMs);
}

/**
 * 起不来时给用户一个看得见的说明页（2.1.9 加）。
 *
 * 为什么：GUI 子系统没有控制台，用户看到的只是"浏览器打不开"，
 * 完全不知道该怎么办，只能自己上网站重下。
 * 这里生成一个本地说明页并打开它，写清原因 + 两条出路（自动修复 / 下载最新版）。
 */
export function reportFatal({ exeDir, dataDir, reason }) {
  const lines = [];
  const at = new Date().toLocaleString('zh-CN');
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch { /* 忽略 */ }

  // ① 纯文本，方便排查
  try {
    fs.writeFileSync(
      path.join(dataDir, 'last-error.txt'),
      `时间: ${at}\n原因: ${reason}\n程序目录: ${exeDir}\n数据目录: ${dataDir}\n`,
      'utf8',
    );
  } catch { /* 忽略 */ }

  // ② 说明页
  let html = '';
  try {
    html = `<!doctype html><html lang="zh"><meta charset="utf-8">
<title>Buddy Trace 启动失败</title>
<style>
body{font-family:-apple-system,"Microsoft YaHei",sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#16211f;line-height:1.8}
h1{font-size:20px;margin-bottom:6px}
.tip{color:#4a5856;font-size:14px}
.box{background:#f4f7f6;border:1px solid #d9dee0;border-radius:10px;padding:14px 16px;margin:18px 0;font-size:14px}
code{background:#eef1f2;padding:2px 6px;border-radius:4px;font-family:Consolas,monospace;font-size:13px}
a.btn{display:inline-block;background:#08c8a0;color:#fff;text-decoration:none;padding:9px 18px;border-radius:8px;font-weight:700;font-size:14px;margin-right:10px}
ol{padding-left:20px}
</style>
<h1>Buddy Trace 没能启动</h1>
<p class="tip">时间：${at}</p>
<div class="box"><b>原因：</b>${String(reason || '').replace(/[<>&]/g, '')}</div>
<p>按顺序试这两步，通常第一步就能好：</p>
<ol>
<li><b>自动修复</b>：双击程序目录里的 <code>修复.bat</code>（会自动换个干净的代码目录再启动，<b>不影响你的记忆库数据</b>）。</li>
<li>还不行的话，到官网重新下载安装包覆盖安装：<br>
<a class="btn" href="https://buddy-trace.lbase.com" target="_blank">打开官网下载</a></li>
</ol>
<p class="tip">你的记忆库数据在 <code>${String(dataDir).replace(/[<>&]/g, '')}</code>，重装不会删它。</p>
<p class="tip">排查记录：本目录下的 <code>last-error.txt</code>。</p>
</html>`;
    const f = path.join(dataDir, 'last-error.html');
    fs.writeFileSync(f, html, 'utf8');
    lines.push(f);
  } catch { /* 忽略 */ }

  // ③ 修复脚本（放到程序目录，双击即用）
  try {
    const bat = path.join(exeDir, '修复.bat');
    fs.writeFileSync(bat, [
      '@echo off',
      'chcp 65001 >nul',
      'cd /d "%~dp0"',
      'echo 正在自动修复 Buddy Trace（不会删你的数据）...',
      'if exist "code" ren "code" "code.broken-%RANDOM%"',
      'echo 已隔离旧的代码目录，正在用内置代码启动...',
      'start "" "BuddyTrace.exe"',
      'timeout /t 3 >nul',
      'exit',
    ].join('\r\n'), 'utf8');
  } catch { /* 忽略 */ }

  return lines[0] || '';
}

