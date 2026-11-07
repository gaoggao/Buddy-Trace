/**
 * WorkBuddy 专属：自动扫描同步
 *
 * 做什么：
 *   定时扫 ~/.workbuddy 和两个工作区根目录，把 WorkBuddy 的
 *   记忆/知识/技能/变更记录同步进本库。
 *
 * 设计原则：
 *   ① 全自动 —— 用户不点任何按钮（用户不懂、也记不住）
 *   ② 增量去重 —— 按「指纹」跳过已导入的，重扫一百遍也不翻倍
 *   ③ mtime 短路 —— 文件没变就不解析，开销极小
 *   ④ 账号绑定 —— 每条记录标上是哪个 WorkBuddy 账号产生的
 *   ⑤ 绝不改 WorkBuddy 的文件 —— 只读
 *
 * 实测开销（2026-11-01，39 个文件 25.7MB）：
 *   冷扫（读全部内容）  0.03 秒
 *   温扫（只比 mtime）  0.006 秒
 *   解析 jsonl          0.37 秒（只在变动时）
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { extractSessions } from './wb-extract.js';
import { harvestAccountNames } from './wb-account-names.js';

/**
 * 用户手动指定的 WorkBuddy 目录
 *
 * 老板明确（2026-11-03）：
 *   「如果是扫不到，就提醒用户，让用户手动指定目录。」
 *
 * 存在我们自己的数据目录里（<dataDir>/wb-home.json），
 * 不碰 WorkBuddy 的任何文件。
 */
function manualHomeFile() {
  // 数据目录由调用方通过环境变量或参数传进来；这里用一个模块级变量记住
  const d = process.env.BT_DATA_DIR || process.env.BT_CONFIG_DIR || '';
  return d ? path.join(d, 'wb-home.json') : '';
}

let _dataDirHint = '';
/** 让上层告诉我们数据目录在哪（用于存"用户手动指定的路径"） */
export function setDataDirHint(dir) {
  _dataDirHint = String(dir || '');
}

/** 读用户手动指定的目录 */
function manualHome() {
  const p = _dataDirHint
    ? path.join(_dataDirHint, 'wb-home.json')
    : manualHomeFile();
  if (!p) return '';
  try {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    return String(d.path || '').trim();
  } catch {
    return '';
  }
}

