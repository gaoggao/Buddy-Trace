/**
 * HTTP 服务层端到端测试
 * 真的起一个服务，用 fetch 调用，验证完整链路
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { createServer, listenWithFallback } from '../src/server.js';

let store;
let server;
let base;
let dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbase-http-'));
  store = new Store(dataDir);
  server = createServer(store);
  // 用独立端口段，避免和 ui.test.js 并发时抢端口
  const port = await listenWithFallback(server, [41800, 41801, 41802]);
  base = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
  store.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function api(method, pathname, body) {
  const res = await fetch(base + pathname, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

test('健康检查', async () => {
  const { status, data } = await api('GET', '/api/health');
  assert.strictEqual(status, 200);
  assert.strictEqual(data.ok, true);
  // 这是 WorkBuddy 专属项目，不是主线 LBASE
  assert.strictEqual(data.name, 'Buddy Trace');
  // 隐私：不带 uid 时只给全局内容（技能），不该有别人的记录
  assert.strictEqual(data.uid, '');
  assert.ok(data.counts, '应该返回各库条数（含隐私库），供界面显示"已存多少条"');
});

test('完整链路：建项目 → 写技能 → 搜到 → 取全文', async () => {
  // 1. 建项目
  const p = await api('POST', '/api/projects', { name: 'HTTP测试项目' });
  assert.strictEqual(p.status, 201);
  assert.ok(p.data.project.id.startsWith('prj-'));

  // 2. 写技能
  const w = await api('POST', '/api/write', {
    project: 'HTTP测试项目',
    agent: 'test-agent',
    kind: 'skill',
    title: '网页抓取技能',
    body: '# 网页抓取\n\n用 fetch 抓静态页面，转成 markdown。注意处理编码问题。',
    agent: 'dsh',
    evidence: '实测',
  });
  assert.strictEqual(w.status, 201, JSON.stringify(w.data));
  assert.strictEqual(w.data.item.agent, 'dsh');
  const id = w.data.item.id;

  // 3. 搜索（中文）
  const s = await api('POST', '/api/search', { q: '网页抓取 markdown' });
  assert.strictEqual(s.status, 200);
  assert.ok(s.data.total >= 1, '应搜到内容');
  assert.strictEqual(s.data.items[0].id, id);

  // 4. 取全文
  const g = await api('GET', `/api/get?id=${id}`);
  assert.strictEqual(g.status, 200);
  assert.ok(g.data.item.content.includes('fetch 抓静态页面'));
  assert.ok(g.data.item.content.startsWith('---'), '应有 frontmatter');
});

test('内部库开发模式可删除（200）', async () => {
  await api('POST', '/api/projects', { name: '删除测试' });
  const w = await api('POST', '/api/write', {
    project: '删除测试', kind: 'wiki', title: '内部知识', body: '不能删', agent: 'test-agent',
  });
  const del = await api('DELETE', `/api/item?id=${w.data.item.id}`);
  assert.strictEqual(del.status, 200, '开发模式（默认）应能删除内部库');
  assert.strictEqual(del.data.ok, true);
});

test('外部库删除成功（200）', async () => {
  await api('POST', '/api/projects', { name: '外部测试' });
  const w = await api('POST', '/api/write', {
    project: '外部测试',
    kind: 'external-wiki',
    title: 'public-apis',
    body: '免费 API 列表',
    externalUrl: 'https://github.com/public-apis/public-apis',
  });
  assert.strictEqual(w.status, 201);
  const del = await api('DELETE', `/api/item?id=${w.data.item.id}`);
  assert.strictEqual(del.status, 200);
  assert.strictEqual(del.data.ok, true);
});

test('查重返回 409', async () => {
  await api('POST', '/api/projects', { name: '查重测试' });
  const body = { project: '查重测试', agent: 'test-agent', kind: 'wiki', title: '同一标题', body: '一样的内容' };
  const a = await api('POST', '/api/write', body);
  assert.strictEqual(a.status, 201);
  const b = await api('POST', '/api/write', body);
  assert.strictEqual(b.status, 409, '重复应返回 409');
  assert.ok(Array.isArray(b.data.duplicates) && b.data.duplicates.length > 0);
});

test('参数缺失返回 400', async () => {
  const a = await api('POST', '/api/projects', {});
  assert.strictEqual(a.status, 400);

  const b = await api('POST', '/api/search', {});
  assert.strictEqual(b.status, 400);

  const c = await api('POST', '/api/write', { project: 'x' });
  assert.strictEqual(c.status, 400);
});

test('列项目 / 列内容 / 库类型', async () => {
  const list = await api('GET', '/api/projects');
  assert.strictEqual(list.status, 200);
  assert.ok(Array.isArray(list.data.projects));

  const kinds = await api('GET', '/api/kinds');
  assert.strictEqual(kinds.status, 200);
  assert.strictEqual(kinds.data.kinds.length, 8);  // 加了 agent-memory
  const ext = kinds.data.kinds.filter((k) => k.sourceType === 'external');
  assert.strictEqual(ext.length, 3, '应有 3 个外部库类型');
  assert.ok(ext.every((k) => k.deletable === true));

  const w = await api('POST', '/api/write', {
    project: 'HTTP测试项目', agent: 'test-agent', kind: 'wiki', title: '列表测试', body: '内容',
  });
  assert.strictEqual(w.status, 201);
  const items = await api('GET', '/api/list?project=HTTP测试项目&kind=wiki');
  assert.strictEqual(items.status, 200);
  assert.ok(items.data.total >= 1);
});

test('隐私隔离：不带 uid 拿不到任何账号的隐私记录', async () => {
  // 老板 2026-11-02 定的规则：
  //   「库无法区分用户登录，那就把内容加密不允许用户看，只允许 agent 调用。」
  //   「调用不存在不带 UID 的调用，只要 agent 调用就带 UID。」
  //
  // 所以：不带 uid 的请求 = 非法调用，只能拿到全局内容（技能），
  //       拿不到 memory / changelog 这类隐私库的记录。
  const noUid = await api('GET', '/api/list?limit=500');
  assert.strictEqual(noUid.status, 200);
  assert.strictEqual(noUid.data.uid, '');
  // 所有返回的记录都必须是全局的（没有 uid 字段）
  for (const it of noUid.data.items) {
    assert.ok(!it.uid || !String(it.uid).trim(), '不带 uid 时不该返回任何账号的记录');
  }
  // 即使加 body=1（要正文），也一样
  const noUidBody = await api('GET', '/api/list?limit=500&body=1');
  for (const it of noUidBody.data.items) {
    assert.ok(!it.uid || !String(it.uid).trim());
  }
});

test('账号语义：默认合并，分离后才隔离', async () => {
  const A = 'test-uid-aaa';
  const B = 'test-uid-bbb';

  // 两个账号各写一条记忆（memory 是隐私库）
  // allowDuplicate：测试环境里可能已存在同名记录，别让查重拦住
  // agent：写入接口强制要求（溯源用）
  await api('POST', '/api/write', {
    project: '隐私测试项目', kind: 'memory', title: 'A 的私密记录',
    body: '只有 A 能看', uid: A, account: 'A', agent: 'A', allowDuplicate: true,
  });
  await api('POST', '/api/write', {
    project: '隐私测试项目', kind: 'memory', title: 'B 的私密记录',
    body: '只有 B 能看', uid: B, account: 'B', agent: 'B', allowDuplicate: true,
  });

  // ── 默认状态：合并（老板 2026-11-03 定「我们合并账号是常态」）──
  // A 能搜到 B 的（因为默认合并，agent 要能查全部）
  const merged = await api('POST', '/api/search', { q: '私密记录', uid: A });
  assert.strictEqual(merged.status, 200);
  const gotB = merged.data.items.some((it) => it.title === 'B 的私密记录');
  assert.ok(gotB, '默认合并状态下，A 应该能搜到 B 的记录');

  // ── 把 B 分离出去 ──
  const sep = await api('POST', '/api/account-groups/separate', { uid: B });
  assert.strictEqual(sep.status, 200);

  // 分离后：A 搜不到 B 的
  const afterSep = await api('POST', '/api/search', { q: '私密记录', uid: A });
  assert.ok(afterSep.data.items.every((it) => !it.uid || it.uid === A),
    '分离之后，A 不该搜到 B 的记录');

  // B 自己还能拿到自己的
  const bList = await api('GET', '/api/list?uid=' + B + '&body=1&limit=500');
  const bItem = bList.data.items.find((it) => it.title === 'B 的私密记录');
  assert.ok(bItem, 'B 自己应该能拿到');

  // A 拿 B 的记录 id 去取正文 → 被拒
  const stolen = await api('GET', '/api/get?id=' + bItem.id + '&uid=' + A);
  assert.strictEqual(stolen.status, 403, '分离之后，A 不该能取 B 的内容');

  // ── 取消分离 → 又合并回去 ──
  const un = await api('POST', '/api/account-groups/unseparate', { uid: B });
  assert.strictEqual(un.status, 200);
  const backToMerged = await api('POST', '/api/search', { q: '私密记录', uid: A });
  assert.ok(backToMerged.data.items.some((it) => it.title === 'B 的私密记录'),
    '取消分离后，A 又能搜到 B 的记录');
});

test('未知接口返回 404', async () => {
  const r = await api('GET', '/api/nonexistent');
  assert.strictEqual(r.status, 404);
});
