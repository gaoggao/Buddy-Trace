/**
 * 存储层测试：验证「建项目 → 写技能 → 搜出来」主链路
 * 以及：内部库不可删、外部库可删、查重生效、外部来源隔离
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store, KINDS, isExternalKind } from '../src/store.js';

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbase-test-'));
  const store = new Store(dir);
  return { store, dir, cleanup: () => {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }};
}

test('建项目 → 写技能 → 搜出来', () => {
  const { store, dir, cleanup } = tmpStore();
  try {
    const project = store.createProject('NPLCN');
    assert.ok(project.id.startsWith('prj-'));
    assert.strictEqual(project.name, 'NPLCN');

    const w = store.write({
      project: 'NPLCN',
      kind: 'skill',
      title: 'NPLCN 报告模板',
      body: '# 报告模板\n\n用 reportlab 生成 PDF，注意表格不能溢出页面。',
      agent: 'hermes',
      evidence: '实测',
      tags: ['nplcn', 'report'],
    });
    assert.strictEqual(w.ok, true, w.error);
    assert.strictEqual(w.item.source_type, 'internal');
    assert.strictEqual(w.item.agent, 'hermes');

    // 文件真的写到磁盘了
    const file = path.join(dir, w.item.file_path);
    assert.ok(fs.existsSync(file), '内容文件应存在');
    const raw = fs.readFileSync(file, 'utf8');
    assert.ok(raw.includes('reportlab'), '文件应含正文');
    assert.ok(raw.startsWith('---'), '文件应有 frontmatter');

    // 能搜出来
    const s = store.search('reportlab PDF');
    assert.strictEqual(s.total, 1, '应搜到 1 条');
    assert.strictEqual(s.items[0].title, 'NPLCN 报告模板');
    assert.ok(s.items[0].match > 0.4);

    // 中文也能搜
    const s2 = store.search('报告模板');
    assert.strictEqual(s2.total, 1, '中文应能搜到');

    // 搜不相关的搜不到（多字词全不命中，应判为无关）
    const s3 = store.search('小红书封面设计');
    assert.strictEqual(s3.total, 0, '不相关不应搜到');

    // 单字误命中要排除：「面」能匹配「页面」，但不能因此算相关
    const s4 = store.search('小红书封面设计');
    assert.strictEqual(s4.total, 0, '单字偶然重合不应算相关');
  } finally {
    cleanup();
  }
});

test('内部库：开发模式可删，只读模式不可删', () => {
  const { store, cleanup } = tmpStore();
  try {
    store.createProject('P1');
    const w = store.write({
      project: 'P1', kind: 'wiki', title: '架构说明', body: '三层代理系统', agent: 'test-agent' });
    assert.strictEqual(w.ok, true);

    // 开发模式（默认，不设 BT_READONLY）：可以删
    const del = store.remove(w.item.id);
    assert.strictEqual(del.ok, true, '开发模式应能删除内部库');
  } finally {
    cleanup();
  }

  // 只读模式：不能删
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'lbase-ro-'));
  const ro = new Store(dir2, { readonly: true });
  try {
    ro.createProject('P2');
    const w2 = ro.write({
      project: 'P2', kind: 'wiki', title: 'X', body: 'y', agent: 'test-agent' });
    assert.strictEqual(w2.ok, true);
    const del2 = ro.remove(w2.item.id);
    assert.strictEqual(del2.ok, false, '只读模式应拒绝删除内部库');
    assert.ok(del2.error.includes('不能删除'));
  } finally {
    ro.close();
    fs.rmSync(dir2, { recursive: true, force: true });
  }
});

test('外部库可以删除', () => {
  const { store, cleanup } = tmpStore();
  try {
    store.createProject('P1');
    const w = store.write({
      project: 'P1',
      kind: 'external-wiki',
      title: 'public-apis',
      body: '# public-apis\n\n免费 API 列表',
      externalUrl: 'https://github.com/public-apis/public-apis', agent: 'test-agent' });
    assert.strictEqual(w.ok, true);
    assert.strictEqual(w.item.source_type, 'external');
    assert.strictEqual(w.item.external_url, 'https://github.com/public-apis/public-apis');

    const del = store.remove(w.item.id);
    assert.strictEqual(del.ok, true, del.error);

    const s = store.search('public-apis');
    assert.strictEqual(s.total, 0, '删掉后应搜不到');
  } finally {
    cleanup();
  }
});

test('查重：相似内容被拦下', () => {
  const { store, cleanup } = tmpStore();
  try {
    store.createProject('P1');
    const body = 'Chrome 136 以上禁止在默认 profile 上开远程调试端口，必须用独立 user-data-dir';

    const w1 = store.write({ project: 'P1', kind: 'wiki', title: 'Chrome 调试端口问题', body, agent: 'test-agent' });
    assert.strictEqual(w1.ok, true);

    // 标题完全相同 → 应被拦
    const w2 = store.write({ project: 'P1', kind: 'wiki', title: 'Chrome 调试端口问题', body, agent: 'test-agent' });
    assert.strictEqual(w2.ok, false);
    assert.ok(w2.duplicates && w2.duplicates.length > 0);
    assert.ok(w2.duplicates[0].similarity >= 0.8);

    // 明确允许重复 → 能写入
    const w3 = store.write({
      project: 'P1', kind: 'wiki', title: 'Chrome 调试端口问题', body, allowDuplicate: true, agent: 'test-agent' });
    assert.strictEqual(w3.ok, true);
  } finally {
    cleanup();
  }
});

test('外部库不做查重（因为可删改）', () => {
  const { store, cleanup } = tmpStore();
  try {
    store.createProject('P1');
    const a = store.write({ project: 'P1', kind: 'external-skill', title: 'tool', body: 'same', agent: 'test-agent' });
    const b = store.write({ project: 'P1', kind: 'external-skill', title: 'tool', body: 'same', agent: 'test-agent' });
    assert.strictEqual(a.ok, true);
    assert.strictEqual(b.ok, true, '外部库允许重复');
  } finally {
    cleanup();
  }
});

test('多 agent 写同一项目，能区分来源', () => {
  const { store, cleanup } = tmpStore();
  try {
    store.createProject('NPLCN');
    store.write({ project: 'NPLCN', kind: 'skill', title: '导出脚本', body: 'python 导出', agent: 'hermes' });
    store.write({ project: 'NPLCN', kind: 'skill', title: '报表生成', body: 'reportlab 生成报表', agent: 'dsh' });

    const { items } = store.list({ project: 'NPLCN', kind: 'skill' });
    assert.strictEqual(items.length, 2);
    const agents = items.map((i) => i.agent).sort();
    assert.deepStrictEqual(agents, ['dsh', 'hermes'], '应能区分两个 agent');
  } finally {
    cleanup();
  }
});

test('项目隔离：不同项目搜不到彼此', () => {
  const { store, cleanup } = tmpStore();
  try {
    store.createProject('P1');
    store.createProject('P2');
    store.write({ project: 'P1', kind: 'wiki', title: 'P1 的架构', body: '三层代理系统', agent: 'test-agent' });
    store.write({ project: 'P2', kind: 'wiki', title: 'P2 的架构', body: '完全不同的东西', agent: 'test-agent' });

    const s1 = store.search('三层代理', { project: 'P1' });
    assert.strictEqual(s1.total, 1);
    assert.strictEqual(s1.items[0].title, 'P1 的架构');

    const s2 = store.search('三层代理', { project: 'P2' });
    assert.strictEqual(s2.total, 0, 'P2 不应搜到 P1 的内容');
  } finally {
    cleanup();
  }
});

test('未知库类型被拒绝', () => {
  const { store, cleanup } = tmpStore();
  try {
    store.createProject('P1');
    const w = store.write({ project: 'P1', kind: 'nonsense', title: 'x', body: 'y', agent: 'test-agent' });
    assert.strictEqual(w.ok, false);
    assert.ok(w.error.includes('未知的库类型'));
  } finally {
    cleanup();
  }
});

test('项目不存在时自动创建（不再拒绝写入）', () => {
  const { store, cleanup } = tmpStore();
  try {
    // 设计变了：项目只是溯源标签，不该成为写入门槛。
    // agent 传一个不存在的项目名，系统自动建，不报错。
    const w = store.write({ project: '不存在的项目', kind: 'skill', title: 'x', body: 'y', agent: 'test-agent' });
    assert.strictEqual(w.ok, true, '应该自动建项目并写入成功');
    assert.strictEqual(w.item.project, '不存在的项目');
    assert.strictEqual(store.listProjects().length, 1);
  } finally {
    cleanup();
  }
});

test('KINDS 定义正确', () => {
  // 原来 7 个，2026-10-28 加了 agent-memory 变成 8 个
  assert.strictEqual(Object.keys(KINDS).length, 8);
  assert.strictEqual(isExternalKind('external-wiki'), true);
  assert.strictEqual(isExternalKind('wiki'), false);
});


test('写入时项目不存在会自动创建（不用先建项目）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbase-auto-'));
  const store = new Store(dir);

  // 库里一个项目都没有
  assert.strictEqual(store.listProjects().length, 0);

  // 直接写，带一个不存在的项目名
  const r = store.write({
    project: '自动建的项目',
    kind: 'skill',
    title: '测试自动建项目',
    body: '内容',
    agent: 'test-agent',
  });

  assert.strictEqual(r.ok, true, '写入应该成功，而不是报项目不存在');
  assert.strictEqual(store.listProjects().length, 1, '应该自动建了一个项目');
  assert.strictEqual(store.listProjects()[0].name, '自动建的项目');
  assert.strictEqual(r.item.project, '自动建的项目');

  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('缺 project 被拒绝（项目标签必须由 agent 提供）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbase-noproj-'));
  const store = new Store(dir);

  // 设计变了：project 是溯源必需标签，缺了就拒绝，不再兜底成「未归类」。
  // 理由：兜底出来的项目名是错的，溯源就断了；让 agent 补上才对。
  const r = store.write({
    kind: 'wiki',
    title: '没指定项目的内容',
    body: '内容',
    agent: 'test-agent',
  });

  assert.strictEqual(r.ok, false, '缺 project 应被拒绝');
  assert.ok(r.error.includes('项目'), '错误信息应说明缺项目');
  assert.deepStrictEqual(r.missing, ['project']);

  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('缺 agent 被拒绝（只有 agent 知道自己是谁）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbase-noagent-'));
  const store = new Store(dir);

  const r = store.write({
    project: 'P',
    kind: 'wiki',
    title: '没写自己名字的内容',
    body: '内容',
  });

  assert.strictEqual(r.ok, false, '缺 agent 应被拒绝');
  assert.ok(r.error.includes('agent'), '错误信息应说明缺 agent');
  assert.deepStrictEqual(r.missing, ['agent']);

  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('合并项目：内容归到目标项目，原项目消失', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbase-merge-'));
  const store = new Store(dir);

  // 建两个项目，各写一条
  const a = store.createProject('归流');
  const b = store.createProject('归流部署');

  store.write({ project: '归流', kind: 'skill', title: '归流技能A', body: 'A', agent: 'x' });
  store.write({ project: '归流部署', kind: 'skill', title: '归流技能B', body: 'B', agent: 'x' });

  // 合并前：各 1 条
  assert.strictEqual(store.search('归流', { project: '归流', minScore: 0 }).total, 1);
  assert.strictEqual(store.search('归流', { project: '归流部署', minScore: 0 }).total, 1);

  // 合并
  const r = store.mergeProjects('归流部署', '归流');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.moved, 1, '应该搬了 1 条');

  // 合并后：归流 2 条，「归流部署」项目没了
  const after = store.search('归流', { project: '归流', minScore: 0 });
  assert.strictEqual(after.total, 2, '归流下应该有 2 条');
  assert.strictEqual(store.listProjects().length, 1, '只剩一个项目');
  assert.strictEqual(store.listProjects()[0].name, '归流');

  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('合并项目：不能合并到自己、不能合并不存在的', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbase-merge-err-'));
  const store = new Store(dir);

  store.createProject('A');

  const r1 = store.mergeProjects('A', 'A');
  assert.strictEqual(r1.ok, false);
  assert.ok(r1.error.includes('自己'));

  const r2 = store.mergeProjects('不存在的项目', 'A');
  assert.strictEqual(r2.ok, false);

  const r3 = store.mergeProjects('A', '也不存在');
  assert.strictEqual(r3.ok, false);

  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});


// ── 会话归并 ────────────────────────────────────────────

test('会话：不传 sessionId 时留空，LBASE 不替你编', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbase-ses-'));
  const store = new Store(dir);
  try {
    // 宗旨：原封不动记录，agent 怎么传就怎么记。
    // 所以没传 sessionId 时，就该是 null，不能自动生成、也不能按时间归并。
    const a = store.write({ project: 'P', kind: 'memory', title: 'A', body: 'a', agent: 'ag' });
    const b = store.write({ project: 'P', kind: 'memory', title: 'B', body: 'b', agent: 'ag' });

    assert.strictEqual(a.item.session_id, null, '第一条不该被编上会话号');
    assert.strictEqual(b.item.session_id, null, '第二条也不该被编上会话号');
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('会话：跨库写入也不会被自动归并', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbase-ses2-'));
  const store = new Store(dir);
  try {
    // 之前这里有个 bug：归并时只查同一个库，跨库就归不到一起。
    // 现在改成完全不归并，这个 bug 也就不存在了。
    const a = store.write({ project: 'P', kind: 'skill', title: 'A', body: 'a', agent: 'ag' });
    const b = store.write({ project: 'P', kind: 'wiki', title: 'B', body: 'b', agent: 'ag' });
    const c2 = store.write({ project: 'P', kind: 'memory', title: 'C', body: 'c', agent: 'ag' });

    assert.strictEqual(a.item.session_id, null);
    assert.strictEqual(b.item.session_id, null);
    assert.strictEqual(c2.item.session_id, null);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('会话：显式传 session_id 时用它', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbase-ses3-'));
  const store = new Store(dir);
  try {
    const a = store.write({
      project: 'P', kind: 'memory', title: 'A', body: 'a',
      agent: 'ag', sessionId: 'ses-explicit',
    });
    assert.strictEqual(a.item.session_id, 'ses-explicit');
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('会话：listSessions 汇总正确', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbase-ses4-'));
  const store = new Store(dir);
  try {
    store.write({ project: 'P', kind: 'memory', title: 'A', body: 'a', agent: 'ag', sessionId: 'ses-1' });
    store.write({ project: 'P', kind: 'memory', title: 'B', body: 'b', agent: 'ag', sessionId: 'ses-1' });
    store.write({ project: 'P', kind: 'memory', title: 'C', body: 'c', agent: 'ag', sessionId: 'ses-2' });

    const r = store.listSessions();
    assert.strictEqual(r.total, 2, '应有两个会话');
    const s1 = r.sessions.find((s) => s.session_id === 'ses-1');
    assert.strictEqual(s1.items, 2, 'ses-1 应有 2 条');
    assert.strictEqual(s1.agent, 'ag');
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('会话：getSession 返回该会话全部内容', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbase-ses5-'));
  const store = new Store(dir);
  try {
    store.write({ project: 'P', kind: 'memory', title: '第一条', body: '正文一', agent: 'ag', sessionId: 'ses-x' });
    store.write({ project: 'P', kind: 'memory', title: '第二条', body: '正文二', agent: 'ag', sessionId: 'ses-x' });

    const r = store.getSession('ses-x');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.items.length, 2);
    assert.ok(r.items[0].body.includes('正文'), '应返回正文');
    assert.strictEqual(r.items[0].title, '第一条', '应按时间正序');
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── 第 5 个库：agent 记忆备份 ────────────────────────────

test('agent-memory 只读模式下不能删除', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbase-am-'));
  const store = new Store(dir, { readonly: true });
  try {
    const w = store.write({
      project: 'P', kind: 'agent-memory', title: '记忆备份',
      body: '# 规则内容', agent: 'ag',
    });
    assert.strictEqual(w.ok, true);

    const del = store.remove(w.item.id);
    assert.strictEqual(del.ok, false, '只读模式下内部库不能删');
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('KINDS 现在是 8 个（原 7 + agent-memory）', () => {
  assert.strictEqual(Object.keys(KINDS).length, 8);
  assert.ok(KINDS['agent-memory']);
  assert.strictEqual(KINDS['agent-memory'].sourceType, 'internal');
});
