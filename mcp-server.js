#!/usr/bin/env node
/**
 * Buddy Trace MCP Server
 *
 * 作用：把 Buddy Trace 的记忆库，暴露成 WorkBuddy 里的【一等工具】。
 *
 * 为什么要做成 MCP 工具（而不是靠 USER.md 里的文字规则）：
 *   · MCP 工具是平台每轮注入到 tools 数组里的，跟 Bash/Read 并列
 *   · 不靠 agent "记住规则"，也不怕上下文压缩把规则删掉
 *   · 用户说「继续上次那个」→ 模型看到 memory_search → 直接调用
 *
 * 传输方式：stdio（WorkBuddy 启动本进程，用 stdin/stdout 收发 JSON-RPC）
 *   —— 不用 HTTP、不用网络，所以不受 WorkBuddy 网络策略限制。
 *
 * 内部实现：调用本地 Buddy Trace 服务的 HTTP API（127.0.0.1:41829）。
 *   本进程自己发 HTTP 请求，不走 WorkBuddy 的网络通道。
 */

import http from 'node:http';

const BASE = process.env.BT_BASE_URL || 'http://127.0.0.1:41829';
const API_TIMEOUT = 15000;

// ── 调本地 API ────────────────────────────────────────────
function callApi(path, body) {
  return new Promise((resolve) => {
    const url = new URL(path, BASE);
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: payload ? 'POST' : 'GET',
      headers: payload ? { 'Content-Type': 'application/json' } : {},
      timeout: API_TIMEOUT,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          resolve(JSON.parse(text));
        } catch {
          resolve({ ok: false, error: 'API 返回的不是合法 JSON' });
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'API 超时（Buddy Trace 服务可能没启动）' });
    });
    req.on('error', (e) => {
      resolve({
        ok: false,
        error: '连不上 Buddy Trace 服务（' + BASE + '）：' + (e.code || e.message),
      });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

// ── 工具定义 ──────────────────────────────────────────────
//
// 描述写得很具体，因为模型是【看描述】决定要不要调用的。
// 把用户会说的原话（继续/接着/上次那个）写进去，命中率最高。
const TOOLS = [
  {
    name: 'memory_search',
    description:
      '在 WorkBuddy 的长期记忆库（Buddy Trace）里搜索过去做过的事。' +
      '当用户说「继续」「接着」「接着上次」「上次那个」「之前那个」「老样子」' +
      '「你之前弄的」「我是不是弄过」「好像做过」，' +
      '或者提到你不记得的项目名/文件名/公司名/游戏名时，' +
      '【先用这个工具搜一下】，不要直接说「不知道」。',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词，比如项目名、文件名、话题、公司名。用最有辨识度的词。',
        },
        limit: {
          type: 'number',
          description: '返回条数，默认 10，最多 50',
        },
        account: {
          type: 'string',
          description: '可选：只看某个账号的记录。不填就搜全部账号。',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_list',
    description:
      '列出 Buddy Trace 记忆库里最近的记录（不搜索，按时间倒序）。' +
      '想知道「这段时间都干了什么」「最近有什么」时用。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回条数，默认 20' },
        account: { type: 'string', description: '可选：只看某个账号' },
        kind: {
          type: 'string',
          description: '可选：按类型过滤。skill=技能 wiki=知识 changelog=变更 memory=对话记忆',
        },
      },
    },
  },
  {
    name: 'memory_get',
    description:
      '按 id 取某条记录的完整正文。通常先用 memory_search 搜到 id，再用这个取正文。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '记录 id，从 memory_search 或 memory_list 的结果里拿' },
      },
      required: ['id'],
    },
  },
];

// ── 本机账号缓存 ──────────────────────────────────────────
//
// 为什么需要：/api/search 和 /api/list 有隐私过滤，不带 uid 时
// 只返回"全局内容"（实测：库里 98 条，不带 uid 返回 0 条）。
//
// 为什么只取一个 uid：WorkBuddy 的账号默认是【合并】的
// （实测 /api/account-groups 返回 allMerged: true），
// 查任何一个账号的 uid，拿到的都是全部账号的数据。
// 所以只用一个 uid，避免同样的数据被查多遍。
//
// 用 Promise 缓存（不是布尔标记）：多个 tools/call 可能并发进来，
// 布尔标记会让后到的那个在"已标记 ready 但值还是 null"的间隙里拿到 null。
let uidPromise = null;

function getUid() {
  if (uidPromise) return uidPromise;
  uidPromise = (async () => {
    const r = await callApi('/api/accounts');
    const list = (r && r.ok && Array.isArray(r.accounts)) ? r.accounts : [];
    // 优先挑有内容的账号
    const withData = list.find((a) => Number(a.total) > 0) || list[0];
    return withData ? withData.uid : null;
  })();
  return uidPromise;
}

