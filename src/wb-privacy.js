/**
 * WorkBuddy 专属：内容可见性规则（隐私隔离）
 *
 * ── 为什么需要 ──
 *
 * 一台电脑上可能登录过多个 WorkBuddy 账号（不同的人）。
 * 我们把它们的记录汇总到一个库里 —— 如果直接展示给人看，
 * A 就能看到 B 的内容，这是侵犯隐私。
 *
 * 老板定的规则（2026-11-02）：
 *   「库无法区分用户登录，那就把内容加密不允许用户看，
 *     只允许 agent 调用。agent 有 UID，用 UID 区分。」
 *   「技能可以看。记忆可以看（MEMORY.md 那样的 MD 文件、配置文件可以看），
 *     但是具体的项目记忆不让看 —— 只显示存入了多少条。」
 *
 * ── 规则表 ──
 *
 * | 库 | 人能不能看内容 | 说明 |
 * |---|---|---|
 * | 技能库 skill        | ✅ 能看 | 公共的，所有 agent 共用 |
 * | 知识库 wiki         | ✅ 能看 | 项目 MEMORY.md 这类长期记忆文件 |
 * | WorkBuddy 记忆备份  | ✅ 能看 | 账号级 MEMORY.md 的备份（配置文件） |
 * | 上下文记忆库 memory | ❌ 只看条数 | 具体项目的对话记忆，属于隐私 |
 * | 溯源库 changelog| ❌ 只看条数 | 具体项目的改动记录，属于隐私 |
 *
 * ── uid 怎么来 ──
 *
 * · agent 调用：必须带 uid（`?uid=<完整uid>`）。不带 = 非法调用，直接拒绝。
 *   agent 从自己开局上下文里的 `user-<uid>-personal\SOUL.md` 就能读出 uid。
 * · 界面调用：不带 uid —— 服务自动取「当前登录的 WorkBuddy 账号」
 *   （读 storage/skeleton/account-snapshot.json）。
 *
 * ── 二期才做的事（一期不做） ──
 *
 * 冒用问题：同机同 Windows 用户下，A 能读到 B 的目录 → 知道 B 的 uid → 能冒充。
 * 一期不解决，只保证「不主动泄露 + 挡住误用」。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * 人能看正文的库
 *
 * 分两类：
 *   ① 内部库：技能 / 知识 / WorkBuddy 记忆备份 —— 这些本来就是给用户看的
 *   ② 外部库（external-*）：用户在界面上自己粘贴链接抓进来的 ——
 *      那是他自己找的东西，不涉及别人的隐私，必须给他看
 *
 * 老板明确（2026-11-02）：
 *   「我抓取的，我在电脑上操作的，并不是 WorkBuddy 来操作的。
 *     我是不是应该获取了以后应该给我展示出来？」
 *   → 对。自己抓的东西凭什么不给看。
 */
export const VISIBLE_KINDS = new Set([
  'skill', 'wiki', 'agent-memory',
  'external-candidate', 'external-wiki', 'external-skill',
]);

/**
 * 只给标题、不给正文的库
 *
 * 老板明确（2026-11-02）：
 *   「不要把整库内容隐藏，显示标题是没问题的，但是让用户点开看不到具体内容就行，
 *     不然用户会认为这个库里没东西。」
 *   → 标题、时间、账号照常显示；正文不给。
 *
 * 这两个库是 WorkBuddy 自己产生的（对话记忆、改动记录），
 * 一台电脑上可能登录过不同的人，直接展示会看到别人的东西。
 */
export const HIDDEN_KINDS = new Set(['memory', 'changelog']);

/**
 * 「会话实录」这个项目例外：它是我们【提炼过的摘要】，不是原始对话。
 *
 * 为什么（2026-11-03）：
 *   会话实录的内容是「这个会话干了什么 + 为什么」的提炼结果，
 *   不含原始对话全文，也不含别人的隐私（已按 uid 过滤）。
 *   如果也藏起来，用户看不到"我让它干过什么活" —— 那这个功能就白做了。
 *
 * 判断方式：看项目名（这是我们自己建的项目，名字固定）
 */
export const VISIBLE_PROJECTS = new Set(['WorkBuddy 会话实录']);

