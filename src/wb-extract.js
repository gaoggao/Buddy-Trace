/**
 * WorkBuddy 专属：从 jsonl 会话记录里提炼「干了什么活」
 *
 * ── 为什么需要（2026-11-03 实测） ──
 *
 * WorkBuddy 的记忆（MEMORY.md）是「它愿意总结的」—— 很多活它压根不写。
 * 实测（2026-11-03）：某次做了完整项目（网页/图片/音乐，产物 30 MB+），
 * 但 memory 目录里一个字都没有。
 *
 * 但它的会话记录（jsonl）里什么都有：
 *   实测一个 3 MB 的会话：
 *     · message              43 条  ← 用户说了什么、agent 答了什么
 *     · reasoning            32 条  ← 每一步为什么这么做
 *     · function_call       265 条  ← 它实际跑了什么命令
 *     · function_call_result 265 条  ← 命令返回了什么
 *     · file-history-snapshot 25 条  ← 改了哪些文件
 *
 * ── 数据在哪 ──
 *
 *   ~/.workbuddy/projects/<工作区>/<会话id>.jsonl
 *
 *   实测：17 个电脑版会话 = 17 个 jsonl，26 MB，跨度 44 天。
 *   （手机版会话没有 jsonl —— 内容在云端，我们早前实测过）
 *
 * ── 字段结构（踩过坑，记下来） ──
 *
 *   message 行：   r.content[] 里 type=input_text / output_text 的 text
 *   reasoning 行： r.content[] 是空的，真内容在 r.rawContent[] 的 reasoning_text
 *   （一开始读 providerData.reasoning 和 message.content，全是空）
 *
 * ── 提炼原则（给所有用户，不是针对某台电脑） ──
 *
 *   ① 只取「有意义的动作」，跳过查询类（ls / cat / grep / find）
 *      —— 因为查询的输出会把整盘文件列表都带进来，是噪音
 *   ② 剥掉 system-reminder 之类的注入内容，只留用户真正说的话
 *   ③ 一个会话 = 一条记录（标题用 ai-title 或首条用户消息）
 *   ④ 产出路径只认「它自己创建的」（有 mkdir / makedirs / Write 记录）
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

/** WorkBuddy 数据根目录 */
function wbHome() {
  return process.env.BT_WB_HOME || path.join(os.homedir(), '.workbuddy');
}

const fp = (...parts) =>
  crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);

/** 把各种结构里的文字挖出来 */
function textOf(row) {
  const out = [];
  for (const key of ['content', 'rawContent']) {
    const v = row[key];
    if (!Array.isArray(v)) continue;
    for (const x of v) {
      if (x && typeof x === 'object' && typeof x.text === 'string' && x.text) {
        out.push(x.text);
      }
    }
  }
  return out.join('\n').trim();
}

/** 去掉 WorkBuddy 自己注入的噪音（system-reminder / 各种 summary 包裹 / 残留标签） */
function stripNoise(t) {
  let s = String(t || '');

  // 整段是注入内容 → 丢掉
  if (/^<system-reminder|<user_info>|<identity_context>|<cb_summary>|<conversation_history_summary>/i.test(s.trim())) {
    return '';
  }

  // 去掉标签块（成对的）
  s = s.replace(/<system-reminder[\s\S]*?<\/system-reminder>/gi, '');
  s = s.replace(/<[a-z_-]+[^>]*>[\s\S]*?<\/[a-z_-]+>/gi, '');

  // 去掉【残留的单标签】（没有闭合的）—— 实测标题里出现过 </task-notification>
  s = s.replace(/<\/?[a-z_-]+[^>]*>/gi, '');

  // 去掉 task-notification 这类正文
  s = s.replace(/task-notification[\s\S]*/gi, '');

  return s.replace(/\s+/g, ' ').trim();
}

/**
 * 从「上下文压缩摘要」里挖出用户真实说过的话
 *
 * 实测（2026-11-03）：一个会话的 user message 全是 system-reminder，
 * 真人说的话只在 <cb_summary> / <conversation_history_summary> 里，
 * 格式形如：
 *   - User asked: "xxx"
 *   - 用户要求：xxx
 */
