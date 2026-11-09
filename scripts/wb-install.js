#!/usr/bin/env node
/**
 * Buddy Trace · 安装向导
 *
 * 做两件事：
 *   ① 往每个 WorkBuddy 账号的 MEMORY.md 里写一段引导
 *      （MEMORY.md 是每次会话【无条件自动注入】的，所以写进去 agent 必定知道）
 *   ② 打印给用户的一句话（粘贴给新 agent 用）
 *
 * 安全：
 *   - 写之前自动备份（MEMORY.md.bak-<时间戳>）
 *   - 已存在引导段就不重复写（幂等，可反复运行）
 *   - 支持 --dry 先看要改什么
 *   - 支持 --revert 撤销（从备份恢复）
 *
 * 用法：
 *   node scripts/wb-install.js --port 41829 --dry
 *   node scripts/wb-install.js --port 41829
 *   node scripts/wb-install.js --revert
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DEFAULT_PORTS } from '../src/ports.js';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1]?.startsWith('--') ? true : (process.argv[++i] ?? true);
}

const PORT = args.port || DEFAULT_PORTS[0];
const DRY = !!args.dry;
const REVERT = !!args.revert;
// 默认 false：不写 WorkBuddy 的文件（法律风险）。
// 只有用户明确加 --write 才写。
const WRITE = !!args.write;
const WB = process.env.BT_WB_HOME || path.join(os.homedir(), '.workbuddy');
// 数据目录（决定导出文件在哪）
//
// 注意：脚本在 code/scripts/ 下，而数据目录在项目的 data/（跟 code 平级）。
// 所以要从 scripts/ 往上两级 —— 之前只上了一级，路径算错了。
const DATA_DIR = path.resolve(
  args.data
  || process.env.BT_DATA
  || path.join(import.meta.dirname || '.', '..', '..', 'data'),
);
// 给 agent 的引导文件（本地绝对路径 —— 不走网络）
const GUIDE_FILE = path.join(DATA_DIR, 'agent', 'agent-rules.md');
const INDEX_FILE = path.join(DATA_DIR, 'agent', 'index.md');

const START = '<!-- LBASE-WORKBUDDY-BEGIN -->';
const END = '<!-- LBASE-WORKBUDDY-END -->';

function accountsDirs() {
  let ents = [];
  try { ents = fs.readdirSync(WB, { withFileTypes: true }); } catch { return []; }
  return ents
    .filter((e) => e.isDirectory() && /^user-.+-personal$/.test(e.name))
    .map((e) => ({ uid: e.name.replace(/^user-/, '').replace(/-personal$/, ''), dir: path.join(WB, e.name) }));
}

function nickname(uid) {
  // 优先用 accounts.json 里抓到的昵称（扫描时从登录快照抓的）
  const cands = [
    path.join(process.cwd(), 'data', 'accounts.json'),
    path.join(import.meta.dirname || '.', '..', 'data', 'accounts.json'),
    path.join(import.meta.dirname || '.', '..', '..', 'data', 'accounts.json'),
  ];
  for (const p of cands) {
    try {
      const d = JSON.parse(fs.readFileSync(p, 'utf8'));
      const a = (d.accounts || {})[uid];
      if (a && a.nickname) return a.nickname;
    } catch { /* 试下一个 */ }
  }
  return '账号 ' + uid.slice(0, 8);
}

/**
 * 打印「用户粘给 agent 的那句话」
 *
 * 设计原则（用户明确）：
 *   ① 我们不碰 WorkBuddy 的任何文件 —— 改它的文件涉嫌违法。
 *      只让用户粘一次，剩下的事由 agent 自己完成。
 *   ② 给【硬盘绝对路径】而不是网址 ——
 *      实测（2026-11-02）：WorkBuddy 的网络策略会拦 127.0.0.1，
 *      HTTP 访问被「安全中心 → 网络安全」阻断。
 *      但读本地文件不经过网络，一定可用。
 */
function userPrompt() {
  return [
    '我装了一个本地记忆库，是你自己的长期记忆备份。',
    '',
    '先读一下这个文件（本地文件，直接打开就行）：',
    GUIDE_FILE,
    '',
    '读完按里面的要求做 —— 特别是第零章，让你把自己接进去，',
    '这样以后你每开一个新会话，都会自动知道来查。',
  ].join('\n');
}

