/**
 * Buddy Trace · 增量更新（updater）
 *
 * 2.0 架构（2026-11-08 老板定）：
 *   exe 是壳（内置兜底代码），真正的业务代码在 exe 旁边的 code/ 目录。
 *   增量更新只换 code/ 目录，不用重下 110 MB 的 exe。
 *
 * 更新流程：
 *   ① checkUpdate：拉云端 remote.json，比对 version 字段和本地版本
 *   ② applyUpdate：用户点「更新」后——
 *       下载 code-<ver>.tar.gz → 校验 sha256 → 备份 code → code.bak
 *       → 解压覆盖 code → 返回成功/失败
 *   ③ rollback：更新失败或新版本起不来时，把 code.bak 换回 code
 *
 * 安全：
 *   · 只操作 code/ 目录，绝不碰 data/ 和 WorkBuddy 的文件
 *   · 备份只留一份（code.bak），回滚后再备份会覆盖
 *   · 下载用 https，校验 sha256，防止篡改和损坏
 *
 * 纯 Node 内置模块实现（zlib + 手写 tar 解析），不引入第三方依赖。
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import https from 'node:https';
import http from 'node:http';
import { VERSION } from './version.js';

// 云端源（跟 remote.js 一致：Gitee 优先，GitHub 兜底）
const SOURCES = [
  { name: 'gitee', base: 'https://gitee.com/gaogao2013/Buddy-Trace/raw/master' },
  { name: 'github', base: 'https://raw.githubusercontent.com/gaoggao/Buddy-Trace/main' },
];

const TIMEOUT_MS = 60000;   // 下载超时（增量包不大，60 秒足够）

/** 请求并跟随重定向，返回 Buffer */
function requestBuf(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('重定向过多'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      timeout: TIMEOUT_MS,
      headers: { 'User-Agent': 'BuddyTrace/' + VERSION },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(requestBuf(new URL(res.headers.location, url).toString(), redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('http ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('下载超时')); });
    req.on('error', reject);
  });
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** 下载并解析 cloud remote.json（跟随重定向） */
async function fetchRemoteConfig() {
  for (const s of SOURCES) {
    try {
      const buf = await requestBuf(s.base + '/remote.json');
      const j = JSON.parse(buf.toString('utf8'));
      if (j && (j.version || j.code)) return j;
    } catch { /* 试下一个源 */ }
  }
  return null;
}

/**
 * 检测是否有新版本。
 * @param {string} dataDir
 * @returns {Promise<{hasUpdate:boolean, remoteVersion:string|null, localVersion:string, notes:string, cfg:object|null}>}
 */
export async function checkUpdate(dataDir) {
  const cfg = await fetchRemoteConfig();
  if (!cfg || !cfg.version) {
    return { hasUpdate: false, remoteVersion: null, localVersion: VERSION, notes: '', cfg: null };
  }
  const remoteVersion = String(cfg.version);
  const hasUpdate = compareVersion(remoteVersion, VERSION) > 0;
  return {
    hasUpdate,
    remoteVersion,
    localVersion: VERSION,
    notes: cfg.notes || '',
    cfg,
  };
}

/** 版本号比较：'2.1.0' vs '2.0.0' → 1（大于） */
function compareVersion(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n || '0', 10));
  const pb = String(b).split('.').map((n) => parseInt(n || '0', 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}

/**
 * 执行更新。返回 { ok, error? }。
 *
 * 步骤（任何一步失败都会回滚，保证 code 目录可用）：
 *   ① 下载 code-<ver>.tar.gz
 *   ② 校验 sha256（云端 remote.json 给 sha256 才校验）
 *   ③ 备份 code → code.bak（删掉旧的 code.bak）
 *   ④ 解压覆盖 code
 *   ⑤ 成功 → 删除 code.bak
 *   ⑥ 失败 → code.bak 换回 code
 */
/**
 * 判断当前是不是"打包版"（bun 编译的 exe）。
 * 增量更新只对 exe 版有意义：它才有旁边的 code/ 目录可更新。
 * 开发模式（node src/index.js）下 process.execPath 是 node.exe，
 * 若误触发更新会把 code 目录写到 node 安装目录，所以这里直接拒绝。
 */
function isPackaged() {
  const execName = path.basename(process.execPath).toLowerCase();
  return execName.endsWith('.exe') && execName !== 'node.exe';
}

export async function applyUpdate(dataDir, cfg = null) {
  if (!isPackaged()) {
    return { ok: false, error: '增量更新只在安装版（exe）下可用，开发模式请直接改源码' };
  }
  const exeDir = path.dirname(process.execPath);
  const codeDir = path.join(exeDir, 'code');
  const bakDir = path.join(exeDir, 'code.bak');

  if (!cfg) cfg = await fetchRemoteConfig();
  if (!cfg || !cfg.version || !cfg.code) {
    return { ok: false, error: '云端没有可用的更新信息' };
  }

  let buf = null;

  // ① 下载
  for (const s of SOURCES) {
    try {
      buf = await requestBuf(s.base + '/' + cfg.code);
      if (buf && buf.length > 0) break;
    } catch { /* 试下一个源 */ }
  }
  if (!buf || buf.length === 0) {
    return { ok: false, error: '下载失败，两个源都连不上' };
  }

  // ② 校验 sha256
  if (cfg.sha256) {
    const got = sha256(buf);
    if (got !== String(cfg.sha256).toLowerCase()) {
      return { ok: false, error: '校验失败：文件不完整或被篡改' };
    }
  }

  // ③ 备份
  try {
    fs.rmSync(bakDir, { recursive: true, force: true });
    if (fs.existsSync(codeDir)) {
      fs.cpSync(codeDir, bakDir, { recursive: true });
    }
  } catch (e) {
    return { ok: false, error: '备份旧代码失败: ' + e.message };
  }

  // ④ 解压覆盖
  try {
    extractTarGz(buf, path.dirname(codeDir));   // 解压到 exe 目录，得到 code/src/...
  } catch (e) {
    // 解压失败 → 回滚
    try { fs.rmSync(codeDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
    try { if (fs.existsSync(bakDir)) fs.cpSync(bakDir, codeDir, { recursive: true }); } catch { /* 忽略 */ }
    return { ok: false, error: '解压失败，已回滚: ' + e.message };
  }

  // ⑤ 成功，删备份
  try { fs.rmSync(bakDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
  return { ok: true, version: cfg.version };
}

/** 回滚到上一版：code.bak → code */
export function rollback(dataDir) {
  if (!isPackaged()) {
    return { ok: false, error: '回滚只在安装版（exe）下可用' };
  }
  const exeDir = path.dirname(process.execPath);
  const codeDir = path.join(exeDir, 'code');
  const bakDir = path.join(exeDir, 'code.bak');

  if (!fs.existsSync(bakDir)) {
    return { ok: false, error: '没有可回滚的备份' };
  }
  try {
    fs.rmSync(codeDir, { recursive: true, force: true });
    fs.cpSync(bakDir, codeDir, { recursive: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: '回滚失败: ' + e.message };
  }
}

/** 备份是否存在（前端用来决定是否显示「回滚」按钮） */
export function hasBackup() {
  if (!isPackaged()) return false;
  const exeDir = path.dirname(process.execPath);
  return fs.existsSync(path.join(exeDir, 'code.bak'));
}

/**
 * 解 tar.gz。只支持普通文件和目录（tar 格式 type '0' 和 '5'），
 * 不支持符号链接（我们的 code 包用不到，遇到就跳过）。
 *
 * tar 头 512 字节：name[0..100) size[124..136) type[156] data 补 512 对齐。
 */
function extractTarGz(gzBuf, destRoot) {
  const tarBuf = zlib.gunzipSync(gzBuf);
  let off = 0;
  while (off + 512 <= tarBuf.length) {
    const block = tarBuf.subarray(off, off + 512);
    if (block.every((b) => b === 0)) break;   // 两个零块结束，一个就够

    const name = readTarStr(block, 0, 100);
    const size = parseInt(readTarStr(block, 124, 12) || '0', 8) || 0;
    const type = String.fromCharCode(block[156]) || '0';

    off += 512;
    if (type === '0' || type === '\0') {
      // 普通文件
      const data = tarBuf.subarray(off, off + size);
      const target = path.join(destRoot, name.replace(/^\//, ''));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
    }
    // 目录（type '5'）不需要单独建，写文件时 mkdir 已建
    off += Math.ceil(size / 512) * 512;
  }
}

function readTarStr(block, offset, len) {
  let end = offset;
  while (end < offset + len && block[end] !== 0) end++;
  return block.subarray(offset, end).toString('utf8');
}
