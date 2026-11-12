/**
 * 仿造一份 WorkBuddy Mac 版数据目录（供 macOS 自测用，绝不碰真实数据）
 *
 * 结构严格照着【真机探测结果】搭，放在 <home>/.workbuddy/ 下：
 *   <home>/.workbuddy/workbuddy.db          sessions 表（字段与 Mac 真机一致）
 *   <home>/.workbuddy/projects/<编码>/<会话id>.jsonl
 *
 * 用法： node scripts/make-fake-workbuddy.mjs <home>
 *   （也可 import buildFakeWorkbuddy(home) 复用）
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export function buildFakeWorkbuddy(home) {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
  const wb = path.join(home, '.workbuddy');
  fs.mkdirSync(wb, { recursive: true });

  const uid = 'uid_fake_test_1';
  const cwd = '/Users/testuser/WorkBuddy-demo-project';
  const sessionId = 'd7e5958e-dbd4-47ce-9c8d-42944f6c0619';
  const cloudSessionId = 'aaaaaaaa-1111-2222-3333-444444444444';
  const nowSec = Math.floor(Date.now() / 1000);

  // ── workbuddy.db：sessions 表（列名对齐 Mac 真机 schema）──
  const dbPath = path.join(wb, 'workbuddy.db');
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    cwd TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT,
    status TEXT NOT NULL DEFAULT 'Idle',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_activity_at INTEGER,
    transport TEXT NOT NULL DEFAULT 'local',
    conversation_origin TEXT,
    project_id TEXT
  );`);
  const ins = db.prepare(`INSERT INTO sessions
    (id, cwd, user_id, title, created_at, updated_at, last_activity_at, transport, conversation_origin)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  ins.run(sessionId, cwd, uid, '登录页改造', nowSec, nowSec, nowSec, 'local', 'desktop');
  ins.run(cloudSessionId, '', uid, '手机端随手问', nowSec, nowSec, nowSec, 'cloud', 'mobile');
  db.close();

  // ── projects/<编码>/<sessionId>.jsonl ──
  const enc = cwd.replace(/^\//, '').replace(/\//g, '-');
  const projDir = path.join(wb, 'projects', enc);
  fs.mkdirSync(projDir, { recursive: true });

  const lines = [
    { type: 'ai-title', aiTitle: '登录页改造', cwd, timestamp: nowSec, sessionId },
    { type: 'message', role: 'user', cwd, timestamp: nowSec, sessionId, id: 'm1',
      content: [{ type: 'input_text', text: '帮我把登录页改成手机号加验证码，不要用密码了。' }] },
    { type: 'reasoning', cwd, timestamp: nowSec + 1, sessionId, id: 'r1',
      rawContent: [{ type: 'reasoning_text', text: '需要先找到登录页组件，确认现有表单结构，再改成手机号和验证码两个输入框。' }] },
    { type: 'function_call', name: 'Read', id: 'call_1', cwd, timestamp: nowSec + 2, sessionId,
      arguments: JSON.stringify({ file_path: '/src/Login.vue' }) },
    { type: 'function_call_result', id: 'call_1', cwd, timestamp: nowSec + 3, sessionId,
      content: [{ type: 'text', text: '<template>...登录表单...</template>' }] },
    { type: 'message', role: 'assistant', cwd, timestamp: nowSec + 4, sessionId, id: 'm2',
      content: [{ type: 'output_text', text: '好的，我已经把登录页改成手机号加验证码的方式，去掉了密码输入框，并接上发送验证码按钮和倒计时逻辑。' }] },
    { type: 'message', role: 'user', cwd, timestamp: nowSec + 5, sessionId, id: 'm3',
      content: [{ type: 'input_text', text: '验证码要 60 秒倒计时，按钮期间禁用。' }] },
    { type: 'reasoning', cwd, timestamp: nowSec + 6, sessionId, id: 'r2',
      rawContent: [{ type: 'reasoning_text', text: '加一个倒计时状态，用 setInterval 每秒减一，归零后重新启用按钮。' }] },
    { type: 'message', role: 'assistant', cwd, timestamp: nowSec + 7, sessionId, id: 'm4',
      content: [{ type: 'output_text', text: '已加上 60 秒倒计时，发送后按钮禁用并显示剩余秒数，倒计时结束自动恢复可点击。' }] },
    { type: 'message', role: 'user', cwd, timestamp: nowSec + 8, sessionId, id: 'm5',
      content: [{ type: 'input_text', text: '再做个手机号格式校验。' }] },
    { type: 'message', role: 'assistant', cwd, timestamp: nowSec + 9, sessionId, id: 'm6',
      content: [{ type: 'output_text', text: '已加手机号正则校验，非 11 位或格式不对时提示并阻止发送验证码。' }] },
  ];
  fs.writeFileSync(path.join(projDir, sessionId + '.jsonl'),
    lines.map((o) => JSON.stringify(o)).join('\n') + '\n', 'utf8');

  // ── 登录快照：真实 Mac 上用户是登录状态，昵称靠这个解析出来 ──
  //    没有它，会话条目的 agent 会是空 → 入库被拦（这是数据完整性，不是代码问题）
  const snapDir = path.join(wb, 'storage', 'skeleton');
  fs.mkdirSync(snapDir, { recursive: true });
  fs.writeFileSync(path.join(snapDir, 'account-snapshot.json'), JSON.stringify({
    primary: { uid, nickname: '测试用户', type: 'personal' },
  }, null, 2), 'utf8');

  return { wb, dbPath, jsonl: path.join(projDir, sessionId + '.jsonl') };
}

if (process.argv[1] && process.argv[1].endsWith('make-fake-workbuddy.mjs')) {
  const home = process.argv[2];
  if (!home) { console.error('用法: node make-fake-workbuddy.mjs <home>'); process.exit(2); }
  const r = buildFakeWorkbuddy(home);
  console.log('仿造数据已生成:\n  ' + r.wb + '\n  ' + r.dbPath + '\n  ' + r.jsonl);
}
