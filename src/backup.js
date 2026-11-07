/**
 * Buddy Trace · 备份（增强版：不依赖 tar 也能工作）
 *
 * ── 老板的提醒（2026-11-05）──
 *
 *   「你要充分考虑到用户的电脑上，有可能缺少一些相应的依赖或者系统文件。
 *     我这测试的好用，不一定用户测试的也好用。」
 *
 * ── 原来只用 tar 的问题 ──
 *
 *   tar.exe 只在 Windows 10 1803+ / 11 / Server 2016+ 自带
 *   · Windows 7/8/8.1 没有
 *   · Windows Server 2012 可能没有
 *   · 某些精简版系统被删掉了
 *   · 某些安全软件会拦 tar
 *     ↓
 *   备份功能直接失败
 *
 * ── 现在的三层保障 ──
 *
 *   ① 首选 tar（最快，系统自带）
 *   ② tar 不行 → 用纯 JS 打 ZIP（自己实现，零依赖）
 *   ③ 都不行 → 打未压缩的 .tar（至少能存下来）
 *
 * 纯 JS ZIP 实现：用 zlib.deflateRawSync 压缩，手写 ZIP 格式
 * （ZIP 格式很简单：本地文件头 + 数据 + 中央目录）
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/** 默认配置 */
const DEFAULTS = {
  dir: '',
  weekly: true,
  keepMonths: 3,
  lastAt: '',
};

const NAME_PREFIX = 'buddy-trace-backup-';

/**
 * 读备份配置
 */
export function getBackupConfig(dataDir) {
  const cfgPath = path.join(dataDir, 'config.json');
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch { /* 用默认 */ }

  const b = (cfg && cfg.backup) || {};
  return {
    dir: b.dir || path.join(dataDir, 'backup'),
    weekly: b.weekly !== undefined ? Boolean(b.weekly) : DEFAULTS.weekly,
    keepMonths: Number(b.keepMonths) > 0 ? Number(b.keepMonths) : DEFAULTS.keepMonths,
    lastAt: b.lastAt || '',
    isDefaultDir: !b.dir,
  };
}

/**
 * 存备份配置
 */
export function saveBackupConfig(dataDir, patch) {
  const cfgPath = path.join(dataDir, 'config.json');
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch { /* 忽略 */ }

  cfg.backup = Object.assign({}, cfg.backup || {}, patch);
  if (cfg.backup.dir === '') delete cfg.backup.dir;

  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
  return getBackupConfig(dataDir);
}

/**
 * 列出所有备份包
 */
export function listBackups(dir) {
  const out = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.startsWith(NAME_PREFIX)) continue;
      if (!/\.(zip|tar)$/.test(f)) continue;
      const p = path.join(dir, f);
      let st;
      try { st = fs.statSync(p); } catch { continue; }
      out.push({
        name: f,
        path: p,
        size: st.size,
        at: f.slice(NAME_PREFIX.length).replace(/\.(zip|tar)$/, '').replace(/-/g, ':').replace('T', ' '),
      });
    }
  } catch { /* 目录不存在 */ }

  out.sort((a, b) => (a.name < b.name ? 1 : -1));
  return out;
}

// ══════════════════════════════════════════════════════════════
// 纯 JS ZIP 实现（不依赖 tar.exe）
// ══════════════════════════════════════════════════════════════

/**
 * 收集目录下所有文件（递归）
 *
 * @returns {Array<{rel: string, abs: string, isDir: boolean}>}
 */
function walkDir(root, excludeDirs = []) {
  const out = [];
  const rootAbs = path.resolve(root);

  function walk(dir, relBase) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const rel = relBase ? relBase + '/' + e.name : e.name;

      // 排除指定目录（比如 backup 自己）
      if (e.isDirectory() && excludeDirs.some((x) => rel === x || rel.startsWith(x + '/'))) {
        continue;
      }

      if (e.isDirectory()) {
        out.push({ rel: rel + '/', abs, isDir: true });
        walk(abs, rel);
      } else if (e.isFile()) {
        let st;
        try { st = fs.statSync(abs); } catch { continue; }
        out.push({ rel, abs, isDir: false, size: st.size, mtime: st.mtime });
      }
    }
  }

  walk(rootAbs, '');
  return out;
}

/**
 * 手写 ZIP 文件
 *
 * ZIP 结构：
 *   ① 每个文件：本地文件头 + 数据
 *   ② 最后：中央目录（记录所有文件的位置）
 *   ③ 结尾：EOCD（中央目录结束标记）
 *
 * 参考：PKWARE APPNOTE.TXT 4.3.7
 */
