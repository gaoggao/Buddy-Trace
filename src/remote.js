/**
 * 远程内容下发（Remote Config）
 *
 * 老板 2026-11-07 定的核心机制：
 *   「发布以后需要一个跟用户页面沟通的机制。有了这个机制，
 *     后期改什么东西，就可以用自动/手动更新的方式跟用户交互，
 *     新内容就能发送到用户部署的客户端上。」
 *
 * 实现：
 *   · 云端（Gitee + GitHub）放 remote.json（配置）+ 二维码图片等资源
 *   · 本服务启动时/定期从云端拉取，缓存到 data/remote/
 *   · 拉不到就用本地缓存（断网兜底）
 *   · 双源：Gitee 优先（国内快），GitHub 兜底
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import crypto from 'node:crypto';

const SOURCES = [
  { name: 'gitee', base: 'https://gitee.com/gaogao2013/Buddy-Trace/raw/master' },
  { name: 'github', base: 'https://raw.githubusercontent.com/gaoggao/Buddy-Trace/main' },
];

const TIMEOUT_MS = 15000;

/** 请求 URL（支持跟随重定向 —— Gitee raw 有签名重定向机制） */
function requestUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      timeout: TIMEOUT_MS,
      headers: { 'User-Agent': 'BuddyTrace/1.0' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(requestUrl(next, redirects + 1));
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
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

async function fetchJson(url) {
  const buf = await requestUrl(url);
  return JSON.parse(buf.toString('utf8'));
}

/**
 * 检测云端是否有新内容（只拉 remote.json 算哈希，不下载图片、不更新缓存）。
 *
 * 老板 2026-11-07 定：
 *   「我们有了新内容，用户客户端应该弹出来『有新内容』，要求用户点击更新。
 *     不是用户主动点，是我们弹出来他再点，他有权选更新/不更新。」
 *
 * 所以这里只【检测】，更新动作由 applyRemoteUpdate 在用户点「更新」后执行。
 *
 * @returns {Promise<{hasUpdate: boolean, cfg: object|null}>}
 */
export async function checkRemoteUpdate(dataDir) {
  let cfg = null;
  for (const s of SOURCES) {
    try {
      cfg = await fetchJson(s.base + '/remote.json');
      if (cfg && cfg.qr) break;
    } catch (e) { /* 试下一个源 */ }
  }
  if (!cfg) return { hasUpdate: false, cfg: null };   // 双源都失败

  const newHash = hashOf(JSON.stringify(cfg));
  const oldHash = readCachedHash(dataDir);
  return { hasUpdate: newHash !== oldHash, cfg };
}

/**
 * 执行更新：拉 remote.json + 图片，写进本地缓存。
 * 用户在弹窗里点「更新」后才调这里。
 */
export async function applyRemoteUpdate(dataDir) {
  const dir = path.join(dataDir, 'remote');
  fs.mkdirSync(dir, { recursive: true });

  let cfg = null;
  for (const s of SOURCES) {
    try {
      cfg = await fetchJson(s.base + '/remote.json');
      if (cfg && cfg.qr) break;
    } catch (e) { /* 试下一个源 */ }
  }
  if (!cfg) return { ok: false };

  // 下载图片
  if (cfg.qr && cfg.qr.image) {
    const img = path.basename(cfg.qr.image);
    for (const s of SOURCES) {
      try {
        const buf = await requestUrl(s.base + '/' + img);
        fs.writeFileSync(path.join(dir, img), buf);
        break;
      } catch (e) { /* 试下一个源 */ }
    }
  }

  // 更新缓存
  fs.writeFileSync(path.join(dir, 'remote.json'), JSON.stringify(cfg, null, 2));

  return { ok: true, cfg };
}

function hashOf(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function readCachedHash(dataDir) {
  try {
    const raw = fs.readFileSync(path.join(dataDir, 'remote', 'remote.json'), 'utf8');
    return hashOf(JSON.stringify(JSON.parse(raw)));
  } catch {
    return null;
  }
}

/** 读本地缓存的远程配置（断网兜底） */
export function readCachedRemote(dataDir) {
  try {
    const raw = fs.readFileSync(path.join(dataDir, 'remote', 'remote.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 读本地缓存的远程图片（二维码等） */
export function readRemoteImage(dataDir, file) {
  const safe = path.basename(file || '');
  if (!safe) return null;
  try {
    return fs.readFileSync(path.join(dataDir, 'remote', safe));
  } catch {
    return null;
  }
}