/** 这个库的内容能不能给人看全文 */
export function canViewContent(kind, project) {
  if (project && VISIBLE_PROJECTS.has(project)) return true;
  return VISIBLE_KINDS.has(kind);
}

/** WorkBuddy 数据根目录 */
function wbHome() {
  return process.env.BT_WB_HOME || path.join(os.homedir(), '.workbuddy');
}

/**
 * 当前登录的 WorkBuddy 账号 uid
 *
 * 实测：account-snapshot.json 只在登录时存在，退出登录会被删掉。
 * 所以读不到 = 现在没登录任何账号。
 *
 * @returns {string} uid，没有就返回空字符串
 */
export function currentLoginUid() {
  const p = path.join(wbHome(), 'storage', 'skeleton', 'account-snapshot.json');
  try {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    return String((d.primary && d.primary.uid) || '');
  } catch {
    return '';
  }
}

/**
 * 解析这次请求该用哪个 uid
 *
 * 规则（老板 2026-11-02）：
 *   「调用不是 agent 调用吧，不存在不带 UID 的调用，只要 agent 调用这个 agent 就带 UID。」
 *
 * 所以：
 *   · 带了 uid → 是 agent 调用，按这个 uid 取数据
 *   · 带了 *   → 显式"查全部账号"（老板 2026-11-13 加：
 *                 agent 不知道 uid 时不能只给个残缺结果还不吭声）
 *   · 没带 uid → 不是合法调用。一律当"无身份"，只给全局内容（技能），
 *                不回退到"当前登录账号" —— 否则浏览器直接打开就等于冒用登录者身份。
 *
 * @param {URL} url
 * @returns {{uid: string, from: 'agent'|'all'|'none'}}
 */
export function resolveUid(url) {
  const q = url.searchParams.get('uid');
  if (q && q.trim()) {
    const v = q.trim();
    return { uid: v, from: v === '*' ? 'all' : 'agent' };
  }
  return { uid: '', from: 'none' };
}

/**
 * 过滤记录：只留这个 uid（及其账号组内的其他 uid）+ 全局的
 *
 * @param {Array} items
 * @param {string} uid
 * @param {Array<string>} [groupUids] 同组的其他 uid（老板主动合并的账号）
 */
export function filterByUid(items, uid, groupUids) {
  const self = String(uid || '').trim();

  // 显式全量：agent 用 ?uid=* 要求"这台机器上所有账号的记录都给我"
  // （正文仍受 canViewContent / body=1 限制，这里只是不过滤归属）
  if (self === '*') return items.slice();

  // 把「自己 + 同组」合成一个集合
  const allowed = new Set();
  if (self) allowed.add(self);
  for (const g of (groupUids || [])) {
    if (g) allowed.add(g);
  }

  if (allowed.size === 0) {
    // 没有 uid：只给全局的（技能这类公共内容）
    return items.filter((it) => !it.uid || !String(it.uid).trim());
  }

  return items.filter((it) => {
    const u = String(it.uid || '').trim();
    if (!u) return true;                 // 全局的，所有人可见
    // 一条记录可能属于多个账号（uid 用逗号分隔）
    const owners = u.split(',').map((s) => s.trim());
    return owners.some((o) => allowed.has(o));
  });
}

/**
 * 过滤记录：只留能给人看的库
 *
 * @param {Array} items
 */
export function filterVisible(items) {
  return items.filter((it) => canViewContent(it.kind, it.project));
}

/**
 * 统计（按库分组，含不可看的库）
 *
 * @param {Array} items 已按 uid 过滤过的
 * @returns {Object} { kind: count }
 */
export function countByKind(items) {
  const out = {};
  for (const it of items) out[it.kind] = (out[it.kind] || 0) + 1;
  return out;
}

// ── 账号组（老板主动把多个账号当成同一个人）──────────────────

/** 账号组存在数据目录的 account-groups.json */
function groupFile(dataDir) {
  return path.join(dataDir, 'account-groups.json');
}