function writeZip(outPath, rootDir, excludeDirs = []) {
  const entries = walkDir(rootDir, excludeDirs);
  const baseName = path.basename(path.resolve(rootDir));

  const chunks = [];
  const centralDir = [];
  let offset = 0;

  // DOS 时间格式
  function dosTime(d) {
    const date = d || new Date();
    const time = ((date.getHours() & 0x1f) << 11) |
                 ((date.getMinutes() & 0x3f) << 5) |
                 ((Math.floor(date.getSeconds() / 2)) & 0x1f);
    const day = (((date.getFullYear() - 1980) & 0x7f) << 9) |
                ((date.getMonth() + 1) << 5) |
                (date.getDate() & 0x1f);
    return { time, day };
  }

  for (const e of entries) {
    // ZIP 里的路径：以 data/ 开头（解压出来是 data 目录）
    const zipName = baseName + '/' + e.rel;

    let data = Buffer.alloc(0);
    let method = 0;   // 0 = 不压缩
    let crc = 0;
    let compressed = Buffer.alloc(0);

    if (!e.isDir) {
      try {
        data = fs.readFileSync(e.abs);
      } catch { continue; }

      // CRC32
      crc = crc32(data);

      // 尝试 deflate 压缩（小于 4KB 的不压，省事）
      if (data.length > 4096) {
        try {
          compressed = zlib.deflateRawSync(data, { level: 6 });
          if (compressed.length < data.length * 0.9) {
            method = 8;   // deflate
          } else {
            compressed = data;
            method = 0;
          }
        } catch {
          compressed = data;
          method = 0;
        }
      } else {
        compressed = data;
      }
    }

    const payload = e.isDir ? Buffer.alloc(0) : compressed;
    const dt = dosTime(e.mtime);

    // ⚠ ZIP 规范里"文件名长度"是【字节数】，不是 JS 字符数
    // （2026-11-05 踩过：中文文件名时 zipName.length=20，
    //   Buffer.from(...,'utf8').length=28，少写 8 字节 →
    //   中央目录错位 → zipfile 报 "unexpected end of data"）
    const nameBuf = Buffer.from(zipName, 'utf8');
    const nameLen = nameBuf.length;

    // ── 本地文件头（30 字节 + 文件名）──
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);      // 签名
    local.writeUInt16LE(20, 4);              // 需要版本 2.0
    local.writeUInt16LE(0x0800, 6);          // 标志：UTF-8 文件名
    local.writeUInt16LE(method, 8);          // 压缩方法
    local.writeUInt16LE(dt.time, 10);        // 修改时间
    local.writeUInt16LE(dt.day, 12);         // 修改日期
    local.writeUInt32LE(crc, 14);            // CRC32
    local.writeUInt32LE(payload.length, 18); // 压缩后大小
    local.writeUInt32LE(e.isDir ? 0 : data.length, 22);  // 原始大小
    local.writeUInt16LE(nameLen, 26);        // 文件名长度（字节数）
    local.writeUInt16LE(0, 28);              // 扩展字段长度

    chunks.push(local, nameBuf, payload);

    // ── 中央目录项（46 字节 + 文件名）──
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);         // 签名
    cd.writeUInt16LE(20, 4);                 // 创建版本
    cd.writeUInt16LE(20, 6);                 // 需要版本
    cd.writeUInt16LE(0x0800, 8);             // 标志
    cd.writeUInt16LE(method, 10);            // 压缩方法
    cd.writeUInt16LE(dt.time, 12);
    cd.writeUInt16LE(dt.day, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(payload.length, 20);
    cd.writeUInt32LE(e.isDir ? 0 : data.length, 24);
    cd.writeUInt16LE(nameLen, 28);            // 文件名长度（字节数）
    cd.writeUInt16LE(0, 30);                 // 扩展字段
    cd.writeUInt16LE(0, 32);                 // 注释
    cd.writeUInt16LE(0, 34);                 // 磁盘号
    cd.writeUInt16LE(0, 36);                 // 内部属性
    cd.writeUInt32LE(e.isDir ? 0x10 : 0, 38); // 外部属性
    cd.writeUInt32LE(offset, 42);            // 本地头偏移

    centralDir.push(cd, nameBuf);
    offset += local.length + nameBuf.length + payload.length;
  }

  // ── EOCD ──
  const cdSize = centralDir.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(centralDir.length / 2, 8);   // 条目数
  eocd.writeUInt16LE(centralDir.length / 2, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  const all = Buffer.concat([...chunks, ...centralDir, eocd]);
  fs.writeFileSync(outPath, all);
  return { count: entries.length, size: all.length };
}

/** CRC32（ZIP 需要） */
function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}


