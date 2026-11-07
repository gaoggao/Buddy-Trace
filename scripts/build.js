#!/usr/bin/env node
/**
 * 打包脚本：生成单文件可执行程序
 *
 * 用法：
 *   node scripts/build.js            # 当前平台
 *   node scripts/build.js win        # Windows
 *   node scripts/build.js mac        # macOS
 *   node scripts/build.js linux      # Linux
 *
 * 依赖：bun（用 npm i -g bun 安装）
 * 为什么用 bun：一条命令产出单文件，无需手动组装 Node SEA 的 blob/postject 流程。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const TARGETS = {
  win: [
    { target: 'bun-windows-x64', out: 'lbase-windows-x64.exe' },
  ],
  mac: [
    { target: 'bun-darwin-arm64', out: 'lbase-macos-arm64' },
    { target: 'bun-darwin-x64', out: 'lbase-macos-x64' },
  ],
  linux: [
    { target: 'bun-linux-x64', out: 'lbase-linux-x64' },
    { target: 'bun-linux-arm64', out: 'lbase-linux-arm64' },
  ],
};

function platformKey() {
  if (process.platform === 'win32') return 'win';
  if (process.platform === 'darwin') return 'mac';
  return 'linux';
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
}

function main() {
  const key = process.argv[2] || platformKey();
  const targets = TARGETS[key];
  if (!targets) {
    console.error(`未知平台: ${key}（可选 win / mac / linux）`);
    process.exit(1);
  }

  // 1. 先内嵌界面资源（否则 exe 里没有界面）
  console.log('[1/3] 内嵌界面资源…');
  run(process.execPath, ['scripts/embed-ui.js']);

  // 2. 检查 bun
  console.log('[2/3] 检查打包工具…');
  try {
    execFileSync('bun', ['--version'], { stdio: 'pipe' });
  } catch {
    console.error('  ✗ 未找到 bun。安装：npm i -g bun');
    process.exit(1);
  }

  // 3. 打包
  fs.mkdirSync(DIST, { recursive: true });
  console.log('[3/3] 打包…');
  for (const t of targets) {
    const out = path.join(DIST, t.out);
    console.log(`  → ${t.out}`);
    try {
      run('bun', ['build', 'src/index.js', '--compile', `--target=${t.target}`, `--outfile=${out}`]);
      const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
      console.log(`    ✓ ${mb} MB`);
    } catch (e) {
      console.error(`    ✗ 失败: ${e.message}`);
    }
  }

  console.log('\n完成。产物在 dist/');
  console.log('提示：单文件体积约 100 MB，因为内含完整运行时。用户不需要安装任何依赖。');
}

main();