/**
 * 读账号组
 *
 * ── 语义反转（2026-11-03 老板定） ──
 *
 * 老板原话：
 *   「本身用户的电脑是自己的，大部分情况都是自己的账号在自己电脑上用。
 *     同事或其他人过来登录的时候很少，即使登录了一下，也不足以在硬盘上
 *     落下什么东西。所以说我们合并账号是常态，不合并账号让用户自己来分开
 *     我们默认是合并的。让用户有特殊需求的话，自己来分离。」
 *   「本身我们要 agent 去查，又不是让人看。混不混进来，agent 会区分，
 *     再说他也不需要区分 —— 反正都是他自己的，他需要蜘蛛就调过来用。
 *     至于蜘蛛是另一个账号的那就无所谓。」
 *
 * 所以存储结构改成：**记「哪些账号被分离了」**，默认全是合并的。
 *
 * 结构：{ "separated": ["uidX", "uidY"], "log": [...] }
 *
 * 语义：
 *   · separated 里没有的账号 → 跟其他所有账号合并（agent 能查全部）
 *   · separated 里的账号        → 单独一组，只查自己
 *
 * @param {string} dataDir
 * @returns {{separated: Array<string>, log: Array}}
 */
export function loadGroups(dataDir) {
  try {
    const d = JSON.parse(fs.readFileSync(groupFile(dataDir), 'utf8'));
    // 兼容旧结构（groups 数组）→ 转成 separated
    // 旧结构里，不在任何组里的账号 = 现在要标成"分离"的
    if (Array.isArray(d.groups) && !Array.isArray(d.separated)) {
      const inGroups = new Set();
      for (const g of d.groups) for (const u of g) inGroups.add(u);
      // 旧结构下"没进组"的账号，在新语义里就是"分离"的
      // 但我们不知道总共有哪些账号，所以只记旧结构里组内的
      return {
        separated: [],       // 新语义默认全合并
        log: Array.isArray(d.log) ? d.log : [],
      };
    }
    return {
      separated: Array.isArray(d.separated) ? d.separated : [],
      log: Array.isArray(d.log) ? d.log : [],
    };
  } catch {
    return { separated: [], log: [] };
  }
}

/** 存账号组 */
function saveGroups(dataDir, data) {
  fs.writeFileSync(groupFile(dataDir), JSON.stringify(data, null, 2), 'utf8');
}

/**
 * 某 uid 能一起查的其他 uid
 *
 * ── 默认合并（2026-11-03 老板定） ──
 *
 * 「我们合并账号是常态，不合并账号让用户自己来分开」
 *
 * 所以：
 *   · 没被分离的账号 → 返回【所有其他账号】（agent 能查全部）
 *   · 被分离的账号   → 返回空（只查自己）
 *
 * @param {string} dataDir
 * @param {string} uid
 * @param {Array<string>} [allUids] 这台机器上的所有账号（不传就只能返回空）
 * @returns {Array<string>}
 */
export function groupMatesOf(dataDir, uid, allUids) {
  if (!uid) return [];
  const { separated } = loadGroups(dataDir);

  // 自己被分离了 → 只查自己
  if (separated.includes(uid)) return [];

  // 默认：跟其他所有【没被分离】的账号一起查
  const others = (allUids || []).filter((u) => u && u !== uid && !separated.includes(u));
  return others;
}

/**
 * 分离某个账号（让它单独一组，不再跟别人混）
 *
 * 老板明确（2026-11-03）：
 *   「其中一个账号比如说其中是他同事的，他不想把他的记忆跟他同事的记忆搞混了，
 *     那他手动分离，我们只做一个分离功能就行了。」
 *
 * @param {string} dataDir
 * @param {string} uid
 * @param {object} [ctx] { note }
 * @returns {{ok: boolean, separated?: Array, error?: string}}
 */
export function separateAccount(dataDir, uid, ctx = {}) {
  const target = String(uid || '').trim();
  if (!target) return { ok: false, error: '缺少账号标识' };

  const data = loadGroups(dataDir);
  if (!data.separated.includes(target)) data.separated.push(target);

  data.log = data.log || [];
  data.log.push({
    at: new Date().toISOString(),
    action: 'separate',
    uids: [target],
    note: ctx.note || '',
    host: os.hostname(),
    user: (os.userInfo && os.userInfo().username) || '',
  });
  if (data.log.length > 200) data.log = data.log.slice(-200);

  saveGroups(dataDir, data);
  return { ok: true, separated: data.separated };
}

