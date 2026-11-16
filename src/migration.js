/**
 * Buddy Trace · 加密迁移（导出 / 导入）
 *
 * 3.0 新增：把整个记忆库打成一个带口令加密的文件，在电脑之间安全搬运。
 *
 * 设计（借鉴同类工具的"一个口令、一个文件、跨电脑可搬"，独立实现）：
 *   · 打包复用 backup.js 的纯 JS ZIP（零依赖，不闪黑窗）
 *   · 加密用 node 内置 crypto：AES-256-GCM + PBKDF2 派生密钥 + 随机 salt
 *   · 口令只在这一次调用内存里，不落盘、不写进文件
 *
 * 文件格式（.btbackup）：
 *   4 字节魔数 "BTB1" + 16 字节 salt + 12 字节 GCM iv + 加密后的 ZIP 字节
 *
 * 导入安全底线：
 *   · 覆盖恢复前先做一次自动兜底备份（backupNow），绝不在没有兜底时清空现有数据
 *   · 解密失败（口令错 / 文件损坏）→ 拒绝，且不碰现有数据
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { backupNow } from './backup.js';

const MAGIC = Buffer.from('BTB1', 'ascii');
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const PBKDF2_ITER = 210000;   // OWASP 2023 建议的 PBKDF2-HMAC-SHA256 迭代数

/** 迁移包要排除的运行态文件/目录（这些不属于"记忆"，迁移过去反而有害） */
const MIGRATION_EXCLUDES = [
  'backup',
  'logs',
  'runtime.json',
  'instance.lock',
  'ads',
  'qr',
  'remote-cache',
  'last-error.txt',
  'last-error.html',
];

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), salt, PBKDF2_ITER, 32, 'sha256');
}

/** 目录树里收集要打包的文件（排除运行态），返回 [{rel, abs}] */
function collectFiles(dataDir) {
  const out = [];
  const skip = (rel) => {
    for (const x of MIGRATION_EXCLUDES) {
      if (rel === x || rel.startsWith(x + '/')) return true;
    }
    return false;
  };
  function walk(dir, relBase) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const rel = relBase ? relBase + '/' + e.name : e.name;
      if (skip(rel)) continue;
      if (e.isDirectory()) { walk(abs, rel); }
      else if (e.isFile()) {
        // 排除临时/锁/隐藏状态文件
        if (e.name === '.bt-install-id') continue;
        out.push({ rel, abs });
      }
    }
  }
  walk(dataDir, '');
  return out;
}

/** 用纯 JS 打一个内存里的 ZIP（自建轻量 zip） */
function buildZipBuffer(dataDir) {
  const files = collectFiles(dataDir);
  const tmpDir = fs.mkdtempSync(path.join(dataDir, '.mig-'));
  const zipPath = path.join(tmpDir, 'bundle.zip');
  try {
    writeZipBuffer(zipPath, dataDir, files);
    const buf = fs.readFileSync(zipPath);
    return buf;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
  }
}

/** 轻量 ZIP 打包（内存友好，只打收集到的文件） */
function writeZipBuffer(outPath, dataDir, files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const crc32 = (buf) => {
    // backup.js 有实现，这里独立一份避免循环依赖
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return (~c) >>> 0;
  };
  for (const f of files) {
    const data = fs.readFileSync(f.abs);
    const name = 'data/' + f.rel;
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    // 不压缩（data 里已有大量文本，压缩收益低且更慢）；用 deflate 存小一点更划算，但保守起见 store 模式
    const comp = zlib.deflateRawSync(data);
    const useStore = comp.length >= data.length;
    const payload = useStore ? data : comp;
    const method = useStore ? 0 : 8;
    const dosTime = (() => {
      const d = new Date();
      const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f);
      const day = (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | (d.getDate() & 0x1f);
      return { time, day };
    })();
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime.time, 10);
    local.writeUInt16LE(dosTime.day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, payload);
    offset += 30 + nameBuf.length + payload.length;

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(dosTime.time, 12);
    cd.writeUInt16LE(dosTime.day, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(payload.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(0, 42);   // 本地头偏移，占位后回填
    central.push({ cd, nameBuf, offset });
  }
  const cdBuf = [];
  let cdSize = 0;
  for (const c of central) {
    c.cd.writeUInt32LE(c.offset, 42);
    cdBuf.push(c.cd, c.nameBuf);
    cdSize += c.cd.length + c.nameBuf.length;
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(central.length, 8);
  eocd.writeUInt16LE(central.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);
  fs.writeFileSync(outPath, Buffer.concat([...chunks, ...cdBuf, eocd]));
}

/** 导出：返回 { ok, buf, name, count, size } */
export function exportEncrypted(dataDir, password) {
  if (!password || String(password).length < 6) {
    return { ok: false, error: '口令至少 6 位' };
  }
  try {
    const zipBuf = buildZipBuffer(dataDir);
    const salt = crypto.randomBytes(SALT_LEN);
    const iv = crypto.randomBytes(IV_LEN);
    const key = deriveKey(String(password), salt);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(zipBuf), cipher.final()]);
    const tag = cipher.getAuthTag();
    const count = countMemoryFiles(dataDir);
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    return {
      ok: true,
      buf: Buffer.concat([MAGIC, salt, iv, enc, tag]),
      name: `BuddyTrace-记忆备份-${stamp}.btbackup`,
      count,
      size: zipBuf.length,
    };
  } catch (e) {
    return { ok: false, error: '导出失败：' + e.message };
  }
}

