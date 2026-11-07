/**
 * WorkBuddy 专属：导出「给 agent 直接读的文件」
 *
 * ── 为什么需要这个 ──
 *
 * 实测（2026-11-02，WorkBuddy 原话）：
 *   「WebFetch 被『安全中心 → 网络安全』策略阻断，
 *     原因是 127.0.0.1 属于回环/内网地址，默认不被允许访问。」
 *   「我不会绕过安全策略改用其他命令去访问同一地址。」
 *   「改用本地文件读取：如果这份长期记忆备份在磁盘上有对应文件，
 *     直接给我路径，我用文件读取方式打开，不经过网络策略。」
 *
 * 所以 HTTP 查询在 WorkBuddy 里默认【走不通】。
 * 但它能读本地文件 —— 而我们的库本来就是 markdown 文件。
 *
 * 这个模块把「给 agent 的那两份东西」写成磁盘文件：
 *   ① agent-rules.md   ← 完整引导（同 /agent-rules 的内容）
 *   ② index.md         ← 全部记录的索引（标题/类型/账号/项目/时间/文件路径）
 *
 * 这样 agent 完全不碰网络，就能：读引导 → 读索引 → 按路径读正文。
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildGuide, memoryBlock, userSentence } from './wb-guide.js';
import { accountMemoryPaths, listCloudSessions } from './wb-sync.js';

/** 导出目录（相对数据目录）：<dataDir>/agent/ */
export function exportDirOf(dataDir) {
  return path.join(dataDir, 'agent');
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 一行摘要：把换行压掉、裁短 */
function oneLine(s, n = 70) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
}

/**
 * 记录自身的日期
 *
 * 注意：不能直接用 created_at —— 那是【导入我们库】的时间，
 * 不是记录本身发生的时间。标题里通常带着真实日期（如「2026-10-17 …」），
 * 所以优先从标题取；取不到才退回 created_at。
 */
function recordDate(it) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(it.title || ''));
  if (m) return m[1];
  const t = fmtTime(it.created_at);
  return t ? t.slice(0, 10) : '';
}

/**
 * 生成索引（markdown，给 agent 读）
 *
 * 结构：按账号分组 → 按项目分组 → 逐条列出
 * 每条带：类型、标题、时间、正文文件路径（相对数据目录）
 */
function buildIndex(store, dataDir) {
  const all = store.list({ limit: 100000 });
  const items = all.items || [];
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;

  const L = [];
  L.push('# Buddy Trace · 索引');
  L.push('');
  L.push(`> 生成时间：${stamp}　共 ${items.length} 条记录`);
  L.push('>');
  L.push('> **正文文件在哪里**：索引里的路径是**相对于数据目录**的。');
  L.push(`> 数据目录：\`${dataDir}\``);
  L.push('> 例如路径 `prj-xxx/memory/2026-10-16-xxx.md`，');
  L.push(`> 完整位置就是 \`${dataDir}\\prj-xxx\\memory\\2026-10-16-xxx.md\`。`);
  L.push('');
  L.push('**怎么用**：先按下面的分组找到相关的记录，再按路径打开正文文件。');
  L.push('不用全读 —— 看标题和摘要判断哪几条相关就够了。');
  L.push('');

  if (!items.length) {
    L.push('（库还是空的 —— 还没有从 WorkBuddy 同步到任何记录）');
    return L.join('\n') + '\n';
  }

  // 按账号分组，账号内按项目分组
  const byAcct = new Map();
  for (const it of items) {
    const acct = it.account || '未标注账号';
    if (!byAcct.has(acct)) byAcct.set(acct, new Map());
    const byProj = byAcct.get(acct);
    const proj = it.project || '未归类';
    if (!byProj.has(proj)) byProj.set(proj, []);
    byProj.get(proj).push(it);
  }

  // 账号顺序：条数多的在前
  const acctSorted = [...byAcct.entries()].sort((a, b) => {
    const na = [...a[1].values()].reduce((s, v) => s + v.length, 0);
    const nb = [...b[1].values()].reduce((s, v) => s + v.length, 0);
    return nb - na;
  });

  for (const [acct, byProj] of acctSorted) {
    const total = [...byProj.values()].reduce((s, v) => s + v.length, 0);
    L.push(`## 账号：${acct}（${total} 条）`);
    L.push('');
    const projSorted = [...byProj.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [proj, list] of projSorted) {
      L.push(`### 项目：${proj}（${list.length} 条）`);
      L.push('');
      // 时间倒序
      const sorted = list.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      for (const it of sorted) {
        const d = recordDate(it);
        const sum = oneLine(it.summary, 50);
        L.push(`- \`${it.kind}\` **${it.title}**${d ? '  — ' + d : ''}`);
        if (sum) L.push(`  ${sum}`);
        L.push(`  \`${it.file_path}\``);
      }
      L.push('');
    }
  }

  return L.join('\n') + '\n';
}

