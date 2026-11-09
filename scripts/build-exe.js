/**
 * Buddy Trace · 打包脚本
 *
 * 老板要求（2026-11-04）：
 *   「压缩包安装以后，生成的图标改成这个名字」
 *   「图标得做个 logo」
 *
 * 2.0 增量更新架构（2026-11-08）：
 *   exe 是「壳」，内置完整代码做兜底，优先加载旁边的 code/ 目录。
 *   每次更新只换 code/，不用重下 110 MB 的 exe。
 *   本脚本产出两样：
 *     ① BuddyTrace.exe      壳 + 内置兜底代码
 *     ② code-<版本>.zip     可增量更新的 src/ 代码
 *
 * 用法：
 *   node scripts/build-exe.js              # 打包 Windows exe + code.zip
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
// 入口改成 shell.js：它是壳，负责「优先加载外部 code / 回退内置」
const ENTRY = path.join(ROOT, 'src', 'shell.js');
const SRC_DIR = path.join(ROOT, 'src');

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

/**
 * 打增量更新包（tar.gz）：
 * 把 src/ 整个目录打成 code-<版本>.tar.gz，tar 内路径是 src/*.js。
 * 用户端 updater 解压到 exe 旁边的 code/ 目录，得到 code/src/*.js。
 *
 * 打包用 bsdtar（Windows 10+ 自带 C:\Windows\System32\tar.exe）。
 */
function buildCodePack() {
  const out = path.join(DIST, `code-${pkg.version}.tar.gz`);
  if (fs.existsSync(out)) fs.unlinkSync(out);

  // bsdtar: --exclude 必须放在 -C 之前、被排除的模式之前
  // 排除 shell.js（exe 入口）和 *.bak（历史残留，不该进增量包）
  const args = ['--exclude', 'src/shell.js', '--exclude', '*.bak', '-czf', out, '-C', ROOT, 'src'];
  execFileSync('tar', args, { stdio: 'inherit' });

  if (!fs.existsSync(out)) throw new Error('增量包生成失败');
  const kb = (fs.statSync(out).size / 1024).toFixed(1);
  console.log(`  ✓ 增量包 code-${pkg.version}.tar.gz  ${kb} KB`);
  return out;
}

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

  // 增量更新包（只有打 win 时生成；mac/linux 暂不发布增量）
  if (which.includes('win')) {
    try {
      outs.push(buildCodePack());
    } catch (e) {
      console.error('  ✗ 增量包失败: ' + e.message);
    }
  }

  console.log('');
  console.log('  产出在: ' + DIST);
  for (const o of outs) {
    console.log('    ' + path.basename(o) + '  ' + (fs.statSync(o).size / 1024 / 1024).toFixed(1) + ' MB');
  }
}

main();