/**
 * 立即备份
 *
 * ── 只用一个方式：纯 JS ZIP（2026-11-05 改）──
 *
 * 老板原话：
 *   「我不在意安装包大小，我只是要不弹窗。不管你是什么方式兜不兜底儿，
 *     你不要弹窗就行。你弹窗我们这个项目就无法进行了。」
 *
 * ── 为什么删掉 tar ──
 *
 * 原来用 tar.exe（系统自带），速度快。
 * 但 tar.exe 的 PE Subsystem 是 3（Console，实测确认）。
 * 我们的 exe 是 GUI 程序（Subsystem 2），
 * Windows 给子进程 tar.exe 分配一个控制台 → 屏幕上黑窗口闪一下。
 *
 * 试过 stdio: 'pipe'，没用 —— 那只管输出通道，不管控制台分配。
 * 试过 windowsHide: true，Node 的已知问题是偶尔仍会闪。
 *
 * 用户看到的现象：
 *   · 点「设置」→ 调 /api/backup → 探测 tar → 弹窗
 *   · 自动备份（每 7 天）→ 真跑 tar → 弹窗
 *
 * 老板的判断：「你弹窗我们这个项目就无法进行了。」
 *   → 用户会以为电脑中毒
 *
 * 所以：彻底不用外部进程。只用手写的 ZIP。
 * 代价：压缩率略差、慢几十毫秒 —— 用户感知不到。
 */
export function backupNow(dataDir, opts = {}) {
  const conf = getBackupConfig(dataDir);
  const dir = opts.dir || conf.dir;

  // ① 建目录
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    return { ok: false, error: '建不了备份目录：' + e.message };
  }

  // ② 检查可写
  const probe = path.join(dir, '.write-test');
  try {
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
  } catch (e) {
    return { ok: false, error: '备份目录不可写：' + e.message };
  }

  // ③ 生成文件名
  const now = new Date();
  const stamp = now.toISOString().slice(0, 19).replace(/:/g, '-');
  const name = NAME_PREFIX + stamp + '.zip';
  const outPath = path.join(dir, name);

  // ④ 打包（纯 JS，零外部进程）
  try {
    writeZip(outPath, dataDir, ['backup']);
    let size = 0;
    try { size = fs.statSync(outPath).size; } catch { /* 忽略 */ }
    if (size <= 0) throw new Error('产出为空');
  } catch (e) {
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch { /* 忽略 */ }
    return { ok: false, error: '打包失败：' + e.message };
  }

  // ⑤ 记时间
  saveBackupConfig(dataDir, { lastAt: now.toISOString() });

  // ⑥ 清理超期
  const cleaned = cleanupOld(dataDir, { dir });

  let size = 0;
  try { size = fs.statSync(outPath).size; } catch { /* 忽略 */ }

  return { ok: true, file: outPath, name, size, cleaned, method: 'js-zip' };
}

/**
 * 删掉超期的备份
 */
export function cleanupOld(dataDir, opts = {}) {
  const conf = getBackupConfig(dataDir);
  const dir = opts.dir || conf.dir;
  const keepMonths = opts.keepMonths || conf.keepMonths;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - keepMonths);
  const cutoffStr = cutoff.toISOString().slice(0, 19).replace(/:/g, '-');

  let n = 0;
  for (const b of listBackups(dir)) {
    const stampStr = b.name.slice(NAME_PREFIX.length).replace(/\.(zip|tar)$/, '');
    if (stampStr < cutoffStr) {
      try { fs.unlinkSync(b.path); n += 1; } catch { /* 忽略 */ }
    }
  }
  return n;
}

/**
 * 该不该自动备份
 */
export function shouldAutoBackup(dataDir) {
  const conf = getBackupConfig(dataDir);
  if (!conf.weekly) return false;
  if (!conf.lastAt) return true;

  const last = new Date(conf.lastAt);
  if (isNaN(last.getTime())) return true;

  return (Date.now() - last.getTime()) / 86400000 >= 7;
}

/**
 * 给界面用的：备份现状
 */
export function backupStatus(dataDir) {
  const conf = getBackupConfig(dataDir);
  const list = listBackups(conf.dir);
  const totalSize = list.reduce((s, b) => s + b.size, 0);

  let nextAt = '';
  if (conf.weekly) {
    if (!conf.lastAt) {
      nextAt = '下次扫描时';
    } else {
      const last = new Date(conf.lastAt);
      if (!isNaN(last.getTime())) {
        nextAt = new Date(last.getTime() + 7 * 86400000).toISOString();
      }
    }
  }

  return {
    dir: conf.dir,
    isDefaultDir: conf.isDefaultDir,
    weekly: conf.weekly,
    keepMonths: conf.keepMonths,
    lastAt: conf.lastAt,
    nextAt,
    count: list.length,
    totalSize,
    tarAvailable: false,   // 已改成纯 JS ZIP，不再依赖 tar（2026-11-05）
    items: list.slice(0, 20).map((b) => ({
      name: b.name,
      size: b.size,
      at: b.at,
    })),
  };
}

// 测试用导出（不影响正式逻辑）
export const __test = { writeZip, crc32, walkDir };
