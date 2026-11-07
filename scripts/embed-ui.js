#!/usr/bin/env node
/**
 * 把 public/ 下的界面文件内嵌进 src/assets.js
 *
 * 为什么需要：打包成单文件可执行程序时，外部文件不会被打包，
 * 导致 exe 版界面 404。内嵌后无论从源码跑还是 exe 跑，界面都正常。
 *
 * 用法：node scripts/embed-ui.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'src', 'assets.js');

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

function walk(dir, base = '') {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    // base 为空时 rel = '/name'；否则 rel = '/base/name'
    const relPath = base ? `${base}/${name}` : name;
    const rel = '/' + relPath;
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full, relPath));
    } else {
      out.push({ full, rel });
    }
  }
  return out;
}

const files = walk(PUBLIC);
const entries = {};

for (const f of files) {
  const ext = path.extname(f.rel).toLowerCase();
  const raw = fs.readFileSync(f.full);

  // 文本文件存字符串，二进制存 base64
  const isText = ['.html', '.css', '.js', '.json', '.svg'].includes(ext);
  entries[f.rel] = {
    mime: MIME[ext] || 'application/octet-stream',
    encoding: isText ? 'utf8' : 'base64',
    content: isText ? raw.toString('utf8') : raw.toString('base64'),
  };
}

const js = `/**
 * 自动生成，请勿手动修改。
 * 生成命令：node scripts/embed-ui.js
 *
 * 把 public/ 下的界面文件内嵌进来，供单文件可执行程序使用。
 * 生成时间：${new Date().toISOString()}
 * 文件数：${Object.keys(entries).length}
 */

export const EMBEDDED = ${JSON.stringify(entries, null, 2)};
`;

fs.writeFileSync(OUT, js, 'utf8');

const sizeKB = (Buffer.byteLength(js) / 1024).toFixed(1);
console.log(`✓ 已生成 ${path.relative(ROOT, OUT)}`);
console.log(`  内嵌 ${Object.keys(entries).length} 个文件，${sizeKB} KB`);
for (const rel of Object.keys(entries)) {
  console.log(`    ${rel}`);
}