function extractFromSummary(t) {
  const s = String(t || '');
  if (!/cb_summary|conversation_history_summary/i.test(s)) return '';

  const picked = [];

  // 英文格式：User asked / user requested / The user asked
  const enRe = /(?:User|user|The user)\s+(?:asked|requested|wants|said|instructed)\s*[:\-]?\s*[“"]?([^\n"”]{8,200})/g;
  let m;
  while ((m = enRe.exec(s)) !== null) picked.push(m[1].trim());

  // 中文格式：用户说 / 用户要求 / 用户提到 / 用户希望
  const zhRe = /用户(?:说|要求|提到|希望|想|问|让)[：:，,]?\s*[“"]?([^\n"”]{6,200})/g;
  while ((m = zhRe.exec(s)) !== null) picked.push(m[1].trim());

  // 英文格式：The user wants to ...
  const enRe2 = /(?:Task|Goal)\s*[:\-]\s*([^\n]{10,200})/gi;
  while ((m = enRe2.exec(s)) !== null) picked.push(m[1].trim());

  if (!picked.length) return '';

  // 去重 + 洗掉残留的英文碎片和标签
  const uniq = [];
  for (const p of picked) {
    let v = p
      // 去掉所有 HTML/XML 标签（含不成对的）
      .replace(/<\/?[a-z_-]+[^>]*>/gi, '')
      // 去掉行首的 "xxx>" 这种闭合标签残片（如 "notification>", "id>"）
      .replace(/^[a-z_-]{1,20}>\s*/gi, '')
      // 去掉句中残留的 "xxx>" 片段
      .replace(/\b[a-z_-]{2,20}>/gi, '')
      // 去掉英文碎片短语
      .replace(/\b(or|and)\s+approved\s+something\.?/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    // 太短的、纯英文碎片的、只剩符号的，丢掉
    if (v.length < 8) continue;
    if (/^[a-z\s.,;:!?>-]+$/i.test(v)) continue;         // 纯英文
    if (/^[^a-zA-Z\u4e00-\u9fff]+$/.test(v)) continue;   // 纯符号
    const k = v.slice(0, 30);
    if (!uniq.some((x) => x.slice(0, 30) === k)) uniq.push(v);
  }
  return uniq.slice(0, 6).join('；');
}

/** 判断一段"用户消息"是不是工具通知/系统指令，而不是人说的话 */
function looksLikeToolNotice(t) {
  const s = String(t).trim();
  // WorkBuddy 内部的工具通知
  if (/^(Use the Task\w+ tool|TaskOutput|Background task|Task \w+ (completed|failed))/i.test(s)) return true;
  if (/^<.*?>/.test(s)) return true;
  if (/^(Notification|System|Tool|Result):/i.test(s)) return true;
  // 全英文的工具说明（人说话一般不会这么写）
  if (/^Use the \w+ tool with /i.test(s)) return true;
  // 纯 JSON
  if (/^[{[][\s\S]*[}\]]$/.test(s)) return true;
  return false;
}