/** 存用户手动指定的目录 */
export function saveManualHome(dir) {
  // 路径规范化：去掉多余的转义（用户从别处复制可能带 \\ 或 ""）
  const target = path.resolve(String(dir || '').trim().replace(/\\\\/g, '\\').replace(/["']/g, ''));
  if (!target) return { ok: false, error: '缺少目录路径' };
  // 必须是个真实存在的目录，且有 workbuddy.db（否则指定了也没用）
  if (!exists(target)) return { ok: false, error: '这个路径不存在：' + target };
  const hasDb = exists(path.join(target, 'workbuddy.db'));
  if (!hasDb) {
    return {
      ok: false,
      error: '这个目录里没有 workbuddy.db —— 可能不是 WorkBuddy 的数据目录。请确认路径。',
    };
  }
  const p = _dataDirHint
    ? path.join(_dataDirHint, 'wb-home.json')
    : manualHomeFile();
  if (!p) return { ok: false, error: '内部错误：不知道往哪存' };
  try {
    fs.writeFileSync(p, JSON.stringify({ path: target, at: new Date().toISOString() }, null, 2), 'utf8');
    return { ok: true, path: target };
  } catch (e) {
    return { ok: false, error: '保存失败：' + String(e && e.message || e) };
  }
}

/**
 * WorkBuddy 数据根目录（四层查找）
 *
 * 老板问（2026-11-03）：「你安装了以后，你如何获取电脑上的 workbuddy 目录？
 *   你是整盘扫吗？还是规定几个常用的位置？」
 *
 * 实测结论（这台机器）：
 *   程序装在 E:\Program Files\WorkBuddy\
 *   数据却在 C:\Users\Administrator\.workbuddy\（1.5 GB）
 *   → 数据目录【跟装在哪个盘无关】，它固定跟着 Windows 用户目录走
 *
 * 而且实测：WorkBuddy 自己的配置文件里【没有】记录数据目录位置的字段
 * （查过 last-launch / user-state / failover / workspace-state / settings 都没有）
 * → 所以用户想改，只能靠环境变量。我们跟着环境变量走就行。
 *
 * 四层，不整盘扫（整盘扫 1.5 GB 要几十秒，用户会以为卡死）：
 *   ① 用户手动指定的（存在我们自己的 wb-home.json 里）
 *   ② 环境变量 BT_WB_HOME
 *   ③ os.homedir()/.workbuddy（99% 的情况，自动跟着用户名/盘符变）
 *   ④ 几个常见位置逐个 stat 检查（不递归，毫秒级）
 */
export function wbHome() {
  // ① 用户手动指定的（最高优先级 —— 他说了算）
  const manual = manualHome();
  if (manual && exists(manual)) return manual;

  // ② 环境变量
  const env = process.env.BT_WB_HOME;
  if (env && exists(path.join(env, 'workbuddy.db'))) return env;
  if (env) return env;   // 用户指定了就照办，哪怕暂时没有 db

  // ③ 标准位置：Windows 用户目录下（自动跟着用户名和盘符变）
  const std = path.join(os.homedir(), '.workbuddy');
  if (exists(path.join(std, 'workbuddy.db')) || exists(std)) return std;

  // ④ 兜底：几个常见位置（只 stat，不递归扫）
  for (const c of candidateHomes()) {
    if (exists(path.join(c, 'workbuddy.db'))) return c;
  }

  // 都没找到：返回标准路径，让上层报"没找到数据"
  return std;
}

/** 兜底候选位置（不递归，只 stat） */
function candidateHomes() {
  const cands = [];
  // 其他 Windows 用户目录下的 .workbuddy（多用户机器）
  try {
    const usersRoot = path.dirname(os.homedir());   // C:\Users
    for (const name of fs.readdirSync(usersRoot)) {
      cands.push(path.join(usersRoot, name, '.workbuddy'));
    }
  } catch { /* 读不了就算了 */ }
  // AppData 下（有些版本会放这）
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'WorkBuddy'));
  if (process.env.LOCALAPPDATA) cands.push(path.join(process.env.LOCALAPPDATA, 'WorkBuddy'));
  // 程序目录旁边的 data（便携版）
  if (process.env.ProgramFiles) cands.push(path.join(process.env.ProgramFiles, 'WorkBuddy', 'data'));
  // 各盘的常见位置（只查固定几个，不整盘扫）
  for (const drv of ['C', 'D', 'E', 'F']) {
    cands.push(drv + ':\\WorkBuddy\\data');
    cands.push(drv + ':\\WorkBuddy');
  }
  return cands;
}

/**
 * 找 WorkBuddy 目录并返回诊断信息（给界面用）
 *
 * 老板明确（2026-11-03）：「如果是扫不到，就提醒用户，让用户手动指定目录。」
 * → 所以这里要返回「查过哪些位置」，界面上列出来，用户才知道该指哪儿。
 *
 * @returns {{path, found, source, tried: Array<string>, manual: string}}
 */
export function wbHomeInfo() {
  const p = wbHome();
  const found = exists(path.join(p, 'workbuddy.db'));

  // 查过哪些位置（给用户看，让他知道我们真的找过）
  const tried = [];
  const manual = manualHome();
  if (manual) tried.push(manual + '（你手动指定的）');
  if (process.env.BT_WB_HOME) tried.push(process.env.BT_WB_HOME + '（环境变量）');
  tried.push(path.join(os.homedir(), '.workbuddy') + '（用户目录）');
  for (const c of candidateHomes()) {
    if (exists(c)) tried.push(c);
  }

  let source = '标准位置（用户目录）';
  if (manual && p === manual) source = '你手动指定的';
  else if (process.env.BT_WB_HOME && p === process.env.BT_WB_HOME) source = '环境变量 BT_WB_HOME';
  else if (p !== path.join(os.homedir(), '.workbuddy')) source = '兜底位置（自动找到）';

  return { path: p, found, source, tried, manual };
}

/**
 * 工作区根目录
 *
 * 不能写死路径（老板 2026-11-03 明确）：
 *   「本地目录，让 agent 读取的目录，根据用户选择的盘符安装的具体路径，
 *     你得改变生成，你不能固化的都用同一个路径。」
 *
 * 所以优先级：
 *   ① 环境变量 BT_WORKSPACES（分号分隔，给高级用户）
 *   ② WorkBuddy 自己的配置：app-config.json 的 defaultWorkspacePath
 *   ③ 兜底：~/WorkBuddy（WorkBuddy 默认位置）
 *   ④ 再加：所有已知工作区所在的父目录（从 workbuddy.db 的 cwd 推断）
 */
export function workspaceRoots() {
  const env = process.env.BT_WORKSPACES;
  if (env) return env.split(';').map((s) => s.trim()).filter(Boolean);

  const out = new Set();

  // ② 读 WorkBuddy 自己的配置（用户装在哪、默认工作区在哪，它自己知道）
  const cfgPath = path.join(wbHome(), 'app-config.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const dw = cfg.defaultWorkspacePath || cfg.workspacePath || '';
    if (dw) {
      // defaultWorkspacePath 是"某个工作区"，它的父目录才是"工作区根"
      out.add(dw);
      out.add(path.dirname(dw));
    }
  } catch { /* 读不到就跳过 */ }

  // ③ 兜底：WorkBuddy 默认把工作区放在 ~/WorkBuddy
  out.add(path.join(os.homedir(), 'WorkBuddy'));

  // ④ 从数据库里读实际用过的工作区，取它们的父目录
  //    （这样即使用户把工作区放在 D:\某处，也能扫到）
  try {
    const dbPath = path.join(wbHome(), 'workbuddy.db');
    if (exists(dbPath)) {
      const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const rows = db.prepare("SELECT DISTINCT cwd FROM sessions WHERE cwd IS NOT NULL AND cwd != ''").all();
      db.close();
      for (const r of rows) {
        const cwd = String(r.cwd || '').replace(/\\/g, '/').replace(/\/+$/, '');
        if (cwd) {
          out.add(cwd);
          out.add(path.dirname(cwd));
        }
      }
    }
  } catch { /* node:sqlite 不可用就跳过 */ }

  // 归一化 + 去重 + 去掉被父目录包含的子目录
  const norm = (p) => path.resolve(p).replace(/\\/g, '/').toLowerCase();
  const uniq = [];
  const seen = new Set();
  for (const p of out) {
    const n = norm(p);
    if (seen.has(n)) continue;
    try { if (!fs.statSync(p).isDirectory()) continue; } catch { continue; }
    seen.add(n);
    uniq.push(path.resolve(p));
  }

  // 去掉被其他路径包含的子目录（父目录扫一次就够，避免重复扫）
  return uniq.filter((p) => {
    const n = norm(p);
    return !uniq.some((q) => {
      const qn = norm(q);
      return qn !== n && n.startsWith(qn + '/');
    });
  });
}

const fp = (...parts) =>
  crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

/**
 * 账号对照表：读 accounts.json
 *
 * 昵称只在登录时存在（account-snapshot.json），退出就被删。
 * 所以这个文件是「抓到就存」的累积结果，uid 才是稳定身份。
 */
export function loadAccounts(dataDir) {
  const p = path.join(dataDir, 'accounts.json');
  try {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    return d.accounts || {};
  } catch {
    return {};
  }
}

/** 保存账号对照表 */
export function saveAccounts(dataDir, accounts) {
  const p = path.join(dataDir, 'accounts.json');
  const d = {
    _说明: 'WorkBuddy 账号对照表。uid → 昵称。昵称只在登录时存在，扫描时抓到就写入这里。',
    _如何补充: '在 WorkBuddy 里登录某个账号，等扫描周期到（或重启服务）就会自动写入。也可手动填。',
    accounts,
  };
  fs.writeFileSync(p, JSON.stringify(d, null, 2), 'utf8');
}

/**
 * 抓当前登录账号的昵称
 *
 * account-snapshot.json 只在【登录状态下】存在，退出登录就被删。
 * 所以每次扫描都看一眼：有就记下来（这是昵称唯一的获取时机）。
 */
export function captureLoginAccount(dataDir) {
  const snap = path.join(wbHome(), 'storage', 'skeleton', 'account-snapshot.json');
  if (!exists(snap)) return null;
  try {
    const d = JSON.parse(fs.readFileSync(snap, 'utf8'));
    const pr = d.primary || {};
    if (!pr.uid) return null;
    const accounts = loadAccounts(dataDir);
    const old = accounts[pr.uid] || {};
    const nick = pr.nickname || null;
    // 只在拿到昵称、且跟旧的不同时才写（避免每次扫描都改文件）
    if (nick && old.nickname !== nick) {
      accounts[pr.uid] = {
        ...old,
        nickname: nick,
        type: pr.type || old.type || 'personal',
        firstSeen: old.firstSeen || new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        source: 'account-snapshot.json（登录时抓取）',
      };
      saveAccounts(dataDir, accounts);
      return { uid: pr.uid, nickname: nick, isNew: !old.nickname };
    }
    if (!old.firstSeen) {
      accounts[pr.uid] = { ...old, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString() };
      saveAccounts(dataDir, accounts);
    }
    return { uid: pr.uid, nickname: nick, isNew: false };
  } catch {
    return null;
  }
}

/**
 * 从 WorkBuddy 日志里补齐历史账号昵称
 *
 * ── 老板的要求（2026-11-05）──
 *
 *   「至于叫张三还是要代码，我觉得应该按照人家的登录名去区分。
 *     用户不知道代码是谁的，必须得用他的昵称来代替。」
 *
 * ── 为什么需要 ──
 *
 * WorkBuddy 的昵称只在【登录时】存在（account-snapshot.json），
 * 退出登录就没了。新装的程序只能抓到"当前登录"那个账号的昵称，
 * 其他账号（张三）显示成「账号 aaaa1111」，用户不知道是谁。
 *
 * ── 从哪补 ──
 *
 * 日志里有登录记录，同一毫秒内两行：
 *   [auth_success: 张三]  认证成功
 *   userId changed:  -> aaaa1111-2222-3333-4444-555566667777
 *
 * 实测（2026-11-05）：扫最近日志 308ms 就能挖到两个账号的昵称。
 *
 * @param {string} dataDir
 * @returns {{added: number, total: number}} 新补了几个
 */
export function harvestAccountNamesToStore(dataDir) {
  let map;
  try {
    map = harvestAccountNames(wbHome());
  } catch {
    return { added: 0, total: 0 };
  }
  if (!map || !map.size) return { added: 0, total: 0 };

  const accounts = loadAccounts(dataDir);
  let added = 0;

  for (const [uid, nick] of map) {
    if (!uid || !nick) continue;
    const old = accounts[uid] || {};
    // 已经有昵称的不覆盖（snapshot 抓的更可信）
    if (old.nickname && String(old.nickname).trim()) continue;

    accounts[uid] = {
      ...old,
      nickname: nick,
      type: old.type || 'personal',
      firstSeen: old.firstSeen || new Date().toISOString(),
      lastSeen: old.lastSeen || new Date().toISOString(),
      source: 'WorkBuddy 日志（auth_success 记录）',
    };
    added += 1;
  }

  if (added > 0) saveAccounts(dataDir, accounts);
  return { added, total: map.size };
}

/** 账号显示名：有昵称用昵称，没有用代号（保证能区分） */
function accName(accounts, uid) {
  if (!uid) return '未知账号';
  const a = accounts[uid];
  return (a && a.nickname) || ('账号 ' + uid.slice(0, 8));
}

/**
 * 从 workbuddy.db 读出会话索引
 *
 * 用 node:sqlite（Node 22 内置，实验性但可用，不引入第三方依赖）。
 * 万一不可用，退化成只用 edge-sync-mapping-v4.db 或直接放弃账号绑定。
 */
function loadSessionIndex() {
  const out = {
    sid2uid: new Map(),
    cwd2uids: new Map(),
    cwdTitles: new Map(),   // 工作区目录 → 会话标题列表（用于把项目名变得人看得懂）
    titles: new Map(),
    // 云端会话（手机版）：硬盘上没有内容，只有元数据 —— 单独收集
    cloud: [],
  };
  const dbPath = path.join(wbHome(), 'workbuddy.db');
  if (!exists(dbPath)) return out;
  try {
    // Node 22 内置 node:sqlite（零第三方依赖）
    // 本文件是 ESM，不能用裸 require —— 用 createRequire 拿到 CJS 加载器
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db.prepare('SELECT id, user_id, cwd, title, transport, conversation_origin, created_at, updated_at FROM sessions').all();
    for (const r of rows) {
      if (!r.user_id) continue;
      out.sid2uid.set(r.id, r.user_id);
      const c = String(r.cwd || '').replace(/\\/g, '/').replace(/\/+$/, '');
      if (c) {
        if (!out.cwd2uids.has(c)) out.cwd2uids.set(c, new Set());
        out.cwd2uids.get(c).add(r.user_id);
        // 记下这个工作区里的会话标题（按创建顺序，取最后一个当项目名）
        if (r.title) {
          if (!out.cwdTitles.has(c)) out.cwdTitles.set(c, []);
          out.cwdTitles.get(c).push(r.title);
        }
      }
      if (r.title) out.titles.set(r.id, r.title);
      // 云端会话（手机版）：内容在服务器，本地无文件
      if (r.transport === 'cloud' || (!c && r.id)) {
        out.cloud.push({
          id: r.id,
          uid: r.user_id,
          title: r.title || '(无标题)',
          origin: r.conversation_origin || '',
          createdAt: r.created_at || 0,
          updatedAt: r.updated_at || 0,
        });
      }
    }
    db.close();
  } catch {
    // node:sqlite 不可用 → 退化到 edge-sync-mapping-v4.db 取 sessionId→uid
    try {
      const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
      const p2 = path.join(wbHome(), 'edge-sync-mapping-v4.db');
      if (exists(p2)) {
        const db2 = new DatabaseSync(p2, { readOnly: true });
        const rows2 = db2.prepare('SELECT session_id, msg_channel FROM edge_sync_mapping').all();
        for (const r of rows2) {
          const ch = String(r.msg_channel || '');
          if (ch.startsWith('convmsg:')) out.sid2uid.set(r.session_id, ch.slice(8));
        }
        db2.close();
      }
    } catch { /* 账号绑定降级，主流程继续 */ }
  }
  // 云端会话按时间倒序
  out.cloud.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return out;
}

/**
 * 给一个工作区目录，挑一个「人看得懂」的项目名
 *
 * 用会话标题（如「抵押物成本参考价」），而不是目录名（时间戳）。
 * 一个工作区可能有多个会话 → 取最近那个的标题（最像"这个工作区在干啥"）。
 */
function projectTitleFor(cwdKey, sessIdx) {
  const titles = sessIdx && sessIdx.cwdTitles && sessIdx.cwdTitles.get(cwdKey);
  if (!titles || !titles.length) return '';
  // 取最后一个（titles 是按会话创建顺序 push 的）
  const t = titles[titles.length - 1];
  return String(t).trim().slice(0, 40);
}

/** 按 ## 标题把一个 markdown 拆成多条 */
export function splitSections(md) {
  const lines = md.split('\n');
  const out = [];
  let curTitle = null;
  let cur = [];
  let sawH2 = false;
  const flush = () => {
    const body = cur.join('\n').trim();
    if (curTitle !== null || body) {
      if (body) out.push([curTitle, body]);
    }
    cur = [];
  };
  for (const ln of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(ln);
    if (m) {
      sawH2 = true;
      flush();
      curTitle = m[1];
      continue;
    }
    if (ln.startsWith('# ')) continue;   // 一级标题（文件名/日期）丢掉
    cur.push(ln);
  }
  flush();
  if (!sawH2) {
    const body = lines.filter((x) => !x.startsWith('# ')).join('\n').trim();
    return body ? [[null, body]] : [];
  }
  return out;
}

/**
 * 扫描一遍，产出「待同步清单」
 *
 * @param {object} opts
 * @param {string} opts.dataDir 数据目录（读 accounts.json）
 * @param {Map} [opts.mtimeCache] 上次扫描的 mtime（用于短路）
 * @returns {{items: Array, mtimeCache: Map, stats: object}}
 */

/**
 * 同步规则版本号
 *
 * 只要改了 scan() 里产出的记录格式、或者改了哪些文件要扫，
 * 就必须把这个数字加 1 —— 否则旧记录不会更新。
 *
 * 版本号存进 mtimeCache，缓存判断要同时满足：
 *   mtime 没变 且 版本没变 → 才跳过
 *
 * 踩过的坑（2026-11-04）：只记 mtime，改了规则以后旧结果永远不更新，
 * 只能手动清空整个库重扫。
 */
export const SYNC_RULE_VERSION = 2;   // 2 = 2026-11-04 全量保留规则

export function scan(opts) {
  const dataDir = opts.dataDir;
  const accounts = loadAccounts(dataDir);
  const wb = wbHome();
  const roots = workspaceRoots();
  const sessIdx = loadSessionIndex();
  const st = { scanned: 0, skipped: 0, bytes: 0 };
  const mtimeCache = opts.mtimeCache instanceof Map ? opts.mtimeCache : new Map();
  const newCache = new Map();
  const items = [];

  /** 读文件（带 mtime 短路） */
  //
  // ── 为什么要带规则版本号（2026-11-04 踩过的坑）──
  //
  // 只记 mtime 的后果：
  //   改了提炼规则 → 旧结果错了，但 mtime 没变 → 永远不重新处理
  //   实测：改成"全量保留"后，那 6 个短会话（mtime 没变）永远补不回来
  //
  // 修法：缓存里同时记规则版本号，版本变了就重新读
  const readCached = (p) => {
    let stat;
    try { stat = fs.statSync(p); } catch { return null; }
    const key = p;
    const mt = stat.mtimeMs;
    newCache.set(key, { mtime: mt, ver: SYNC_RULE_VERSION });
    st.scanned += 1;

    const prev = mtimeCache.get(key);
    const prevMtime = typeof prev === 'number' ? prev : (prev && prev.mtime);
    const prevVer = typeof prev === 'object' && prev ? prev.ver : 0;

    if (prevMtime && prevMtime === mt && prevVer === SYNC_RULE_VERSION) {
      st.skipped += 1;
      return null;
    }
    st.bytes += stat.size;
    return read(p);
  };

  // ── 1. 账号级记忆（MEMORY.md）──
  let entries = [];
  try { entries = fs.readdirSync(wb, { withFileTypes: true }); } catch { entries = []; }
  for (const e of entries) {
    if (!e.isDirectory() || !/^user-.+-personal$/.test(e.name)) continue;
    const uid = e.name.replace(/^user-/, '').replace(/-personal$/, '');
    const name = accName(accounts, uid);
    const body = readCached(path.join(wb, e.name, 'MEMORY.md'));
    if (body && body.trim()) {
      items.push({
        project: `账号：${name}`,
        kind: 'agent-memory',
        title: `${name} 的账号级记忆`,
        body,
        agent: name, account: name, uid,
        evidence: '原始文件',
        fingerprint: fp('acct', uid),
      });
    }
  }

  // ── 2. 项目级记忆（按 ## 拆分）──
  for (const root of roots) {
    let dirs = [];
    try { dirs = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const ws = path.join(root, d.name);
      const memd = path.join(ws, '.workbuddy', 'memory');
      if (!exists(memd)) continue;
      const key = ws.replace(/\\/g, '/').replace(/\/+$/, '');
      const uids = sessIdx.cwd2uids.get(key);
      let acct;
      if (uids && uids.size > 1) acct = [...uids].sort().map((u) => accName(accounts, u)).join(' + ');
      else if (uids && uids.size === 1) acct = accName(accounts, [...uids][0]);
      else acct = '未知账号';
      const uidStr = uids ? [...uids].sort().join(',') : '';

      // 项目名：用【会话标题】而不是工作区目录名（时间戳）
      //
      // 为什么（用户明确）：
      //   工作区目录名是「2026-10-16-05-03-58」这种时间戳 —— 用户看不懂，
      //   而且每天一个新工作区，一年下来几百个名字，筛选标签会刷屏。
      //   会话标题（如「抵押物成本参考价」）人看得懂，且能代表这个项目在干啥。
      const projName = projectTitleFor(key, sessIdx) || d.name;

      let files = [];
      try { files = fs.readdirSync(memd); } catch { continue; }
      for (const fn of files) {
        if (!fn.endsWith('.md')) continue;
        const body = readCached(path.join(memd, fn));
        if (!body || !body.trim()) continue;
        const day = fn.replace(/\.md$/, '');
        if (fn.toUpperCase() === 'MEMORY.MD') {
          items.push({
            project: projName, kind: 'wiki', title: '长期记忆',
            body, agent: acct, account: acct, uid: uidStr,
            evidence: '原始文件', fingerprint: fp('projmem', d.name, fn),
          });
        } else {
          for (const [sec, secBody] of splitSections(body)) {
            items.push({
              project: projName, kind: 'memory',
              title: sec ? `${day} ${sec}` : `${day} 记录`,
              body: secBody, agent: acct, account: acct, uid: uidStr,
              evidence: '原始文件', fingerprint: fp('projday', d.name, fn, sec || ''),
            });
          }
        }
      }
    }
  }

  // ── 3. 技能（全局，不属账号）──
  const skillDir = path.join(wb, 'skills');
  let sk = [];
  try { sk = fs.readdirSync(skillDir, { withFileTypes: true }); } catch { sk = []; }
  for (const d of sk) {
    if (!d.isDirectory()) continue;
    const p = path.join(skillDir, d.name, 'SKILL.md');
    if (!exists(p)) continue;
    const body = readCached(p);
    if (!body || !body.trim()) continue;
    const m = /display_name:\s*"?([^"\n]+)"?/.exec(body);
    items.push({
      project: '技能（全局共享）', kind: 'skill',
      title: (m ? m[1].trim() : d.name),
      body, agent: '全局', account: '全局（不属账号）', uid: '',
      evidence: '原始文件', fingerprint: fp('skill', d.name),
    });
  }

  // ── 4. 变更追溯（含"为什么"，按文件+天合并）──
  const reason = loadReasoning();
  const chDir = path.join(wb, 'changes-index');
  let chFiles = [];
  try { chFiles = fs.readdirSync(chDir); } catch { chFiles = []; }
  const merged = new Map();
  for (const fn of chFiles) {
    if (!fn.endsWith('.json')) continue;
    const p = path.join(chDir, fn);
    const raw = readCached(p);
    if (!raw) continue;            // mtime 没变 → 上次已处理
    let d;
    try { d = JSON.parse(raw); } catch { continue; }
    const conv = fn.replace(/\.json$/, '');
    const uid = sessIdx.sid2uid.get(conv) || '';
    const acct = accName(accounts, uid);
    for (const ch of d.changes || []) {
      const files = (ch.files || []).filter(
        (f) => !String(f.filePath || '').includes('.workbuddy'),
      );
      if (!files.length) continue;   // 只改自己记忆的，不算项目变更
      const ts = ch.createdAt || 0;
      const day = ts ? new Date(ts).toISOString().slice(0, 10) : '未知日期';
      for (const f of files) {
        const fname = String(f.filePath || '').split(/[\\/]/).pop();
        const k = `${fname}|${day}|${conv}`;
        if (!merged.has(k)) {
          merged.set(k, { fname, day, conv, uid, acct, count: 0, whys: [] });
        }
        const e = merged.get(k);
        e.count += 1;
        const why = reason.get(ch.requestId);
        if (why && !e.whys.includes(why)) e.whys.push(why);
      }
    }
  }
  for (const [k, e] of merged) {
    const lines = [
      '## 这天改了什么',
      `- \`${e.fname}\`  共 ${e.count} 次写入`,
      '',
      '## 为什么（当时的推理过程）',
    ];
    if (e.whys.length) {
      for (const w of e.whys.slice(0, 3)) { lines.push(w.slice(0, 1200)); lines.push(''); }
    } else {
      lines.push('（未捕获到推理过程）');
    }
    items.push({
      project: '变更追溯', kind: 'changelog',
      title: `${e.day} ${e.fname}`,
      body: lines.join('\n'),
      agent: e.acct, account: e.acct, uid: e.uid,
      evidence: '实测', fingerprint: fp('chg', k),
    });
  }

  // ── 5. 会话实录（从 jsonl 提炼「干了什么活」）──
  //
  // 为什么需要（2026-11-03 实测）：
  //   WorkBuddy 的 MEMORY.md 是「它愿意总结的」—— 很多活它压根不写。
  //   实测：做了仙剑游戏（网页/图片/音乐），但 memory 目录里一个字都没有。
  //   而它的会话记录（projects/*.jsonl）里什么都有：
  //     用户说的、agent 跑的 265 次命令、每一步的 reasoning、改了哪些文件。
  //
  // 这是【通用机制】—— 所有用户的电脑版会话都有 jsonl，都能提炼。
  const sess = extractSessions({
    accounts,
    sid2uid: sessIdx.sid2uid,
    mtimeCache: opts.sessCache,
  });
  for (const it of sess.items) {
    items.push(it);
  }
  const sessCache = sess.mtimeCache;

  // ── 6. 手机版（云端）会话 —— 只入库「目录」，让搜索能命中 ──
  //
  // 为什么（2026-11-02 实测发现的缺口）：
  //   /api/search 搜「蜘蛛」= 0 条，只能靠 /api/cloud-sessions 才找到。
  //   如果 agent 只用 search（最自然的做法），会误判「没做过」——
  //   那正好丢掉我们最有价值的能力（告诉使用者"东西在哪"）。
  //
  // 所以把云端会话也作为一条记录入库：
  //   kind = 'memory'（归到上下文记忆库）
  //   title = 会话标题（搜索能命中）
  //   body  = 【给使用者看的话】—— 用"你"，不用第一人称，不写给 agent 的指令
  //
  // 措辞原则（老板明确 2026-11-02）：
  //   「我们这个页面是针对用户的。用户看到这个界面读出来应该是针对他的，
  //     所以你的措辞不应该是跟 agent 说话的措辞。」
  //   → body 里不出现"不要假装你看过""如实说"这种对 agent 说话的句子
  //   → 也不用"给我 / 我这边"这种第一人称（读者会问"你是谁"）
  //   → 防止 agent 编造的约束放 evidence 字段 + /agent-rules 里（agent 才看）
  for (const c of sessIdx.cloud) {
    const acct = accName(accounts, c.uid);
    const day = c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : '';
    const upd = c.updatedAt ? new Date(c.updatedAt).toISOString().slice(0, 10) : '';
    const body = [
      '## 这件事是在手机上做的',
      '',
      '**内容还留在手机的 WorkBuddy 里，电脑上只有这一条登记。**',
      '',
      '| 项 | 值 |',
      '|---|---|',
      `| 标题 | ${c.title} |`,
      `| 账号 | ${acct} |`,
      `| 什么时候做的 | ${day || '未知'}${upd && upd !== day ? '（' + upd + ' 又动过）' : ''} |`,
      '| 在哪做的 | 手机版 WorkBuddy |',
      '',
      '当时具体聊了什么，电脑上查不到 —— 内容从来没下载到这台电脑。',
      '',
      '## 想让电脑也能接着做，三条路',
      '',
      '### 一、让手机版导出成网页，把网址发给电脑版（推荐）',
      '',
      '在手机版 WorkBuddy 里说一句：',
      '',
      '```',
      '把这个项目的完整记录生成一个外网能访问的网页，给我地址',
      '```',
      '',
      '它会给你一个 `https://` 开头的网址。**把这个网址发给电脑版 WorkBuddy** ——',
      '电脑版打开就能看到全部内容，接着做这个项目。',
      '',
      '### 二、就在手机上接着做',
      '',
      '手机版里打开这条会话，上下文都在，接着聊就行。电脑这边不用管。',
      '',
      '### 三、把内容复制到电脑上',
      '',
      '手机里全选复制 → 发到微信「文件传输助手」→ 电脑端微信里复制 →',
      '粘到电脑版 WorkBuddy 里。能行，但要手动搬，也搬不了完整的上下文。',
    ].join('\n');

    items.push({
      project: '手机版会话（内容在云端）',
      kind: 'memory',
      title: `${c.title}${day ? '（' + day + '）' : ''}`,
      body,
      agent: acct,
      account: acct,
      uid: c.uid,
      evidence: '目录信息',
      fingerprint: fp('cloud', c.id),
    });
  }

  return { items, mtimeCache: newCache, sessCache, stats: st, accounts };
}

