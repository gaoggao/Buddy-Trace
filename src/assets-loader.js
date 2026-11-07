/**
 * 界面静态资源
 *
 * 为什么要内嵌：
 * 打包成单文件可执行程序时，外部文件（public/ 目录）不会被打包进去，
 * 导致 exe 版界面 404。把 HTML/CSS/JS 以字符串形式内嵌，
 * 无论从源码跑还是从 exe 跑，界面都能正常显示。
 *
 * 构建脚本 scripts/embed-ui.js 会把 public/ 下的文件读进来生成 assets.js。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 构建时生成的 assets.js 存在则用内嵌版本，否则从磁盘读（开发时）
let EMBEDDED = null;
try {
  const mod = await import('./assets.js');
  EMBEDDED = mod.EMBEDDED || null;
} catch {
  EMBEDDED = null;
}

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const contentCache = new Map();

/**
 * 读取静态资源内容
 * @param {string} relPath 例如 '/index.html' 或 '/ui/app.js'
 * @returns {{body: Buffer|string, mime: string} | null}
 */
export function readAsset(relPath) {
  let rel = relPath === '/' ? '/index.html' : relPath;
  if (rel.includes('..')) return null;

  // 1. 优先用内嵌资源（exe 环境）
  if (EMBEDDED && EMBEDDED[rel]) {
    const hit = EMBEDDED[rel];

    // ── 关键：二进制资源（png/ico/woff2）内嵌时存的是 base64，
    //    必须解码成 Buffer，否则浏览器收到的是一串 base64 文本，
    //    显示成"破碎的图片"（2026-11-04 踩过）
    let body = hit.content;
    if (hit.encoding === 'base64') {
      body = Buffer.from(hit.content, 'base64');
    }

    return { body, mime: hit.mime || guessMime(rel) };
  }

  // 2. 开发环境从磁盘读
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) return null;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;

  if (!contentCache.has(file)) {
    contentCache.set(file, fs.readFileSync(file));
  }
  return { body: contentCache.get(file), mime: guessMime(rel) };
}

/** SPA 兜底：非资源路径返回 index.html */
export function readIndexHtml() {
  return readAsset('/index.html');
}

export function guessMime(p) {
  return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
}

export function hasEmbedded() {
  return Boolean(EMBEDDED);
}