/** 判断这个命令是不是「有意义的动作」（而不是查询） */
function isMeaningfulCall(name, args) {
  const a = typeof args === 'string' ? args : JSON.stringify(args || '');
  if (!a) return false;

  // 先抠出真正的命令文本
  let cmd = '';
  try {
    const o = typeof args === 'string' ? JSON.parse(args) : args;
    cmd = String((o && (o.command || o.cmd)) || '');
  } catch { /* 不是 json，直接用原串 */ }

  const target = cmd || a;

  // ── 明确的写工具，直接算 ──
  if (/^(Write|Edit|NotebookEdit)$/.test(name || '')) return true;

  // ── 纯查询命令：整个命令就是查询（含重定向到 /dev/null 这种）→ 不算 ──
  // 把 2>/dev/null、2>&1、| head 这类"只看不写"的尾巴去掉再判断
  const cleaned = target
    .replace(/\d?>\s*\/dev\/null/g, '')
    .replace(/\d?>\s*&\d/g, '')
    .replace(/\|\s*(head|tail|grep|rg|wc|sort|uniq|awk|sed)\b[^|;]*/g, '')
    .trim();

  const QUERY_START = /^(ls|dir|cat|type|head|tail|grep|rg|find|wc|echo|pwd|which|where|env|stat|file|du|df|tree|more|less|printenv|whoami|date|git status|git log|git diff|npm ls|pip list)\b/i;
  if (QUERY_START.test(cleaned)) {
    // 例外：命令里确实有写动作（比如 `ls && mkdir x`）→ 算
    if (/mkdir|makedirs|New-Item|writeFile|>\s*[A-Za-z]:|copy|move|rm\s|del\s/i.test(cleaned)) return true;
    return false;
  }

  // ── 剩下的看有没有写动作 ──
  // 注意：`python -c "...open(p).read()..."` 这种"读文件"不算动作
  // （实测混进来很多，全是只读探查）
  const READ_ONLY_PY = /python[^;]*open\s*\([^)]*\)\s*(?![\s\S]{0,20}['"]w)/i;
  const hasWrite = /makedirs|mkdir|New-Item|\.write|writeFile|open\([^)]*['"]w['"]|shutil\.(copy|move)|copyfile|copytree|render|build|extract|generate|savefig|imwrite|to_csv|json\.dump|urllib\.request|requests\.get|curl\.exe.*-o|wget|Invoke-WebRequest|download/i.test(target);
  if (!hasWrite) return false;

  // 有写动作，但如果整条命令只是在读+print（没有实际写入/下载），不算
  if (READ_ONLY_PY.test(target) && !/makedirs|mkdir|writeFile|urllib|requests|download|render|savefig|imwrite/i.test(target)) {
    return false;
  }

  return true;
}

/** 从命令里抠出「它创建的路径」 */
function createdPaths(name, args) {
  const a = typeof args === 'string' ? args : JSON.stringify(args || '');
  const out = new Set();
  if (!a) return out;

  // makedirs("D:/xxx") / mkdir -p /some/dir
  const pats = [
    /makedirs?\s*\(\s*[rRbB]?['"]([^'"]{3,200})['"]/g,
    /mkdir\s+-p\s+([^\s;|&]{3,200})/g,
    /New-Item[^;]{0,60}-Path\s+['"]?([^\s'";]{3,200})/g,
    /open\s*\(\s*[rRbB]?['"]([^'"]{3,200})['"][^)]*['"]w['"]/g,
    /writeFileSync\s*\(\s*[rRbB]?['"]([^'"]{3,200})['"]/g,
  ];
  for (const re of pats) {
    let m;
    while ((m = re.exec(a)) !== null) {
      const p = m[1].replace(/\\\\/g, '\\');
      // 只留像路径的（含盘符或斜杠）
      if (/^[A-Za-z]:[\\/]/.test(p) || p.includes('/') || p.includes('\\')) {
        out.add(p);
      }
    }
  }
  return out;
}

/**
 * 判断一次工具调用是不是「搜索」，返回 { kind, query } 或 null
 *
 * 为什么单独分出来（2026-11-04）：
 *   搜索的结果里带着关键词（GEO、普林斯顿、律师事务所…），
 *   那些词必须进库，否则用户搜不到。
 *
 * @returns {{kind: string, query: string}|null}
 */
function describeSearch(name, obj) {
  if (!obj) return null;

  const q = String(obj.query || obj.q || obj.keyword || '').trim();

  if (name === 'WebSearch' && q) {
    return { kind: '搜网页', query: q };
  }

  if (name === 'ToolSearch') {
    const names = obj.tool_names || [];
    return { kind: '查找工具', query: names.join('/') || '' };
  }

  if (name === 'DeferExecuteTool') {
    const tool = String(obj.toolName || '');
    if (/conversation/i.test(tool)) return { kind: '搜对话历史', query: q };
    if (/knowledge/i.test(tool)) return { kind: '搜知识库', query: q };
    return null;   // 其他工具当普通调用
  }

  // Bash 里跑 curl/wget 抓东西，也算搜索
  if (name === 'Bash') {
    const cmd = String(obj.command || '');
    const m = cmd.match(/https?:\/\/[^\s'"]{5,200}/);
    if (m && /curl|wget|Invoke-WebRequest|urllib/i.test(cmd)) {
      return { kind: '抓取', query: m[0] };
    }
  }

  return null;
}

/**
 * 解析一个 jsonl 会话
 *
 * @param {string} filePath
 * @returns {object|null}
 */
/**
 * 解析一个会话 jsonl
 *
 * ── 设计原则（2026-11-04 老板定）──
 *
 * 老板原话：
 *   「你不要在乎这个库会越来越大。他再大能大到哪去，
 *     再大不就是几百兆一个 G 两个 G 的空间吗？还能怎么样？
 *     我们要的是会话内容。不是把他的产物拿过来，我们产物不要，只要会话。」
 *   「满足你刚才说的条件的三轮对话或者是 3000 字以上的会话都要拿过来，
 *     入我们的库。会话记忆。技能。知识库。修改的。溯源的节点。
 *     能拿全拿过来，只要符合条件的。」
 *   「目录指的就是云上的，拿不下来的，我们拿目录能拿下来的，我们都要拿过来。
 *     这才能溯源嘛，不然怎么溯源。」
 *
 * 所以：**全量保留**，不做摘要。
 *   · 用户说的每一句（含从 cb_summary 挖出来的）
 *   · agent 的每一次回复（全文）
 *   · 每一次推理（全文）
 *   · 每一次工具调用（命令原文 + 结果摘要）
 *   · 每一次网页搜索（关键词 + 结果）
 *   · 每一次网页抓取（正文）
 *
 * @param {string} filePath
 * @returns {object|null}
 */
export function parseSession(filePath) {
  let txt = '';
  try { txt = fs.readFileSync(filePath, 'utf8'); } catch { return null; }

  const rows = [];
  for (const line of txt.split('\n')) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    rows.push(o);
  }
  if (!rows.length) return null;

  const sessionId = path.basename(filePath, '.jsonl');
  let cwd = '';
  let title = '';
  let firstTs = 0;
  let lastTs = 0;

  // ── 全量收集（不再挑"有意义"的，全收）──
  const turns = [];      // 完整对话流：{ role, text, ts }
  const reasons = [];    // 推理全文
  const calls = [];      // 工具调用：{ name, args, result, ts }
  const searches = [];   // 搜索：{ kind, query, results }
  const fetches = [];    // 网页抓取：{ url, content }
  const created = new Set();  // 创建的文件路径

  // 工具调用结果按 id 索引（jsonl 里 result 是独立行）
  const resultById = new Map();

  for (const r of rows) {
    if (r.cwd && !cwd) cwd = r.cwd;
    if (r.timestamp) {
      const t = Number(r.timestamp);
      if (t) {
        if (!firstTs || t < firstTs) firstTs = t;
        if (!lastTs || t > lastTs) lastTs = t;
      }
    }

    if (r.type === 'ai-title') {
      const t = r.aiTitle || r.title;
      if (t) title = String(t);
    }

    // ── 工具结果先索引起来（后面配给对应的调用）──
    if (r.type === 'function_call_result') {
      const id = r.id || r.callId || r.toolCallId || '';
      const out = textOf(r);
      if (id && out) resultById.set(id, out);
      continue;
    }

    // ── 用户消息 ──
    if (r.type === 'message' && r.role === 'user') {
      const raw = textOf(r);
      // 真人说的话可能在 cb_summary 里（WorkBuddy 的上下文压缩摘要）
      const fromSummary = extractFromSummary(raw);
      if (fromSummary) turns.push({ role: 'user', text: fromSummary, ts: r.timestamp });
      const t = stripNoise(raw);
      if (t && t.length >= 6 && !looksLikeToolNotice(t)) {
        turns.push({ role: 'user', text: t, ts: r.timestamp });
      }
      continue;
    }

    // ── agent 回复（全文，不截断）──
    if (r.type === 'message' && r.role === 'assistant') {
      const t = stripNoise(textOf(r));
      if (t && t.length >= 20 && !looksLikeToolNotice(t)) {
        turns.push({ role: 'assistant', text: t, ts: r.timestamp });
      }
      continue;
    }

    // ── 推理（全文）──
    if (r.type === 'reasoning') {
      const t = textOf(r);
      if (t) reasons.push(t);
      continue;
    }

    // ── 工具调用 ──
    if (r.type === 'function_call') {
      const nm = r.name || '?';
      let obj = null;
      try {
        obj = typeof r.arguments === 'string' ? JSON.parse(r.arguments) : r.arguments;
      } catch { obj = null; }

      const callId = r.id || r.callId || r.toolCallId || '';
      const result = resultById.get(callId) || '';

      // 分类：搜索 / 抓取 / 普通调用
      const srch = describeSearch(nm, obj);
      if (srch) {
        searches.push({
          kind: srch.kind,
          query: srch.query,
          results: result ? result.slice(0, 3000) : '',
        });
      } else if (nm === 'WebFetch' && obj) {
        fetches.push({
          url: String(obj.url || obj.prompt || '').slice(0, 300),
          content: result ? result.slice(0, 4000) : '',
        });
      } else {
        calls.push({
          name: nm,
          args: obj ? JSON.stringify(obj, null, 0).slice(0, 500) : String(r.arguments || '').slice(0, 500),
          result: result ? result.slice(0, 1500) : '',
          ts: r.timestamp,
        });
      }

      // 创建路径
      for (const p of createdPaths(nm, r.arguments)) created.add(p);
    }
  }

  // 统计有效内容量（用来判断该不该入库）
  let chars = 0;
  for (const t of turns) chars += t.text.length;
  for (const x of reasons) chars += x.length;
  for (const x of calls) chars += x.args.length + x.result.length;
  for (const x of searches) chars += x.query.length + x.results.length;
  for (const x of fetches) chars += x.url.length + x.content.length;

  // 助手轮数（"三轮对话"的判定依据）
  const assistantTurns = turns.filter((t) => t.role === 'assistant').length;

  return {
    sessionId,
    cwd,
    title: title || '',
    startedAt: firstTs ? new Date(firstTs) : null,
    endedAt: lastTs ? new Date(lastTs) : null,
    turns,
    reasons,
    calls,
    searches,
    fetches,
    created: [...created],
    assistantTurns,
    chars,
    bytes: txt.length,
  };
}


/**
 * 把一个会话写成一条库记录
 *
 * ── 原则（2026-11-04 老板定）──
 *
 * ── 两条规则（2026-11-04 老板定）──
 *
 * ① 符合条件（助手回复 ≥3 轮 或 有效内容 ≥3000 字）
 *      → **全量保留**：对话全文、推理全文、搜索结果、网页正文、命令+结果
 *      老板原话：「你不要在乎这个库会越来越大……我们要的是会话内容」
 *      老板原话：「这才能溯源嘛，不然怎么溯源」
 *
 * ② 不符合条件（短会话：一问一答、寒暄）
 *      → **不跳过，保留摘要**
 *      老板原话：「至于你刚才说 6 个被跳过的短会话，
 *                 我建议也不要跳过，这种短会话只保留摘要就可以」
 *
 * @param {object} s parseSession 的结果
 * @param {object} opts { account, uid }
 * @returns {object|null}
 */
export function toRecord(s, opts = {}) {
  if (!s) return null;

  // ── 判定该"全量保留"还是"只留摘要" ──
  //
  // 「满足你刚才说的条件的三轮对话或者是 3000 字以上的会话都要拿过来」
  //
  // 为什么用两个条件（而不是只看轮数）：
  //   实测「运行 dsh weeb 命令报错」只有 2 轮助手回复，但有 44,655 字内容
  //   → 按轮数会被误判成短会话，但它是一次真实的排查工作
  const qualified = (s.assistantTurns >= 3) || (s.chars >= 3000);
  const full = qualified;   // 全量保留 or 只留摘要

  const day = s.startedAt ? s.startedAt.toISOString().slice(0, 10) : '未知日期';

  // ── 标题 ──
  let title = (s.title || '').trim();
  if (!title) {
    const firstUser = s.turns.find((t) => t.role === 'user');
    if (firstUser) title = firstUser.text.split('\n')[0].slice(0, 40);
  }
  if (!title && s.cwd) title = s.cwd.split(/[\\/]/).pop();
  if (!title) title = '会话 ' + s.sessionId.slice(0, 8);
  title = title
    .replace(/<\/?[a-z_-]+[^>]*>/gi, '')
    .replace(/notification\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^[a-z_-]{1,20}>\s*/gi, '')
    .trim();
  if (!title) title = '会话 ' + s.sessionId.slice(0, 8);

  // ── 正文 ──
  //
  // 两条规则（老板 2026-11-04 定）：
  //   full = true  → 全量：对话/推理/搜索/网页/命令，全写
  //   full = false → 摘要：只写"谁说了什么、最后结论"，控制在 1500 字内
  const lines = [];

  // 按 ts 排序（没有 ts 的保持原序）
  const flow = s.turns
    .map((t, i) => ({ ...t, _i: i }))
    .sort((a, b) => {
      const ta = Number(a.ts) || 0;
      const tb = Number(b.ts) || 0;
      if (ta && tb && ta !== tb) return ta - tb;
      return a._i - b._i;
    });

  if (full) {
    lines.push('## 对话内容');
    lines.push('');
    for (const t of flow) {
      lines.push(t.role === 'user' ? '### 用户' : '### WorkBuddy');
      lines.push('');
      // 全量，不截断（只在极端情况截断：单条超过 20000 字）
      lines.push(t.text.length > 20000 ? t.text.slice(0, 20000) + '\n\n…（过长，截断）' : t.text);
      lines.push('');
    }
  } else {
    // ── 短会话：只留摘要 ──
    //
    // 老板原话：「至于你刚才说 6 个被跳过的短会话，
    //           我建议也不要跳过，这种短会话只保留摘要就可以」
    //
    // 摘要写什么：用户说了什么（前 300 字）+ 最后结论（前 500 字）
    // 目的：以后能搜到"这件事发生过"，但不占空间
    lines.push('## 概要（短会话）');
    lines.push('');
    lines.push('> 这个会话比较短（' + s.assistantTurns + ' 轮回复，' + Math.round(s.chars / 1000) + 'K 字），只留摘要。');
    lines.push('');

    const firstUser = flow.find((t) => t.role === 'user');
    if (firstUser) {
      lines.push('**用户问了什么**');
      lines.push('');
      lines.push(firstUser.text.length > 300 ? firstUser.text.slice(0, 300) + '…' : firstUser.text);
      lines.push('');
    }

    const lastReply = [...flow].reverse().find((t) => t.role === 'assistant');
    if (lastReply) {
      lines.push('**最后的结论**');
      lines.push('');
      lines.push(lastReply.text.length > 500 ? lastReply.text.slice(0, 500) + '…' : lastReply.text);
      lines.push('');
    }

    // 短会话里如果有创建的文件，也要留（那是"它做过什么"的硬证据）
    if (s.created.length) {
      lines.push('**它创建的目录/文件**');
      lines.push('');
      for (const p of s.created.slice(0, 10)) lines.push('- `' + p + '`');
      lines.push('');
    }
  }

  if (full) {
  // ── 它思考了什么 ──
  if (s.reasons.length) {
    lines.push('## 它的思考过程');
    lines.push('');
    for (const r of s.reasons) {
      lines.push(r.length > 8000 ? r.slice(0, 8000) + '\n…（过长，截断）' : r);
      lines.push('');
    }
  }

  // ── 它搜了什么 ──
  if (s.searches.length) {
    lines.push('## 它搜了什么');
    lines.push('');
    for (const x of s.searches) {
      lines.push('**' + x.kind + '：' + x.query + '**');
      lines.push('');
      if (x.results) {
        lines.push(x.results);
        lines.push('');
      }
    }
  }

  // ── 它打开了哪些网页 ──
  if (s.fetches.length) {
    lines.push('## 它打开过的网页');
    lines.push('');
    for (const x of s.fetches) {
      lines.push('**' + x.url + '**');
      lines.push('');
      if (x.content) {
        lines.push(x.content);
        lines.push('');
      }
    }
  }

  // ── 它做了什么 ──
  if (s.calls.length) {
    lines.push('## 它执行了什么命令');
    lines.push('');
    for (const c of s.calls) {
      lines.push('**' + c.name + '**');
      lines.push('');
      lines.push('```');
      lines.push(c.args);
      lines.push('```');
      lines.push('');
      if (c.result) {
        lines.push('返回：');
        lines.push('');
        lines.push('```');
        lines.push(c.result);
        lines.push('```');
        lines.push('');
      }
    }
  }

  // ── 它创建了什么 ──
  if (s.created.length) {
    lines.push('## 它创建的目录/文件');
    lines.push('');
    for (const p of s.created) lines.push('- `' + p + '`');
    lines.push('');
  }
  }  // ← 结束 if (full) 块

  // ── 元信息 ──
  lines.push('---');
  lines.push('');
  lines.push('| 项 | 值 |');
  lines.push('|---|---|');
  lines.push('| 会话 | ' + title + ' |');
  lines.push('| 时间 | ' + day + ' |');
  if (s.cwd) lines.push('| 工作区 | `' + s.cwd + '` |');
  lines.push('| 会话 id | `' + s.sessionId + '` |');
  lines.push('| 对话轮数 | ' + s.assistantTurns + ' 轮回复 |');
  lines.push('| 内容量 | ' + Math.round(s.chars / 1000) + ' K 字 |');
  lines.push('| 原始记录 | ' + Math.round(s.bytes / 1024) + ' KB（jsonl） |');

  return {
    project: 'WorkBuddy 会话实录',
    kind: 'memory',
    title: day + ' ' + title,
    body: lines.join('\n'),
    account: opts.account || '',
    uid: opts.uid || '',
    // agent 就是"这条记录是哪个账号产生的"
    // 抓不到账号名时留空，不要填 'WorkBuddy'
    // （2026-11-05 踩过：填了 'WorkBuddy' 之后，界面在「账号」列显示
    //   "WorkBuddy"，用户以为多了一个叫 WorkBuddy 的账号）
    agent: opts.account || '',
    evidence: '会话记录',
    fingerprint: fp('session', s.sessionId),
  };
}


/**
 * 提炼规则版本号
 *
 * ── 为什么需要（2026-11-04 踩过的坑）──
 *
 * 缓存里只记了文件的 mtime：
 *   if (prev.mtime === now.mtime) 跳过，不重新解析
 *
 * 问题：当【提炼规则改了】的时候，旧结果就错了，
 * 但 mtime 没变 → 永远不重新处理 → 永远错下去。
 *
 * 实测：11-04 把规则从「摘要骨架」改成「全量保留」，
 * 结果那 6 个短会话（mtime 没变）永远补不回来，
 * 只能手动清空整个库重扫。
 *
 * 修法：缓存里同时记规则版本号。
 *   规则版本变了 → 即使 mtime 没变，也重新处理。
 *
 * ── 什么时候要改这个版本号 ──
 *
 * 只要改了 toRecord 的输出格式、或者改了入库条件，
 * 就必须把 EXTRACT_RULE_VERSION 加 1。
 * 否则旧记录不会更新。
 */
export const EXTRACT_RULE_VERSION = 2;   // 2 = 2026-11-04 全量保留规则

export function extractSessions(opts = {}) {
  const accounts = opts.accounts || {};
  const projDir = path.join(wbHome(), 'projects');
  const items = [];
  const newCache = new Map();

  let dirs = [];
  try { dirs = fs.readdirSync(projDir, { withFileTypes: true }); } catch { return { items, mtimeCache: newCache }; }

  // 会话 id → uid（从数据库来的话上层会传；这里用文件名兜底）
  const sid2uid = opts.sid2uid || new Map();

  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const dirPath = path.join(projDir, d.name);
    let files = [];
    try { files = fs.readdirSync(dirPath); } catch { continue; }

    for (const fn of files) {
      if (!fn.endsWith('.jsonl')) continue;
      const full = path.join(dirPath, fn);
      let st;
      try { st = fs.statSync(full); } catch { continue; }

      const key = 'sess:' + full;

      // ── 缓存判断：mtime 和规则版本都要一样才跳过 ──
      //
      // prev 可能是：
      //   · 旧格式：一个数字（只有 mtime）→ 当成"版本不同"，重新处理
      //   · 新格式：{ mtime, ver }
      const prev = opts.mtimeCache instanceof Map ? opts.mtimeCache.get(key) : undefined;
      const prevMtime = typeof prev === 'number' ? prev : (prev && prev.mtime);
      const prevVer = typeof prev === 'object' && prev ? prev.ver : 0;

      if (prevMtime && prevMtime === st.mtimeMs && prevVer === EXTRACT_RULE_VERSION) {
        // 文件没变过 + 规则没变过 → 不重复解析（省时间）
        newCache.set(key, { mtime: st.mtimeMs, ver: EXTRACT_RULE_VERSION });
        continue;
      }
      newCache.set(key, { mtime: st.mtimeMs, ver: EXTRACT_RULE_VERSION });

      const s = parseSession(full);
      if (!s) continue;

      const sid = s.sessionId;
      const uid = sid2uid.get(sid) || '';
      const accName = (uid && accounts[uid] && accounts[uid].nickname) || '';

      const rec = toRecord(s, { account: accName, uid });
      if (rec) items.push(rec);
    }
  }

  return { items, mtimeCache: newCache };
}
