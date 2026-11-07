/**
 * Buddy Trace · 打包脚本
 *
 * 老板要求（2026-11-04）：
 *   「压缩包安装以后，生成的图标改成这个名字」
 *   「图标得做个 logo」
 *
 * 产出：一个单文件 exe，双击就跑，不需要用户装 Node.js。
 *
 * 用法：
 *   node scripts/build-exe.js              # 打包 Windows exe
 *   node scripts/build-exe.js --all        # 打全部平台
 *   node scripts/build-exe.js --no-icon    # 不打图标（调试用）
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIST = path.join(ROOT, 'dist');
const ICON = path.join(ROOT, 'assets', 'logo.ico');
const ENTRY = path.join(ROOT, 'src', 'index.js');

/** bun 可执行文件位置（spawn 需要绝对路径，bun.cmd 不行） */
function findBun() {
  const candidates = [
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'bun', 'bin', 'bun.exe'),
    path.join(process.env.USERPROFILE || '', '.bun', 'bin', 'bun.exe'),
    'bun.exe',
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* ignore */ }
  }
  return 'bun';
}
const BUN = findBun();

/** 版本号从 package.json 读 */
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/** 目标平台 */
const TARGETS = {
  win: { flag: 'bun-windows-x64', out: 'BuddyTrace.exe' },
  mac: { flag: 'bun-darwin-arm64', out: 'BuddyTrace-macos-arm64' },
  macx: { flag: 'bun-darwin-x64', out: 'BuddyTrace-macos-x64' },
  linux: { flag: 'bun-linux-x64', out: 'BuddyTrace-linux-x64' },
};

function build(which) {
  const t = TARGETS[which];
  if (!t) throw new Error('未知目标: ' + which);

  const out = path.join(DIST, t.out);
  if (fs.existsSync(out)) fs.unlinkSync(out);

  const args = ['build', '--compile', '--target=' + t.flag, ENTRY, '--outfile', out];

  // Windows 专属：图标、隐藏控制台、版本信息
  if (which === 'win') {
    if (fs.existsSync(ICON)) args.push('--windows-icon=' + ICON);
    args.push('--windows-hide-console');
    args.push('--windows-title=Buddy Trace');
    args.push('--windows-description=WorkBuddy 会话记忆备份与追溯');
    args.push('--windows-version=' + (pkg.version || '0.1.0') + '.0');
    args.push('--windows-publisher=Buddy Trace');
  }

  console.log('  打包 ' + which + ' → ' + t.out);
  const t0 = Date.now();
  execFileSync(BUN, args, { cwd: ROOT, stdio: 'inherit' });
  const ms = Date.now() - t0;

  if (!fs.existsSync(out)) throw new Error('打包失败，没有产出文件');

  const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
  console.log('  ✓ ' + t.out + '  ' + mb + ' MB  (' + (ms / 1000).toFixed(1) + 's)');
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const all = argv.includes('--all');

  fs.mkdirSync(DIST, { recursive: true });

  console.log('  Buddy Trace 打包');
  console.log('  版本: ' + pkg.version);
  console.log('  图标: ' + (fs.existsSync(ICON) ? ICON : '（没有，用默认）'));
  console.log('');

  const outs = [];
  const which = all ? Object.keys(TARGETS) : ['win'];
  for (const w of which) {
    try {
      outs.push(build(w));
    } catch (e) {
      console.error('  ✗ ' + w + ' 失败: ' + e.message);
    }
  }

  console.log('');
  console.log('  产出在: ' + DIST);
  for (const o of outs) {
    console.log('    ' + path.basename(o) + '  ' + (fs.statSync(o).size / 1024 / 1024).toFixed(1) + ' MB');
  }
}

main();