/**
 * 取消分离（让它重新跟其他账号合并）
 *
 * @param {string} dataDir
 * @param {string} uid
 * @returns {{ok: boolean, separated?: Array, error?: string}}
 */
export function unseparateAccount(dataDir, uid) {
  const target = String(uid || '').trim();
  if (!target) return { ok: false, error: '缺少账号标识' };

  const data = loadGroups(dataDir);
  const before = data.separated.length;
  data.separated = data.separated.filter((u) => u !== target);

  if (data.separated.length === before) {
    return { ok: false, error: '这个账号本来就没有分离' };
  }

  data.log = data.log || [];
  data.log.push({
    at: new Date().toISOString(),
    action: 'unseparate',
    uids: [target],
    host: os.hostname(),
    user: (os.userInfo && os.userInfo().username) || '',
  });
  if (data.log.length > 200) data.log = data.log.slice(-200);

  saveGroups(dataDir, data);
  return { ok: true, separated: data.separated };
}

/**
 * 合并一组账号（旧接口，保留兼容）
 *
 * 注意：新语义下"合并"是默认状态，这个函数现在做的是【取消分离】。
 *
 * @deprecated 新代码请用 unseparateAccount
 */
export function mergeAccounts(dataDir, uids, ctx = {}) {
  const clean = [...new Set((uids || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!clean.length) return { ok: false, error: '至少要选一个账号' };

  const data = loadGroups(dataDir);
  data.separated = data.separated.filter((u) => !clean.includes(u));

  data.log = data.log || [];
  data.log.push({
    at: new Date().toISOString(),
    action: 'merge',
    uids: clean,
    actorUid: ctx.actorUid || '',
    note: ctx.note || '',
    host: os.hostname(),
    user: (os.userInfo && os.userInfo().username) || '',
  });
  if (data.log.length > 200) data.log = data.log.slice(-200);

  saveGroups(dataDir, data);
  return { ok: true, separated: data.separated };
}

/**
 * 给界面用的：账号现状（默认合并语义）
 *
 * 老板明确（2026-11-03）：
 *   「我们只是标识有不同的账号。这样的话可以让用户看到有多个账号。
 *     其中一个账号比如说其中是他同事的，他不想把他的记忆跟他同事的记忆搞混了，
 *     那他手动分离，我们只做一个分离功能就行了。」
 *
 * 老板又纠正（2026-11-03）：
 *   「只显示最后登录时间就行了，不要显示当前，因为它没有当前啊，
 *     我当前一个也没开，你给我显示这是当前，这啥意思？」
 *
 * 所以：**不标「当前」，只显示每个账号的最后一次使用时间。**
 * 时间从 sessions 表算（MAX(updated_at)），不是从"现在有没有登录"猜。
 *
 * @param {string} dataDir
 * @param {Array} accounts store.listAccounts() 的结果
 * @param {string} currentUid 当前登录账号（只给内部逻辑用，不显示成「当前」）
 * @param {Map} [lastUsed] uid → 最后使用时间（ISO 字符串）
 */
export function groupStatus(dataDir, accounts, currentUid, lastUsed) {
  const { separated } = loadGroups(dataDir);
  const nameOf = (uid) => {
    const hit = (accounts || []).find((a) => a.uid === uid);
    return (hit && hit.account) || ('账号 ' + uid.slice(0, 8));
  };

  const list = (accounts || []).map((a) => ({
    uid: a.uid,
    name: nameOf(a.uid),
    total: a.total || 0,
    separated: separated.includes(a.uid),
    // 最后一次使用时间（没有就是空字符串）
    lastUsed: (lastUsed && lastUsed.get(a.uid)) || '',
  }));

  return {
    // ⚠ currentUid 必须返回 —— 前端用它判断"有没有账号可用"
    // （2026-11-04 踩过：我以为不显示就不用返回，结果前端一直显示"需要登录"，
    //   分离按钮根本不出现。字段可以不显示，但接口必须给。）
    currentUid: currentUid || '',
    accounts: list,
    count: list.length,
    separatedCount: separated.length,
    allMerged: separated.length === 0,
  };
}