/** 云端会话（手机版）那一节 —— 单独列出，因为它内容不在本地 */
function buildCloudSection(store, dataDir) {
  const list = listCloudSessions(dataDir);
  if (!list.length) return '';
  const L = [];
  L.push('## 手机版（云端）会话 —— 内容不在本地');
  L.push('');
  L.push('这些是在手机版 WorkBuddy 里干的，**内容在云端服务器**，本地没有正文。');
  L.push('（WorkBuddy 自己的界面上也看不到它们。）');
  L.push('如果用户提到这些，可以把清单告诉他，但**不要假装你看过内容**。');
  L.push('');
  for (const s of list) {
    const d = (s.createdAt || '').slice(0, 10);
    L.push(`- **${s.title}** — ${d} — ${s.account}`);
  }
  L.push('');
  return L.join('\n');
}

/**
 * 导出（每次同步后调用）
 *
 * @param {object} opts
 * @param {import('./store.js').Store} opts.store
 * @param {string} opts.dataDir
 * @param {number} opts.port
 * @returns {{ok: boolean, dir: string, files: string[], bytes: number}}
 */
export function exportAgentArtifacts({ store, dataDir, port }) {
  const dir = exportDirOf(dataDir);
  fs.mkdirSync(dir, { recursive: true });

  const accounts = store.listAccounts();
  // selfBlock 也要带真实路径 —— 否则 agent 抄进 MEMORY.md 的是 <导出目录> 占位符
  // （2026-11-03 实测：WorkBuddy 拿到占位符，只能自己猜路径）
  const selfBlock = memoryBlock(port, 'zh', { dataDir, exportDir: dir });
  const accountPaths = accountMemoryPaths();

  // ① 引导（同 /agent-rules 内容，但要告诉它「用文件方式查」）
  const guide = buildGuide(port, {
    accounts,
    lang: 'zh',
    selfBlock,
    accountPaths,
    dataDir,
    exportDir: dir,
  });
  const guidePath = path.join(dir, 'agent-rules.md');
  fs.writeFileSync(guidePath, guide, 'utf8');

  // ② 索引
  const index =
    buildIndex(store, dataDir) +
    (buildCloudSection(store, dataDir) ? '\n---\n\n' + buildCloudSection(store, dataDir) : '');
  const indexPath = path.join(dir, 'index.md');
  fs.writeFileSync(indexPath, index, 'utf8');

  // ③ 给用户那句话（方便用户直接复制）
  const sentencePath = path.join(dir, '给用户的一句话.txt');
  fs.writeFileSync(sentencePath, userSentence(port, 'zh', guidePath), 'utf8');

  let bytes = 0;
  for (const f of [guidePath, indexPath, sentencePath]) {
    try { bytes += fs.statSync(f).size; } catch { /* 忽略 */ }
  }

  return {
    ok: true,
    dir,
    files: [guidePath, indexPath, sentencePath],
    bytes,
  };
}