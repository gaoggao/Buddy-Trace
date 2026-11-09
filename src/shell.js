/**
 * Buddy Trace · 启动器（exe 的真正入口）
 *
 * 架构（2026-11-08 老板定的 2.0 增量更新）：
 *   exe 是一个「壳」，里面内置一份完整的代码（兜底），
 *   同时优先加载 exe 旁边的 code/ 目录（可增量更新）。
 *
 *   启动顺序：
 *     ① 找 exe 旁边的 code/src/index.js
 *     ② 存在 → 用外部的（新版本，增量更新生效）
 *     ③ 不存在 / 加载失败 → 用 exe 内置的（兜底，保证能跑）
 *
 * 为什么这么设计：
 *   · 增量更新只换 code/ 目录，不用重下 110 MB 的 exe
 *   · code/ 被杀毒软件删了、更新到一半断电损坏，exe 内置代码还能兜底启动
 *   · exe 本身不频繁变动，减少杀毒软件反复误报
 */

import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const exeDir = path.dirname(process.execPath);
const externalEntry = path.join(exeDir, 'code', 'src', 'index.js');

async function main() {
  // 优先加载外部 code（增量更新的代码）
  if (fs.existsSync(externalEntry)) {
    try {
      await import(pathToFileURL(externalEntry).href);
      return;   // 外部代码跑起来了，壳的使命结束
    } catch (e) {
      // 外部代码损坏（语法错 / 少文件 / 被杀毒删了一半）
      // 不打印到控制台（GUI 子系统没有控制台），写进日志目录
      try {
        const logDir = path.join(exeDir, 'data', 'logs');
        fs.mkdirSync(logDir, { recursive: true });
        fs.appendFileSync(
          path.join(logDir, 'shell.log'),
          `[${new Date().toISOString()}] 外部 code 加载失败，回退内置: ${e && e.message}\n`,
        );
      } catch { /* 日志写不了就算了 */ }
    }
  }

  // 兜底：用内置代码（这个 import 会被 bun 打进 exe）
  await import('./index.js');
}

main().catch((e) => {
  try {
    const logDir = path.join(exeDir, 'data', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, 'shell.log'),
      `[${new Date().toISOString()}] 启动失败: ${e && e.message}\n`,
    );
  } catch { /* 忽略 */ }
  process.exit(1);
});