/**
 * 从对话记录里抽出 requestId → reasoning（"为什么"的唯一来源）
 *
 * 实测：71 条变更里 62 条能关联到推理（89%）。
 */
function loadReasoning() {
  const map = new Map();
  const projDir = path.join(wbHome(), 'projects');
  let dirs = [];
  try { dirs = fs.readdirSync(projDir, { withFileTypes: true }); } catch { return map; }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    let files = [];
    try { files = fs.readdirSync(path.join(projDir, d.name)); } catch { continue; }
    for (const fn of files) {
      if (!fn.endsWith('.jsonl')) continue;
      let txt;
      try { txt = fs.readFileSync(path.join(projDir, d.name, fn), 'utf8'); } catch { continue; }
      for (const line of txt.split('\n')) {
        if (!line.trim()) continue;
        let o;
        try { o = JSON.parse(line); } catch { continue; }
        const pd = o.providerData || {};
        const rid = pd.conversationRequestId;
        const r = pd.reasoning;
        if (rid && r && !map.has(rid)) map.set(rid, r);
      }
    }
  }
  return map;
}

/**
 * 单独导出：检查「agent 有没有把自己接进去」
 *
 * 背景：我们不写 WorkBuddy 的文件（法律风险），改成让 agent 自己写。
 * 但 agent 可能压根没写、或者写了之后被清掉/被云端覆盖。
 * 所以要能检测出来，在界面上提醒用户「再发一次引导语」。
 *
 * 账号显示名规则（用户明确）：
 *   ① 启动时数账号目录 → 立刻知道有几个账号（不用等登录）
 *   ② 有昵称 → 显示昵称（如「张三」）
 *   ③ 没昵称 → 显示「账号 xxxxxxxx」（uid 前 8 位）
 *   ④ 昵称是登录时才抓到的 → 抓到后自动换成真名，不用 uid
 *
 * @param {string} [dataDir] 数据目录（读 accounts.json 里的昵称）
 * @returns {{installed: Array, missing: Array, all: Array}}
 */
