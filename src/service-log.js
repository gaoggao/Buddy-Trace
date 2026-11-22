/**
 * Buddy Trace · 服务日志（3.0.4）
 *
 * 为什么：打包成 exe 后没有控制台，console.log 全部丢失。
 * 之前服务卡死/假死时没有任何现场可查（watchdog.log 停在 11-05，
 * service.log 从没生成）。老板 2026-11-22 要求"出问题能查到原因"。
 *
 * 记什么：启动 / 每次同步（耗时、来源 worker 还是主线程、新增数）/ 健康探测失败。
 * 写到 <dataDir>/logs/service.log，每 1000 行自动截断，避免无限增长。
 */

import fs from 'node:fs';
import path from 'node:path';

let logDir = null;
let logFile = null;
const MAX_LINES = 1000;

export function initServiceLog(dataDir) {
  try {
    logDir = path.join(dataDir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    logFile = path.join(logDir, 'service.log');
  } catch { /* 日志不可用不影响服务 */ }
}

export function svcLog(msg) {
  if (!logFile) return;
  try {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    // 简单截断：超过 MAX_LINES 行就只留后半
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) {
        const txt = fs.readFileSync(logFile, 'utf8').split('\n');
        fs.writeFileSync(logFile, txt.slice(-Math.floor(MAX_LINES / 2)).join('\n'));
      }
    } catch { /* 首次写，没有文件 */ }
    fs.appendFileSync(logFile, line, 'utf8');
  } catch { /* 写不了就算了，绝不让日志拖垮服务 */ }
}