/**
 * 「让 agent 自己写进 MEMORY.md」的内容
 *
 * 注意：这段的完整版在 src/wb-guide.js 的 buildGuide() 里（作为「第零章」），
 * 由 /agent-rules 输出。这里只保留 selfBlock（给 agent 抄的那段正文）。
 * 我们不写 WorkBuddy 的文件 —— 改它的文件涉嫌违法。
 */
function block() {
  const base = `http://127.0.0.1:${PORT}`;
  return [
    START,
    '## Buddy Trace',
    '',
    '是你**自己的长期记忆备份** —— 存着这个用户和你',
    '（在**所有 WorkBuddy 账号、所有会话**里）做过的一切。',
    '',
    '**什么时候查（重要）**：只要冒出「这事之前是不是干过」的念头，立刻查。',
    '查一次成本极低，不查的代价很高（重复劳动、推翻用户已定的方案）。',
    '',
    '听到用户说这些话，就是历史话题 —— 先查再答：',
    '```',
    '· 指回过去：「接着上次」「继续」「之前那个」「还是那个」「老样子」',
    '            「你之前弄的」「我是不是弄过」「就那个」',
    '· 问原因：  「当初为什么这么做」「为什么这么定」「什么时候改的」',
    '            ← 这类问题只有这个库能回答（变更有当时的推理过程）',
    '· 要接手：  「接着做完」「继续那个项目」「上次没做完的」',
    '· 对不上：  人名/项目名/文件名你听着耳熟却想不起来',
    '```',
    '**不用等用户开口。** 另外 —— **别以为自己记得就不查**：',
    '你的记忆可能被压缩过、可能是旧结论、也可能压根不是这个会话的。',
    '',
    '**怎么查**（两种都行；实测 curl 能用，WebFetch 会被拦）：',
    '```',
    '① 能跑命令就用 HTTP（推荐，能搜能筛）：',
    `   curl.exe -sS "${base}/api/list?limit=100"`,
    `   curl.exe -sS "${base}/api/cloud-sessions"    ← 手机版会话清单`,
    `   curl.exe -sS -X POST "${base}/api/search" -H "Content-Type: application/json" -d '{"q":"<关键词>"}'`,
    '',
    '② 跑不了命令就读本地文件（不经过网络，一定可用）：',
    '   索引 ' + INDEX_FILE,
    '   正文 按索引给的路径打开（相对于数据目录 ' + DATA_DIR + '）',
    '```',
    '**不要全读** —— 看标题判断哪几条相关，只打开那几条。',
    '',
    '**注意**：`/api/cloud-sessions` 里那些是【手机版】会话 —— 只有标题和时间，',
    '**正文在云端、本地没有**。能告诉用户"这事在哪"，但别假装看过内容。',
    '',
    '**你只需读，不需写。** 库里的数据是从 WorkBuddy 磁盘自动同步的。',
    END,
    '',
  ].join('\n');
}

/** 给 agent 抄进自己 MEMORY.md 的那段（不含 BEGIN/END 标记，因为那是它自己的文件） */
function selfBlock() {
  return block().replace(START + '\n', '').replace('\n' + END + '\n', '');
}

function installOne(acct) {
  const file = path.join(acct.dir, 'MEMORY.md');
  const name = nickname(acct.uid);
  const info = { uid: acct.uid, name, file, action: '', backup: null };

  let original = '';
  if (fs.existsSync(file)) {
    original = fs.readFileSync(file, 'utf8');
  } else {
    info.action = '新建 MEMORY.md';
  }

  const seg = block();

  if (original.includes(START)) {
    // 已装过 → 替换旧段（保证内容最新）
    const re = new RegExp(`${START}[\\s\\S]*?${END}\\n?`, 'm');
    const next = original.replace(re, seg);
    if (next === original) { info.action = '已是最新，跳过'; return info; }
    info.action = '更新已有引导段';
    if (!DRY) {
      backup(file, original, info);
      fs.writeFileSync(file, next, 'utf8');
    }
    return info;
  }

  info.action = info.action || '追加引导段';
  if (!DRY) {
    if (original) backup(file, original, info);
    const next = original.trimEnd() + '\n\n' + seg;
    fs.writeFileSync(file, next, 'utf8');
  }
  return info;
}