// ── 工具实现 ──────────────────────────────────────────────
async function runTool(name, args) {
  if (name === 'memory_search') {
    const q = String(args.query || '').trim();
    if (!q) return { ok: false, error: 'query 不能为空' };
    const limit = Math.min(Number(args.limit) || 10, 50);

    // 指定了账号就用那个，否则用本机合并后的 uid（查一个等于查全部）
    const uid = args.account ? String(args.account) : await getUid();
    if (!uid) {
      return { ok: false, error: '没检测到本机的 WorkBuddy 账号，记忆库可能是空的' };
    }

    // 注意：接口内部会把 limit ×3（多取一些过滤后还够），
    // 所以这里传的是"最终想要的条数"，不是放大后的。
    const path = '/api/search?q=' + encodeURIComponent(q)
      + '&limit=' + limit + '&uid=' + encodeURIComponent(uid);
    const r = await callApi(path);
    if (!r.ok) return r;

    const items = (r.items || []).slice(0, limit).map((it) => ({
      id: it.id,
      title: it.title,
      kind: it.kind,
      project: it.project,
      time: it.created_at || it.updated_at,
      summary: (it.summary || it.content || '').slice(0, 200),
    }));

    return {
      ok: true,
      total: items.length,
      items,
      hint: items.length === 0
        ? '记忆库里没搜到。可以换个关键词再搜一次，或者用 memory_list 看最近的记录。'
        : '如果这些标题看起来相关，用 memory_get 取正文。',
    };
  }

  if (name === 'memory_list') {
    const limit = Math.min(Number(args.limit) || 20, 100);

    const uid = args.account ? String(args.account) : await getUid();
    if (!uid) {
      return { ok: false, error: '没检测到本机的 WorkBuddy 账号，记忆库可能是空的' };
    }

    // limit=100 是实测出来的甜点：接口内部会 ×3，传 100 能拉全 98 条；
    // 传 200 会被放大成 600，反而触发内部截断只回 3 条（实测踩过）。
    let path = '/api/list?limit=100&body=1&uid=' + encodeURIComponent(uid);
    if (args.kind) path += '&kind=' + encodeURIComponent(args.kind);
    const r = await callApi(path);
    if (!r.ok) return r;

    const all = r.items || [];
    const items = all.slice(0, limit).map((it) => ({
      id: it.id,
      title: it.title,
      kind: it.kind,
      time: it.created_at || it.updated_at,
      summary: (it.summary || '').slice(0, 150),
    }));
    return {
      ok: true,
      total: all.length,
      returned: items.length,
      items,
    };
  }

  if (name === 'memory_get') {
    const id = String(args.id || '').trim();
    if (!id) return { ok: false, error: 'id 不能为空' };
    const r = await callApi('/api/get?id=' + encodeURIComponent(id) + '&body=1');
    if (!r.ok) return r;
    const it = r.item || {};
    return {
      ok: true,
      item: {
        id: it.id,
        title: it.title,
        kind: it.kind,
        project: it.project,
        time: it.created_at || it.updated_at,
        content: (it.content || '').slice(0, 8000),
      },
    };
  }

  return { ok: false, error: '未知工具：' + name };
}

// ── JSON-RPC over stdio ───────────────────────────────────
//
// MCP 的 stdio 传输：每行一个 JSON-RPC 消息（newline-delimited）。

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handle(msg) {
  const { id, method, params } = msg;

  // 通知类消息（没有 id）不需要回复
  if (method === 'notifications/initialized' || method === 'initialized') {
    return;
  }

  if (method === 'initialize') {
    reply(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'buddy-trace', version: '0.1.0' },
    });
    return;
  }

  if (method === 'tools/list') {
    reply(id, { tools: TOOLS });
    return;
  }

  if (method === 'tools/call') {
    const name = params && params.name;
    const args = (params && params.arguments) || {};
    try {
      const result = await runTool(name, args);
      reply(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: !result.ok,
      });
    } catch (e) {
      reply(id, {
        content: [{ type: 'text', text: JSON.stringify({ ok: false, error: String(e.message) }) }],
        isError: true,
      });
    }
    return;
  }

  // 其它方法（ping 等）
  if (method === 'ping') {
    reply(id, {});
    return;
  }

  if (id !== undefined && id !== null) {
    replyError(id, -32601, 'Method not found: ' + method);
  }
}

// 在途请求计数：stdin 关闭时若还有没跑完的请求，要等它们跑完再退出，
// 否则工具的异步 HTTP 结果会被丢掉（实测踩过：tools/call 没回包进程就没了）。
let pending = 0;
let stdinClosed = false;

function maybeExit() {
  if (stdinClosed && pending === 0) process.exit(0);
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;   // 不是合法 JSON，忽略
    }
    pending++;
    handle(msg)
      .catch(() => {})
      .finally(() => {
        pending--;
        maybeExit();
      });
  }
});

process.stdin.on('end', () => {
  stdinClosed = true;
  maybeExit();
});

// 保活：不要因为暂时没消息就退出
process.stdin.resume();