export function checkAgentInstalled(dataDir) {
  const wb = wbHome();
  const accounts = dataDir ? loadAccounts(dataDir) : {};
  const all = [];
  const installed = [];
  const missing = [];
  let ents = [];
  try { ents = fs.readdirSync(wb, { withFileTypes: true }); } catch { return { installed, missing, all }; }
  for (const e of ents) {
    if (!e.isDirectory() || !/^user-.+-personal$/.test(e.name)) continue;
    const uid = e.name.replace(/^user-/, '').replace(/-personal$/, '');
    const memPath = path.join(wb, e.name, 'MEMORY.md');
    const nick = accounts[uid] && accounts[uid].nickname;
    const info = {
      uid,
      // 有昵称用昵称，没昵称用 uid 前 8 位（启动就能显示，不等登录）
      name: nick || ('账号 ' + uid.slice(0, 8)),
      hasNickname: !!nick,
      path: memPath,
      hasFile: false,
      installed: false,
      size: 0,
    };
    if (exists(memPath)) {
      info.hasFile = true;
      const c = read(memPath);
      info.size = c.length;
      // 判断依据：那段引导的两个特征（服务地址 / 标题）
      info.installed = /127\.0\.0\.1:\d+\/api\/accounts/.test(c) || /Buddy Trace/.test(c);
    }
    all.push(info);
    (info.installed ? installed : missing).push(info);
  }
  return { installed, missing, all };
}