function backup(file, content, info) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const b = `${file}.bak-${ts}`;
  fs.writeFileSync(b, content, 'utf8');
  info.backup = b;
}

function revertOne(acct) {
  const file = path.join(acct.dir, 'MEMORY.md');
  const dir = path.dirname(file);
  // 关键：要恢复【最早的那个干净备份】，不是最近的那个
  // （因为每次更新都会先备份，最近的备份里可能已经含我们写的段）
  const baks = fs.readdirSync(dir)
    .filter((f) => f.startsWith('MEMORY.md.bak-'))
    .sort();   // 按名字升序（时间戳格式，最早的在前）
  if (!baks.length) return { uid: acct.uid, action: '没有备份，跳过' };
  // 从最早往后找第一个「不含我们先前的段」的备份 —— 那才是真正干净的
  let chosen = null;
  for (const b of baks) {
    try {
      const c = fs.readFileSync(path.join(dir, b), 'utf8');
      if (!c.includes(START)) { chosen = b; break; }
    } catch { /* 跳过读不了的 */ }
  }
  if (!chosen) {
    return { uid: acct.uid, action: '所有备份都含我们写的段，无法自动恢复（需手工处理）' };
  }
  if (!DRY) fs.copyFileSync(path.join(dir, chosen), file);
  return { uid: acct.uid, action: `已从最早的干净备份 ${chosen} 恢复` };
}

function main() {
  const accts = accountsDirs();

  console.log('Buddy Trace · 接入向导');
  console.log(`  端口: ${PORT}`);
  console.log(`  WorkBuddy 目录: ${WB}`);
  console.log('');

  // ── 默认行为：不写任何 WorkBuddy 文件，只给用户一句话 ──
  // 理由（用户明确，2026-11-01）：改 WorkBuddy 的文件涉嫌违法（违反其用户协议）。
  // 我们只让用户【粘一次】，剩下的事由 agent 自己做。
  if (!WRITE && !REVERT) {
    console.log('我们不会修改 WorkBuddy 的任何文件。');
    console.log('');
    if (accts.length) {
      console.log('还没接入的账号：' + accts.map((a) => nickname(a.uid)).join('、'));
    }
    console.log('');
    console.log('在 WorkBuddy 里【新开一个会话】，把下面这段话发给它：');
    console.log('');
    console.log('─'.repeat(62));
    console.log(userPrompt().split('\n').map((l) => '  ' + l).join('\n'));
    console.log('─'.repeat(62));
    console.log('');
    console.log(`（AI 会自动接进来。每个账号做一次。想看细节：http://127.0.0.1:${PORT}/agent-rules）`);
    console.log('');
    console.log('（旧行为：--write 让我们直接写。不推荐 —— 有法律风险，且 agent 自己就能做。）');
    return;
  }

  // ── 撤销：把之前写进去的引导段恢复掉 ──
  if (REVERT) {
    if (!accts.length) { console.log('没有找到 WorkBuddy 账号目录'); return; }
    console.log('撤销之前写入的引导段（从备份恢复）：');
    for (const a of accts) {
      const r = revertOne(a);
      console.log(`  ${nickname(a.uid)}  (${a.uid.slice(0, 8)})`);
      console.log(`     ${r.action}`);
    }
    return;
  }

  // ── 显式 --write：仍然支持，但要用户明确要求 ──
  if (!accts.length) { console.log('没有找到 WorkBuddy 账号目录'); return; }
  console.log('⚠️  --write：直接修改 WorkBuddy 的 MEMORY.md（有法律风险，不推荐）');
  console.log('    推荐改回默认方式：让 agent 自己写。');
  console.log('');
  for (const a of accts) {
    const r = installOne(a);
    console.log(`  ${(r.name || nickname(a.uid))}  (${a.uid.slice(0, 8)})`);
    console.log(`     ${r.action}`);
    if (r.backup) console.log(`     备份 → ${path.basename(r.backup)}`);
  }
}

main();