function countMemoryFiles(dataDir) {
  try {
    const files = collectFiles(dataDir);
    return files.length;
  } catch { return 0; }
}

/** 解析迁移文件头，返回 { zipBuf } 或 { error } */
function decryptBundle(buf, password) {
  if (buf.length < MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN + 1) {
    return { error: '不是有效的备份文件' };
  }
  if (!buf.subarray(0, 4).equals(MAGIC)) {
    return { error: '文件格式不对（不是 Buddy Trace 备份）' };
  }
  const salt = buf.subarray(4, 4 + SALT_LEN);
  const iv = buf.subarray(4 + SALT_LEN, 4 + SALT_LEN + IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const enc = buf.subarray(4 + SALT_LEN + IV_LEN, buf.length - TAG_LEN);
  try {
    const key = deriveKey(String(password), salt);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const zipBuf = Buffer.concat([decipher.update(enc), decipher.final()]);
    return { zipBuf };
  } catch {
    return { error: '口令不对，或文件已损坏' };
  }
}

/** 极简 ZIP 读取（只支持我们写出的 store/deflate 两种） */
function readZipEntries(zipBuf) {
  const entries = [];
  let off = 0;
  while (off + 4 <= zipBuf.length) {
    const sig = zipBuf.readUInt32LE(off);
    if (sig !== 0x04034b50) break;
    const method = zipBuf.readUInt16LE(off + 8);
    const compSize = zipBuf.readUInt32LE(off + 18);
    const nameLen = zipBuf.readUInt16LE(off + 26);
    const extraLen = zipBuf.readUInt16LE(off + 28);
    const name = zipBuf.subarray(off + 30, off + 30 + nameLen).toString('utf8');
    const dataStart = off + 30 + nameLen + extraLen;
    const raw = zipBuf.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error('不支持的压缩方式');
    entries.push({ name, data });
    off = dataStart + compSize;
  }
  return entries;
}

/**
 * 导入：解密 → 解包 → 覆盖恢复。
 * 覆盖前先做一次自动兜底备份，绝不在没有兜底时清空现有数据。
 */
export function importEncrypted(dataDir, buf, password) {
  if (!password || String(password).length < 6) {
    return { ok: false, error: '口令至少 6 位' };
  }
  if (!buf || buf.length === 0) {
    return { ok: false, error: '没收到文件内容' };
  }

  const dec = decryptBundle(buf, password);
  if (dec.error) return { ok: false, error: dec.error };

  let entries;
  try {
    entries = readZipEntries(dec.zipBuf);
  } catch (e) {
    return { ok: false, error: '备份文件解压失败：' + e.message };
  }
  if (entries.length === 0) return { ok: false, error: '备份文件是空的' };

  // ① 覆盖前自动兜底备份（同步做，保证完成才继续）
  let safety;
  try {
    safety = backupNow(dataDir);
  } catch (e) {
    safety = { ok: false, error: e.message };
  }
  if (!safety.ok) {
    return { ok: false, error: '导入前自动备份失败，已中止（不碰现有数据）：' + safety.error };
  }

  // ② 清空现有记忆内容（保留 backup/ logs/ 等运行态与刚做的兜底备份）
  try {
    clearMemoryData(dataDir);
  } catch (e) {
    return { ok: false, error: '清空现有数据失败，已中止：' + e.message };
  }

  // ③ 写回导入的文件
  try {
    let restored = 0;
    for (const e of entries) {
      // 条目名形如 data/xxx/yyy，剥掉 data/ 前缀落到 dataDir
      const rel = e.name.replace(/^data\//, '');
      if (!rel || rel.includes('..')) continue;   // 防目录穿越
      const target = path.join(dataDir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, e.data);
      restored++;
    }
    return { ok: true, restored, safety: safety.name };
  } catch (e) {
    return { ok: false, error: '写入恢复数据失败：' + e.message + '（数据已部分恢复，可用刚才的兜底备份回滚）' };
  }
}

/** 清空记忆数据：删 index.json / projects.json 及所有项目目录，保留运行态 */
function clearMemoryData(dataDir) {
  const keep = new Set(['backup', 'logs', 'runtime.json', 'instance.lock', 'ads', 'qr', 'remote-cache']);
  for (const e of fs.readdirSync(dataDir, { withFileTypes: true })) {
    if (keep.has(e.name)) continue;
    const p = path.join(dataDir, e.name);
    try {
      if (e.isDirectory()) fs.rmSync(p, { recursive: true, force: true });
      else fs.unlinkSync(p);
    } catch { /* 忽略单个失败，尽量清 */ }
  }
}