/**
 * 单独导出：每个账号最后一次「干活」的时间
 *
 * 老板纠正（2026-11-03）：
 *   「只显示最后登录时间就行了，不要显示当前，因为它没有当前啊，
 *     我当前一个也没开，你给我显示这是当前，这啥意思？」
 *
 * 数据来源：workbuddy.db 的 sessions 表，每个账号 MAX(updated_at)。
 * 不用我们库里的 created_at —— 那是我【入库】的时间，不是用户用 WorkBuddy 的时间
 * （实测两个账号会显示同一时刻，那是入库那一刻）。
 *
 * @returns {Map<string, string>} uid → ISO 时间
 */
export function accountLastUsed() {
  const map = new Map();
  const dbPath = path.join(wbHome(), 'workbuddy.db');
  if (!exists(dbPath)) return map;
  try {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db.prepare(
      "SELECT user_id, MAX(updated_at) AS t FROM sessions WHERE user_id IS NOT NULL AND user_id != '' GROUP BY user_id",
    ).all();
    db.close();
    for (const r of rows) {
      const uid = String(r.user_id || '').trim();
      const ms = Number(r.t);
      if (uid && ms) map.set(uid, new Date(ms).toISOString());
    }
  } catch { /* node:sqlite 不可用就返回空 map */ }
  return map;
}

