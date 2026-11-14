/**
 * Buddy Trace · 启动器（exe 的真正入口）
 *
 * 架构（2026-11-08 老板定的 2.0 增量更新）：
 *   exe 是一个「壳」，里面内置一份完整的代码（兜底），
 *   同时优先加载 exe 旁边的 code/ 目录（可增量更新）。
 *
 *   启动顺序：
 *     ⓪ 自愈（2.1.9）：上次更新后新版本没起来 → 自动回滚到 code.bak
 *                      带 --repair 启动 → 把 code/ 隔离掉，改用内置代码
 *     ① 找 exe 旁边的 code/src/index.js
 *     ② 存在 → 用外部的（新版本，增量更新生效）
 *     ③ 不存在 / 加载失败 → 用 exe 内置的（兜底，保证能跑）
 *
 * 为什么 2026-11-14 加自愈（老板实测踩坑）：
 *   更新流程原来是"解压成功就删掉备份"，一旦新版本启动就崩，
 *   既没有可回滚的东西，用户也看不到任何提示，只能自己上网站重下。
 *   现在：备份留到"启动成功"才删（confirmBoot），没成功下次启动自动回滚。
 */

import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const exeDir = path.dirname(process.execPath);
const externalEntry = path.join(exeDir, 'code', 'src', 'index.js');
const codeDir = path.join(exeDir, 'code');
const bakDir = path.join(exeDir, 'code.bak');
const pendingFile = path.join(exeDir, 'boot-pending.json');

function log(msg) {
  try {
    const logDir = path.join(exeDir, 'data', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'shell.log'), `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* 日志写不了就算了 */ }
}

/**
 * 自愈：处理"上次更新后新版本没起来"和"--repair"两种情况。
 */
function selfHeal() {
  // ① --repair：把坏掉的 code/ 隔离掉，这次用内置代码启动
  if (process.argv.includes('--repair')) {
    try {
      if (fs.existsSync(codeDir)) {
        const broken = path.join(exeDir, `code.broken-${Date.now()}`);
        fs.renameSync(codeDir, broken);
        log(`--repair：已隔离 code/ → ${path.basename(broken)}，改用内置代码启动`);
      }
      try { fs.rmSync(pendingFile, { force: true }); } catch { /* 忽略 */ }
    } catch (e) {
      log(`--repair 失败: ${e && e.message}`);
    }
    return;
  }

  // ② 回滚：boot-pending 还在，说明"更新完没确认启动成功"
  let st = null;
  try { st = JSON.parse(fs.readFileSync(pendingFile, 'utf8')); } catch { st = null; }
  if (!st) return;

  const age = Date.now() - Number(st.at || 0);
  // 20 秒宽限：正常更新后新进程几秒内就会起来并把标记删掉
  if (age <= 20000) return;

  if (!fs.existsSync(bakDir)) {
    log(`新版本（${st.version || '?'}）未确认启动，但没有可回滚的备份，放弃回滚`);
    try { fs.rmSync(pendingFile, { force: true }); } catch { /* 忽略 */ }
    return;
  }
  try {
    fs.rmSync(codeDir, { recursive: true, force: true });
    fs.cpSync(bakDir, codeDir, { recursive: true });
    fs.rmSync(bakDir, { recursive: true, force: true });
    fs.rmSync(pendingFile, { force: true });
    log(`新版本（${st.version || '?'}）未确认启动，已自动回滚到上一版`);
  } catch (e) {
    log(`自动回滚失败: ${e && e.message}`);
  }
}

async function main() {
  selfHeal();

  // 优先加载外部 code（增量更新的代码）
  if (fs.existsSync(externalEntry)) {
    try {
      await import(pathToFileURL(externalEntry).href);
      return;   // 外部代码跑起来了，壳的使命结束
    } catch (e) {
      // 外部代码损坏（语法错 / 少文件 / 被杀毒删了一半）
      // 不打印到控制台（GUI 子系统没有控制台），写进日志
      log(`外部 code 加载失败，回退内置: ${e && e.message}`);
    }
  }

  // 兜底：用内置代码（这个 import 会被 bun 打进 exe）
  await import('./index.js');
}

main().catch((e) => {
  log(`启动失败: ${e && e.message}`);
  process.exit(1);
});
