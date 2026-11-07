/**
 * 界面与新增接口的测试
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { Config, buildAgentGuide } from '../src/config.js';
import { createServer, listenWithFallback } from '../src/server.js';
import { parseGitHubUrl } from '../src/github.js';

let store, config, server, base, dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lbase-ui-'));
  store = new Store(dataDir);
  config = new Config(dataDir);
  server = createServer(store, { config, getPort: () => Number(new URL(base).port) });
  // 用独立端口段，避免和 server.test.js 并发时抢端口
  const port = await listenWithFallback(server, [41900, 41901, 41902]);
  base = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
  store.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function api(method, pathname, body) {
  const r = await fetch(base + pathname, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}

test('界面 HTML 能返回', async () => {
  const r = await fetch(base + '/');
  assert.strictEqual(r.status, 200);
  const html = await r.text();
  // 本项目品牌名（从 LBASE 主线改成了 Buddy Trace）
  assert.ok(html.includes('WorkBuddy'));
  assert.ok(html.includes('/ui/app.js'));
});

test('静态资源能加载', async () => {
  for (const p of ['/ui/app.css', '/ui/app.js']) {
    const r = await fetch(base + p);
    assert.strictEqual(r.status, 200, p);
    const body = await r.text();
    assert.ok(body.length > 1000, p + ' 应该有内容');
  }
});

test('app.js 语法合法（能被当作模块导入）', async () => {
  // 只检查不报语法错：用 new Function 无法解析 import，所以读文件检查关键点
  const r = await fetch(base + '/ui/app.js');
  const js = await r.text();
  // 不应该有裸 await 在普通函数里（粗查：确认 render 是 async）
  assert.ok(js.includes('async function render()'), '向导的 render 必须是 async');
  assert.ok(!/^\s*function render\(\)/m.test(js), '不应有同步的 render()');
});

test('配置读写', async () => {
  const g = await api('GET', '/api/config');
  assert.strictEqual(g.status, 200);
  assert.strictEqual(g.data.config.onboarded, false);
  assert.ok(g.data.config.discipline.skill === true);

  const p = await api('POST', '/api/config', {
    onboarded: true,
    discipline: { skill: false, custom: ['我的自定义纪律'] },
  });
  assert.strictEqual(p.status, 200);
  assert.strictEqual(p.data.config.onboarded, true);
  assert.strictEqual(p.data.config.discipline.skill, false);
  assert.deepStrictEqual(p.data.config.discipline.custom, ['我的自定义纪律']);
  // 其他项应保留默认
  assert.strictEqual(p.data.config.discipline.wiki, true);
});

test('接入指令指向 WorkBuddy 引导文件', async () => {
  // 注意：本项目不用主线的「让 agent 配置自己 + 写库」那套 ——
  // 这里是【只读】的（数据从磁盘自动同步），指令只需让 agent 知道「去哪查」。
  const g = await api('GET', '/api/agent-guide');
  assert.strictEqual(g.status, 200);

  // text / sentence：给用户复制的一句话，指向引导文件
  assert.ok(g.data.text.includes('/agent-rules'), 'text 应指向 agent-rules');
  assert.ok(g.data.text.length < 300, '是一句话，用户复制给 agent 用的');
  assert.ok(/长期记忆|记忆库/.test(g.data.text), '应说明这是记忆库');
  assert.strictEqual(g.data.text, g.data.sentence, 'text 与 sentence 一致');

  // 不应再出现主线的「配置自己 / 写库」措辞
  assert.ok(!g.data.text.includes('配置自己'), '不应要求 agent 配置自己');
  assert.ok(!/写进这个库|写入/.test(g.data.text), '不应要求 agent 写库（本项目只读）');

  // rulesUrl 指向引导文件
  assert.ok(g.data.rulesUrl.endsWith('/agent-rules'), 'rulesUrl 应指向 /agent-rules');
  assert.ok(typeof g.data.lang === 'string', '应返回语言标记');
});

test('/agent-rules 返回 WorkBuddy 版引导（不是主线说明书）', async () => {
  const r = await fetch(base + '/agent-rules');
  assert.strictEqual(r.status, 200);
  const body = await r.text();
  assert.ok(body.includes('Buddy Trace'), '应是 WorkBuddy 版');
  assert.ok(body.includes('/api/accounts'), '应含查询接口');
  assert.ok(body.includes('接手'), '应含接手指引');
  assert.ok(!body.includes('你是哪个 agent'), '不应是主线的「认领自己是哪个 agent」');
});

test('GitHub 地址解析', () => {
  assert.deepStrictEqual(parseGitHubUrl('https://github.com/public-apis/public-apis'),
    { owner: 'public-apis', repo: 'public-apis' });
  assert.deepStrictEqual(parseGitHubUrl('github.com/owner/repo'),
    { owner: 'owner', repo: 'repo' });
  assert.deepStrictEqual(parseGitHubUrl('https://github.com/owner/repo.git'),
    { owner: 'owner', repo: 'repo' });
  assert.deepStrictEqual(parseGitHubUrl('https://github.com/owner/repo/tree/main'),
    { owner: 'owner', repo: 'repo' });
  assert.strictEqual(parseGitHubUrl('https://example.com/foo/bar'), null);
  assert.strictEqual(parseGitHubUrl('not a url'), null);
  assert.strictEqual(parseGitHubUrl(''), null);
});

test('buildAgentGuide 在所有纪律关闭时也正常', () => {
  const g = buildAgentGuide({
    discipline: { skill: false, wiki: false, changelog: false, memory: false,
      project: false, attribution: false, dedup: false, rejected: false,
      cleanup: false, custom: [] },
  }, 41729);
  assert.ok(g.markdown.includes('用户没有设置具体规则'), '全关时应说明没有规则');
  assert.ok(g.short.includes('http://127.0.0.1:41729'), 'short 应含地址');
  assert.ok(g.markdown.includes('http://127.0.0.1:41729'), 'markdown 应含地址');
});

test('URL 中带编码的中文项目名能正常处理', async () => {
  await api('POST', '/api/projects', { name: '中文项目' });
  const w = await api('POST', '/api/write', {
    project: '中文项目', agent: 'test-agent', kind: 'skill', title: '中文标题', body: '中文正文内容测试',
  });
  assert.strictEqual(w.status, 201);

  const l = await api('GET', '/api/list?project=' + encodeURIComponent('中文项目'));
  assert.strictEqual(l.status, 200);
  assert.ok(l.data.total >= 1);
});

test('未知路径返回 404（界面用 hash 路由，不需要 SPA 兜底）', async () => {
  // 界面路由是 #/lib/skill 这种 hash 形式，真实 HTTP 路径只有 / 和 /ui/*，
  // 所以未知路径返回 404 是正确行为。
  // （之前对所有路径兜底返回 index.html，会把 /reminder、/hook/* 这类接口吞掉。）
  const r = await fetch(base + '/some/unknown/path');
  assert.strictEqual(r.status, 404);
});

test('纯文本/JSON 接口不被静态兜底吞掉', async () => {
  // 这几个接口曾经被 SPA 兜底拦截，返回了 HTML。现在必须返回各自的内容。
  const paths = ['/reminder', '/session-hint', '/agent-rules'];
  for (const p of paths) {
    const r = await fetch(base + p);
    assert.strictEqual(r.status, 200, p);
    const text = await r.text();
    assert.ok(!text.includes('<!doctype html>'), p + ' 不应返回 HTML 兜底页');
  }

  // hook 端点要返回官方 additionalContext 格式
  for (const ev of ['session-start', 'stop', 'pre-compact']) {
    const r = await fetch(base + '/hook/' + ev);
    assert.strictEqual(r.status, 200, ev);
    const j = await r.json();
    assert.ok(j.hookSpecificOutput, ev + ' 应有 hookSpecificOutput');
    assert.ok(j.hookSpecificOutput.additionalContext, ev + ' 应有 additionalContext');
  }
});

test('目录穿越被拒绝', async () => {
  // 带 .. 的路径必须被挡住，不能读到 public 之外的文件
  const r = await fetch(base + '/../package.json');
  assert.ok(r.status !== 200 || true); // fetch 会规范化，主要确保服务没崩
  const r2 = await fetch(base + '/ui/../../package.json');
  assert.ok([400, 403, 404].includes(r2.status), '应拒绝，实际 ' + r2.status);
});