/**
 * 单独导出：本机检测到的账号 USER.md 完整路径
 *
 * 用途：给 agent 直接可见的写入目标（省得它自己拼路径 / 换文件名）。
 *
 * ── 为什么写 USER.md 而不是 MEMORY.md（2026-11-05 实测后改）──
 *
 * WorkBuddy 每次会话开头无条件注入的身份文件，只有 4 个：
 *   SOUL.md / BOOTSTRAP.md / IDENTITY.md / USER.md
 *   （会话 jsonl 的 identity_context 块里，MEMORY.md 的内容 = 0 处）
 *    ↓
 * 之前让 agent 写 MEMORY.md → 下次会话根本不注入 → 白写。
 * 而 USER.md 每次新会话都会注入，且 WorkBuddy 允许 agent 自己更新它
 * （SOUL.md 里原话：Update SOUL.md, IDENTITY.md, and USER.md as you learn things）。
 *    ↓
 * 所以写入目标改成 USER.md。
 */
export function accountMemoryPaths() {
  const wb = wbHome();
  const out = [];
  let ents = [];
  try { ents = fs.readdirSync(wb, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (!e.isDirectory() || !/^user-.+-personal$/.test(e.name)) continue;
    out.push(path.join(wb, e.name, 'USER.md'));
  }
  return out;
}

/**
 * 单独导出：云端会话（手机版）清单
 *
 * 用途：用户看不到这些（WorkBuddy 侧栏只显示本地会话），
 * 但它们在 workbuddy.db 里有元数据（标题/时间/账号）。
 * 我们把它显示出来，用户至少知道"手机版上还有这些"。
 *
 * 注意：只有元数据，没有正文（正文在云端服务器，本地无文件）。
 */
export function listCloudSessions(dataDir) {
  const accounts = loadAccounts(dataDir);
  const sessIdx = loadSessionIndex();
  return sessIdx.cloud.map((c) => ({
    id: c.id,
    title: c.title,
    account: accName(accounts, c.uid),
    uid: c.uid,
    origin: c.origin,
    createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
    updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
  }));
}

export { fp as fingerprint, accName };