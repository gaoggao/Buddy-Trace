/**
 * macOS 自测（A 方法核心）：用仿造的 WorkBuddy 数据，验证解析链路在真实 macOS 上跑通。
 *
 * 关键：把仿造数据放进一个【临时 home】，再把 HOME/USERPROFILE 指过去，
 * 这样 os.homedir() 也落到仿造目录 —— 本机绝不会再读到真实数据，CI 上同理干净。
 *
 * 验三件最容易翻车的事：
 *   1. os.homedir()/.workbuddy 路径能不能找到数据
 *   2. node:sqlite 能不能读 workbuddy.db 的 sessions
 *   3. jsonl 逐行解析（用户/助手/推理/工具）能不能正确入库
 *
 * 用法： node scripts/mac-selftest.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildFakeWorkbuddy } from './make-fake-workbuddy.mjs';

// 1) 造一个临时 home，仿造数据放在 <tmpHome>/.workbuddy
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-fakehome-'));
buildFakeWorkbuddy(tmpHome);

// 2) 把家目录指过去（os.homedir() 在 Windows 读 USERPROFILE，Unix 读 HOME）
process.env.HOME = tmpHome;
process.env.USERPROFILE = tmpHome;
// 清掉任何可能指向真实机器的手动指定，确保走 os.homedir()
delete process.env.BT_WB_HOME;

const { Store } = await import('../src/store.js');
const { WbSyncer } = await import('../src/wb-syncer.js');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-selftest-data-'));
const store = new Store(dataDir);
const syncer = new WbSyncer({ store, dataDir });

const results = [];
const check = (name, cond, detail) => {
  results.push({ name, pass: !!cond, detail: detail || '' });
  console.log((cond ? '  ✅ ' : '  ❌ ') + name + (detail ? '  — ' + detail : ''));
};

console.log('平台:', process.platform, process.arch);
console.log('临时 home（仿造）:', tmpHome);
console.log('');

const r = await syncer.run({ force: true });
console.log('sync 返回:', JSON.stringify({ ok: r.ok, added: r.added, dup: r.dup, fail: r.fail }));
console.log('');

check('同步成功返回 ok', r.ok === true, 'error=' + (r.error || ''));
check('至少入库 1 条会话', (r.added || 0) >= 1, 'added=' + r.added);

const items = store.list({ limit: 200 }).items;
const allText = items.map((it) => { const f = store.get(it.id); return (f && f.content) ? String(f.content) : ''; }).join('\n');

check('列表能取到条目', items.length >= 1, 'items=' + items.length);
check('解析出用户原话', allText.includes('手机号加验证码'), '');
check('解析出助手回复', allText.includes('去掉了密码输入框'), '');
check('解析出推理内容', allText.includes('登录页组件'), '');

// 只应扫到仿造的这一个工作区，绝不能有真实机器的数据
check('未混入真实数据（无青岛/REA等）',
  !allText.includes('青岛') && !allText.includes('REA') && !allText.includes('dsh CLI'),
  '');

store.close();
try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}

const failed = results.filter((x) => !x.pass);
console.log('');
if (failed.length === 0) {
  console.log('=== macOS 自测全部通过 (' + results.length + '/' + results.length + ') ===');
  process.exit(0);
} else {
  console.log('=== 自测失败 ' + failed.length + ' 项 ===');
  failed.forEach((f) => console.log('  ✗ ' + f.name + ' ' + f.detail));
  process.exit(1);
}
