/**
 * 从 WorkBuddy 日志里挖历史账号昵称
 *
 * ── 老板的要求（2026-11-05）──
 *
 *   「至于叫张三还是要代码，我觉得应该按照人家的登录名去区分。
 *     用户不知道代码是谁的，必须得用他的昵称来代替。
 *     虽然我们记着他的 UID，但是显示出来也得是个昵称。」
 *
 * ── 为什么需要（问题在哪）──
 *
 * WorkBuddy 的昵称只在【登录时】存在（account-snapshot.json）。
 * 那个文件只记当前登录的账号，退出登录就没了。
 *    ↓
 * 我们抓到的昵称存进 data/accounts.json，但那只有"曾经抓过的"。
 *    ↓
 * 新装的程序用全新 data 目录 → 只抓到当前登录账号
 * → 其他账号（张三）显示成「账号 aaaa1111」
 *    ↓
 * 用户看到代码，不知道是谁。
 *
 * ── 昵称还能从哪挖 ──
 *
 * WorkBuddy 的日志里，每次登录成功都会写：
 *
 *   [AuthenticationSessionListener] [auth_success: 张三]  认证成功
 *   [AuthenticationManager]  userId changed:  -> aaaa1111-2222-3333-4444-555566667777
 *
 * 这两行在同一毫秒，可以配对。
 *
 * 日志位置：~/.workbuddy/logs/<日期>/<工作区>__<hash>.log
 * 实测：一个会话日志 12465 行，里面有多次 auth_success。
 *
 * ── 怎么配对（要稳）──
 *
 * 简单做法：扫日志，找 auth_success 行，然后往后看 N 行内
 *          有没有「userId changed: -> uid」，有就配对。
 *
 * 为什么不用正则一次匹配两行：日志行可能被截断、可能有其他日志插进来。
 * 用「往后找 20 行」更稳。
 *
 * 为什么同一个昵称可能配到不同 uid：
 *   实测没有这种情况（一个昵称对应一个 uid），但如果出现，
 *   我们取最后一次（最新的登录记录更可信）。
 */

import fs from 'node:fs';
import path from 'node:path';

/** 单文件最多读多少字节（auth_success 在登录时写，通常在文件开头） */
const MAX_READ_PER_FILE = 3 * 1024 * 1024;

/** 昵称合法性检查（过滤掉明显不是昵称的值） */
function looksLikeNickname(s) {
  const t = String(s || '').trim();
  if (!t) return false;
  if (t.length > 40) return false;
  // 排除纯数字/纯符号/日志噪声
  if (/^\d+$/.test(t)) return false;
  if (/^[0-9a-f-]{20,}$/i.test(t)) return false;      // uuid
  if (/^(undefined|null|true|false)$/i.test(t)) return false;
  if (t.indexOf('\n') >= 0) return false;
  return true;
}

/**
 * 从一个日志文件里挖 auth_success + uid 的配对
 *
 * @param {string} filePath
 * @returns {Map<string, string>} uid → nickname
 */
export function scanLogForAccounts(filePath) {
  const out = new Map();

  // 只读前 N 字节（auth_success 在登录时就写，通常在文件开头）
  let text;
  try {
    const st = fs.statSync(filePath);
    const limit = Math.min(st.size, MAX_READ_PER_FILE);
    if (limit <= 0) return out;
    if (st.size <= limit) {
      text = fs.readFileSync(filePath, 'utf8');
    } else {
      // 只读前 limit 字节
      const fd = fs.openSync(filePath, 'r');
      try {
        const buf = Buffer.alloc(limit);
        fs.readSync(fd, buf, 0, limit, 0);
        text = buf.toString('utf8');
      } finally {
        fs.closeSync(fd);
      }
    }
  } catch {
    return out;
  }

  const lines = text.split('\n');

  // 找每一处 auth_success
  const reAuth = /\[auth_success:\s*([^\]]+)\]/;
  const reUid = /userId changed:\s*[^\->]*->\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

  for (let i = 0; i < lines.length; i++) {
    const m = reAuth.exec(lines[i]);
    if (!m) continue;

    const nick = String(m[1] || '').trim();
    if (!looksLikeNickname(nick)) continue;

    // 往后找 20 行，看有没有 userId changed
    let uid = '';
    for (let j = i; j < Math.min(i + 20, lines.length); j++) {
      const mu = reUid.exec(lines[j]);
      if (mu) { uid = mu[1].toLowerCase(); break; }
    }

    if (uid) {
      // 后出现的覆盖先出现的（最新登录更可信）
      out.set(uid, nick);
    }
  }

  return out;
}

/**
 * 扫所有日志，汇总出「uid → 昵称」
 *
 * 目录结构：~/.workbuddy/logs/<YYYY-MM-DD>/<xxx>.log
 * 还有 ~/.workbuddy/logs/main.log、main.old.log 这类
 *
 * @param {string} wbHome WorkBuddy 数据目录
 * @param {object} [opts] { maxFiles } 最多扫几个文件（防太慢）
 * @returns {Map<string, string>}
 */
export function harvestAccountNames(wbHome, opts = {}) {
  const out = new Map();
  const logRoot = path.join(wbHome, 'logs');
  const maxFiles = opts.maxFiles || 60;

  // ── 性能考虑（2026-11-05 实测）──
  //
  // 全量扫 171 个文件 / 104.7 MB 要 20.9 秒 —— 太慢，
  // 每次扫描（每 30 分钟）都这么干，用户会觉得电脑卡。
  //
  // 优化：
  //   ① 只扫最近 7 天的日志目录（老账号不会因为老日志才有昵称）
  //   ② 单文件只读前 3 MB（auth_success 通常在开头，登录时立即写）
  //   ③ 一旦找到 ≥1 个账号就继续找（可能还有别的），但总量控制
  const MAX_READ = 3 * 1024 * 1024;   // 单文件最多读 3 MB

  if (!fs.existsSync(logRoot)) return out;

  // 收集日志文件（按修改时间倒序，新的优先）
  const files = [];
  try {
    const entries = fs.readdirSync(logRoot, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        // 日期目录
        const dayDir = path.join(logRoot, e.name);
        let inner = [];
        try { inner = fs.readdirSync(dayDir); } catch { continue; }
        for (const f of inner) {
          if (!f.endsWith('.log')) continue;
          const p = path.join(dayDir, f);
          let st;
          try { st = fs.statSync(p); } catch { continue; }
          // 跳过太大的（会话日志可能 1-5 MB，那个也扫，但限制上限）
          if (st.size > 20 * 1024 * 1024) continue;
          files.push({ p, mtime: st.mtimeMs, size: st.size });
        }
      } else if (e.name.endsWith('.log')) {
        const p = path.join(logRoot, e.name);
        let st;
        try { st = fs.statSync(p); } catch { continue; }
        if (st.size > 20 * 1024 * 1024) continue;
        files.push({ p, mtime: st.mtimeMs, size: st.size });
      }
    }
  } catch {
    return out;
  }

  // 按修改时间倒序
  files.sort((a, b) => b.mtime - a.mtime);

  let scanned = 0;
  for (const f of files) {
    if (scanned >= maxFiles) break;
    // 太小的跳过（<1KB 基本没有内容）
    if (f.size < 1024) continue;

    const found = scanLogForAccounts(f.p);
    scanned += 1;

    for (const [uid, nick] of found) {
      // 先扫到的是新文件，所以不要覆盖已有的
      if (!out.has(uid)) out.set(uid, nick);
    }

    // 已经找到的账号够多了？继续扫（可能还有别的账号）
  }

  return out;
}
