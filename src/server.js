/**
 * LBASE HTTP 服务层
 *
 * 设计依据（见 docs/00-开发文档.md）：
 * - 第五章：写入方式主推 HTTP 接口
 * - 第六章：两个统一入口 search + get
 * - 第九章：端口 41829/41830/41831，占用就换下一个
 * - 第十二章：错误信息可国际化，不硬编码中文
 *
 * 不引入任何第三方依赖，用 Node 内置 http 模块。
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { Store, KINDS } from './store.js';
import { buildAgentGuide } from './config.js';
import { AGENT_TARGETS, buildReminder, buildSessionHint, buildAgentAdapter, buildClaudeHookOutput } from './adapters.js';
import { fetchGitHubReadme } from './github.js';
import { buildExternalBody } from './wb-format.js';
import { readAsset, readIndexHtml } from './assets-loader.js';
// WorkBuddy 专属
import { buildGuide, userSentence, memoryBlock, rememberBlock } from './wb-guide.js';
import { listCloudSessions, accountMemoryPaths, checkAgentInstalled, wbHomeInfo, saveManualHome, setDataDirHint, accountLastUsed } from './wb-sync.js';
import { exportAgentArtifacts } from './wb-export.js';
import { backupNow, backupStatus, saveBackupConfig, getBackupConfig, shouldAutoBackup, cleanupOld } from './backup.js';
import { HELP } from './help-data.js';
import { checkRemoteUpdate, applyRemoteUpdate, readCachedRemote, readRemoteImage } from './remote.js';
import { checkUpdate, applyUpdate, rollback, hasBackup } from './updater.js';
import { DEFAULT_PORTS } from './ports.js';
import { VERSION } from './version.js';
import { scheduleRestart } from './runtime.js';
import {
  resolveUid, filterByUid, filterVisible, countByKind, canViewContent,
  currentLoginUid, groupMatesOf, mergeAccounts, separateAccount, unseparateAccount, groupStatus,
} from './wb-privacy.js';

/**
 * 构建标记（每次进程启动生成一个）
 *
 * 用途：拼在 app.js / app.css 的 URL 后面，让浏览器不能复用旧缓存。
 * 为什么不用文件 mtime：打包后的 assets 在内存里，没有 mtime。
 */
const BUILD_STAMP = String(Date.now());

/**
 * 创建服务器（不监听，便于测试）
 * @param {Store} store
 * @param {object} [opts]
 * @param {Config} [opts.config]
 * @param {number} [opts.port] 用于生成接入指令里的地址
 */
export function createServer(store, opts = {}) {
  // WorkBuddy 专用的本地路径
  //
  // 为什么需要（实测 2026-11-02）：
  //   WorkBuddy 的网络策略会拦 127.0.0.1（WebFetch 被「网络安全」阻断）。
  //   所以引导语里【优先给本地文件路径】—— agent 读文件不经过网络。
  const wbDataDir = opts.dataDir || store.dataDir || process.cwd();
  const wbExportDir = path.join(wbDataDir, 'agent');
  const wbPaths = { dataDir: wbDataDir, exportDir: wbExportDir };
  const wbGuideFile = path.join(wbExportDir, 'agent-rules.md');

  // 告诉 wb-sync 数据目录在哪 —— 它要把「用户手动指定的 WorkBuddy 目录」存在这里
  setDataDirHint(wbDataDir);

  /**
   * 当前实际监听的端口
   *
   * 为什么要有这个函数（老板 2026-11-03）：
   *   「端口号变了，你的引导语也得跟着变，你这些都得写到变量里，不能写死。」
   *
   * 端口可能因为被占用而 fallback 到 41830/41831…
   * 所以所有生成给 agent 的地址，都必须走这里，不能写死 41829。
   */
  const actualPort = () => {
    const p = (typeof opts.getPort === 'function') ? opts.getPort() : opts.port;
    return Number(p) || DEFAULT_PORTS[0];
  };

  /** 这台机器上所有真实账号的 uid（给「默认合并」用） */
  const allUidsFor = () => {
    try {
      return store.listAccounts()
        .filter((a) => a.uid && a.uid.indexOf(',') === -1)
        .map((a) => a.uid);
    } catch {
      return [];
    }
  };

  const server = http.createServer(async (req, res) => {
    // 允许本地网页调用（同源策略）
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return sendJson(res, 400, { ok: false, error: '请求地址无效' });
    }

    const route = `${req.method} ${url.pathname}`;

    // ── 静态文件（界面） ──
    //
    // 判定规则（避免接口被 SPA 兜底吞掉）：
    //   · "/" 或带扩展名的路径（.css/.js/.png…）→ 静态资源
    //   · 其它一律交给下面的路由处理
    //
    // 之前的写法是「排除几个特定接口路径」，每加一个纯文本接口都要改这里，
    // 已经踩过三次坑（/agent-rules、/reminder、/session-hint、/hook/*）。
    // 现在反过来：只有明确的静态资源才走静态处理。
    const isRoot = url.pathname === '/';
    const hasExtension = /\.[a-z0-9]{1,8}$/i.test(url.pathname);
    if ((req.method === 'GET' || req.method === 'HEAD') && (isRoot || hasExtension)) {
      if (serveStatic(url.pathname, res, req.method)) return;
    }

    try {
      // ── 健康检查 ──
      //
      // 隐私规则：只统计当前账号（+ 全局）的记录，不泄露别人的条数。
      if (route === 'GET /api/health') {
        const who = resolveUid(url);
        const all = store.list({ limit: 100000 });
        const mine = filterByUid(all.items || [], who.uid, groupMatesOf(wbDataDir, who.uid, allUidsFor(who.uid)));
        const counts = countByKind(mine);
        // 项目数：只算当前账号的项目
        const projSet = new Set();
        for (const it of mine) if (it.project) projSet.add(it.project);
        return sendJson(res, 200, {
          ok: true,
          name: 'Buddy Trace',
          version: VERSION,
          stats: {
            total: mine.length,
            projects: projSet.size,
            byKind: Object.entries(counts).map(([kind, c]) => ({ kind, c })),
          },
          counts,          // 含隐私库的条数（界面显示"已存多少条"）
          uid: who.uid,
          uidFrom: who.from,
        });
      }

      // ── 当前登录的是哪个 WorkBuddy 账号（界面用它拿到 uid）──
      //
      // 为什么需要：界面不能凭空知道 uid。
      // 读 account-snapshot.json 拿当前登录账号，界面带上它去查。
      // 注意：这个接口只返回 uid + 昵称，不返回任何内容。
      if (route === 'GET /api/whoami') {
        const uid = currentLoginUid();
        const accounts = store.listAccounts();
        const hit = accounts.find((a) => a.uid === uid);
        return sendJson(res, 200, {
          ok: true,
          loggedIn: !!uid,
          uid,
          name: (hit && hit.account) || (uid ? '账号 ' + uid.slice(0, 8) : ''),
        });
      }

      // ── WorkBuddy 目录：找到了没有 / 手动指定 ──
      //
      // 老板明确（2026-11-03）：
      //   「如果是扫不到，就提醒用户，让用户手动指定目录。」
      //
      // 界面用这个接口判断要不要弹「找不到」的提示。
      if (route === 'GET /api/wb-home') {
        const info = wbHomeInfo();
        return sendJson(res, 200, Object.assign({ ok: true }, info));
      }

      // 用户手动指定目录
      if (route === 'POST /api/wb-home') {
        const b = await readBody(req);
        const r = saveManualHome(b.path);
        if (!r.ok) return sendJson(res, 400, r);
        // 立刻按新目录重新扫一遍（不然用户以为没生效）
        const syncer = opts.syncer || server.__syncer;
        let synced = null;
        if (syncer) {
          try { synced = await syncer.run({ force: true }); } catch (e) { synced = { ok: false, error: String(e && e.message || e) }; }
        }
        return sendJson(res, 200, { ok: true, path: r.path, sync: synced });
      }

      // ── 账号组（老板主动把多个账号当成同一个人）──
      //
      // 老板明确（2026-11-02）：
      //   「控制电脑的人有权利在自己电脑上合并任何账号。但是提醒用户，
      //     这个账号有可能不是你的，你合并了以后你得承担责任。」
      //   → 默认隔离（代码层面），合并是用户主动解除，责任在用户。
      //   → 每次合并记日志（谁、什么时候、哪台机器），留证据。

      // ── 账号：默认合并，可手动分离（老板 2026-11-03 定）──
      //
      // 老板原话：
      //   「本身用户的电脑是自己的，大部分情况都是自己的账号在自己电脑上用。
      //     同事或其他人过来登录的时候很少……所以我们合并账号是常态，
      //     不合并账号让用户自己来分开。就是分离账号，不要做合并账号。」
      //   「其中一个账号是他同事的，他不想把他的记忆跟他同事的记忆搞混了，
      //     那他手动分离，我们只做一个分离功能就行了。」
      //
      // 所以：
      //   · 默认：所有账号合并，agent 能查全部
      //   · 高级选项：把某个账号分离出去（单独一组，只查自己）

      // 看现状
      if (route === 'GET /api/account-groups') {
        // 只留真实账号（有 uid 的）—— listAccounts 里会混进「全局」和「共用」这种汇总行
        const accounts = store.listAccounts().filter((a) => a.uid && a.uid.indexOf(',') === -1);
        const uid = currentLoginUid();

        // 算每个账号的「最后一次使用时间」
        //
        // 老板纠正（2026-11-03）：「只显示最后登录时间就行了，不要显示当前，
        //   因为它没有当前啊，我当前一个也没开，你给我显示这是当前，这啥意思？」
        //
        // 注意：不能用库里的 created_at —— 那是【我们入库的时间】，
        // 不是用户真正用 WorkBuddy 的时间（实测两个账号会显示同一时刻）。
        // 要用 workbuddy.db 的 sessions 表：每个账号 MAX(updated_at) = 最后一次干活。
        const lastUsed = accountLastUsed();

        const st = groupStatus(wbDataDir, accounts, uid, lastUsed);
        return sendJson(res, 200, Object.assign({ ok: true }, st));
      }

      // 分离某个账号（高级选项）
      if (route === 'POST /api/account-groups/separate') {
        const b = await readBody(req);
        const uid = b.uid || currentLoginUid();
        const r = separateAccount(wbDataDir, uid, { note: b.note || '' });
        return sendJson(res, r.ok ? 200 : 400, r);
      }

      // 取消分离（让它重新合并回去）
      if (route === 'POST /api/account-groups/unseparate') {
        const b = await readBody(req);
        const uid = b.uid || currentLoginUid();
        const r = unseparateAccount(wbDataDir, uid);
        return sendJson(res, r.ok ? 200 : 400, r);
      }

      // 旧接口：合并（新语义下等于「取消分离」，保留兼容）
      if (route === 'POST /api/account-groups/merge') {
        const b = await readBody(req);
        const r = mergeAccounts(wbDataDir, b.uids, {
          actorUid: currentLoginUid(),
          note: b.note || '',
        });
        return sendJson(res, r.ok ? 200 : 400, r);
      }

      // 旧接口：拆开（新语义下等于「分离」，保留兼容）
      if (route === 'POST /api/account-groups/split') {
        const b = await readBody(req);
        const uid = b.uid || currentLoginUid();
        const r = separateAccount(wbDataDir, uid);
        return sendJson(res, r.ok ? 200 : 400, r);
      }

      // ── 项目 ──
      if (route === 'GET /api/projects') {
        return sendJson(res, 200, { ok: true, projects: store.listProjects() });
      }

      if (route === 'POST /api/projects') {
        const body = await readBody(req);
        if (!body.name) return sendJson(res, 400, { ok: false, error: '缺少项目名 name' });
        const project = store.createProject(body.name, body);
        return sendJson(res, 201, { ok: true, project });
      }

      // ── 会话列表（agent 追溯用） ──
      if (route === 'GET /api/sessions' || route === 'POST /api/sessions') {
        const b = req.method === 'POST' ? await readBody(req, true) : {};
        const r = store.listSessions({
          project: b.project || url.searchParams.get('project') || undefined,
          agent: b.agent || url.searchParams.get('agent') || undefined,
          limit: Number(b.limit || url.searchParams.get('limit') || 100),
        });
        return sendJson(res, 200, r);
      }

      // ── 某次会话的全部记忆 ──
      if (route === 'GET /api/session' || route === 'POST /api/session') {
        const b = req.method === 'POST' ? await readBody(req, true) : {};
        const sid = b.session_id || b.sessionId || url.searchParams.get('session_id') || url.searchParams.get('id');
        const r = store.getSession(sid);
        return sendJson(res, r.ok ? 200 : 404, r);
      }

      // ── 备份 agent 自己的记忆文件 ──
      // 用途：agent 把 ~/.dsh/AGENTS.md 这类几千字节的持久记忆文件传上来存一份
      // 和 kind=memory 的区别：memory 是会话要点，这个是 agent 的长期配置文件
      if (route === 'POST /api/backup-agent-memory') {
        const b = await readBody(req);
        const title = String(b.title || b.path || '').trim();
        const body = String(b.body || b.content || '');
        if (!title) return sendJson(res, 400, { ok: false, error: '缺少 title 或 path' });
        if (!body.trim()) return sendJson(res, 400, { ok: false, error: '缺少 body 或 content' });
        // agent / project 和普通写入一样是必填溯源标签，不再兜底
        const agent = String(b.agent || '').trim();
        if (!agent) return sendJson(res, 400, { ok: false, error: '缺少 agent（谁写的）' });
        const project = String(b.project || '').trim();
        if (!project) return sendJson(res, 400, { ok: false, error: '缺少 project（属于哪个项目）' });

        const w = store.write({
          project,
          kind: 'agent-memory',
          title,
          body,
          summary: b.summary || ('来自 ' + (b.path || 'agent 记忆文件')),
          agent,
          evidence: '原始文件',
          allowDuplicate: true,   // 记忆备份每次都可以覆盖式新增
          tags: b.path ? [b.path] : [],
        });
        return sendJson(res, w.ok ? 201 : 400, w);
      }

      // ── 合并项目 ──
      // 设计依据：项目只是溯源标签，用户看到重复的项目可以合并。
      // 合并后不可拆分——原归属信息会丢失，所以前端必须先让用户确认。
      if (route === 'POST /api/projects/merge') {
        const b = await readBody(req);
        const fromRef = b.from;
        const intoRef = b.into;
        if (!fromRef || !intoRef) {
          return sendJson(res, 400, { ok: false, error: '缺少 from 或 into' });
        }
        // 必须显式确认，防止误操作
        if (b.confirm !== true) {
          return sendJson(res, 400, {
            ok: false,
            error: '合并不可逆，需要传 confirm: true 明确确认',
          });
        }
        const r = store.mergeProjects(fromRef, intoRef);
        if (!r.ok) return sendJson(res, 400, r);
        return sendJson(res, 200, r);
      }

      // ── 写入 ──
      if (route === 'POST /api/write') {
        const body = await readBody(req);
        const result = store.write(body);
        if (!result.ok) {
          return sendJson(res, result.duplicates ? 409 : 400, result);
        }
        return sendJson(res, 201, result);
      }

      // ── 检索 ──
      // ── 搜索 ──
      //
      // 隐私规则（老板 2026-11-02）：按 uid 过滤，只返回该账号的记录 + 全局的。
      if (route === 'POST /api/search' || route === 'GET /api/search') {
        // 注意：请求体只能读一次，读完流就空了。
        // 之前这里读了两次（先取 q，再取整个 body），导致第二次读到 {}，
        // project / minScore / limit 全部丢失，搜索会跨项目串结果。
        const body = req.method === 'GET' ? {} : await readBody(req, true);
        const q = req.method === 'GET'
          ? url.searchParams.get('q') || ''
          : body.q || '';
        if (!q.trim()) return sendJson(res, 400, { ok: false, error: '缺少查询词 q' });

        // uid 可能来自 URL（GET）或请求体（POST）—— 两种都要认
        const bodyUid = String(body.uid || '').trim();
        const who = bodyUid ? { uid: bodyUid, from: 'agent' } : resolveUid(url);
        const result = store.search(q, {
          project: body.project || url.searchParams.get('project') || undefined,
          kinds: body.kinds || undefined,
          // 多取一些，过滤后还能凑够 limit
          limit: Number(body.limit || url.searchParams.get('limit') || 20) * 3,
          minScore: body.minScore !== undefined ? Number(body.minScore) : 0.4,
        });
        const kept = filterByUid(result.items || [], who.uid, groupMatesOf(wbDataDir, who.uid, allUidsFor(who.uid)));
        const want = Number(body.limit || url.searchParams.get('limit') || 20);

        // 自我描述：搜到 0 条时，必须能分清"真没有"和"你没指定账号"
        const accounts = store.listAccounts();
        const scoped = !!who.uid;
        const matchedAll = (result.items || []).length;   // 按 uid 过滤前（全库命中）
        const payload = {
          ok: true,
          query: q,
          total: kept.length,
          items: kept.slice(0, want),
          uid: who.uid,
          scoped,
          matchedAll,                    // 全库命中条数
          shown: kept.length,            // 本次可见命中条数
          accounts,
        };
        if (!scoped) {
          const others = Math.max(0, matchedAll - kept.length);
          payload.notice = `未指定 uid：只在"全局内容"里搜，命中 ${kept.length} 条。`
            + (others > 0
              ? `另有 ${others} 条命中属于其他账号（全库命中 ${matchedAll} 条），你没看到。`
              : `全库命中 ${matchedAll} 条，其中没有属于其他账号的。`)
            + `要搜全部：加 ?uid=*；要搜某个账号：加 ?uid=<uid>（用 accounts[].uid，不要用昵称）。`;
        }
        return sendJson(res, 200, payload);
      }

      // ── 取内容（统一入口：get） ──
      //
      // 隐私规则：
      //   · 不是自己账号的 → 拒绝（403）
      //   · 隐私库（memory / changelog）→ 【标题、时间、账号给看，正文不给】
      //     老板原话：「点击看不到具体内容」
      //     → 这样点进去不会是一片空白，而是"这条内容不在这里展示"
      if (route === 'GET /api/get' || route === 'POST /api/get') {
        let id = url.searchParams.get('id');
        if (!id && req.method === 'POST') {
          const b = await readBody(req);
          id = b.id || b.name;
        }
        if (!id) return sendJson(res, 400, { ok: false, error: '缺少 id' });
        const item = store.get(id);
        if (!item) return sendJson(res, 404, { ok: false, error: '内容不存在' });

        const who = resolveUid(url);
        const owner = String(item.uid || '').trim();
        const owners = owner ? owner.split(',').map((s) => s.trim()).filter(Boolean) : [];
        // 例外：显式 ?uid=* 表示"查这台机器上所有账号"，不按归属拦
        if (owners.length && who.uid !== '*' && !owners.includes(who.uid)) {
          return sendJson(res, 403, {
            ok: false,
            error: '这条记录不属于当前账号',
            ownerUid: owners.join(','),
            hint: '用 ?uid=<ownerUid> 重试；要一次查全部账号用 ?uid=*。',
          });
        }

        // 隐私库：人看的时候不给正文（agent 带 body=1 才给）
        const wantBody = url.searchParams.get('body') === '1';
        if (!wantBody && !canViewContent(item.kind, item.project)) {
          return sendJson(res, 200, {
            ok: true,
            item: Object.assign({}, item, {
              content: '',        // 正文清空
              bodyHidden: true,   // 告诉前端"这条内容故意不展示"
            }),
          });
        }

        return sendJson(res, 200, { ok: true, item });
      }

      // ── 列表 ──
      //
      // 隐私规则（老板 2026-11-02）：
      //   · 按 uid 过滤（不带 uid 的调用 = 非法，只给全局内容）
      //   · 【标题照常显示】—— 让人知道存了什么，不会以为"库是空的"
      //   · 【正文不给】—— 隐私库（memory / changelog）的正文只有 agent 能取
      //
      // 老板原话：「下拉菜单都有内容，页面说'这里还没有内容'，用户感觉很奇怪。
      //            你把标题直接就显示在页面上，但点击看不到具体内容。」
      if (route === 'GET /api/list') {
        const who = resolveUid(url);
        const wantBody = url.searchParams.get('body') === '1';   // agent 要正文
        const result = store.list({
          project: url.searchParams.get('project') || undefined,
          kind: url.searchParams.get('kind') || undefined,
          sourceType: url.searchParams.get('sourceType') || undefined,
          // 溯源筛选
          agent: url.searchParams.get('agent') || undefined,
          session: url.searchParams.get('session') || undefined,
          // WorkBuddy 账号筛选
          account: url.searchParams.get('account') || undefined,
          limit: Number(url.searchParams.get('limit') || 50) * 3,
          offset: 0,
        });

        // ① 按 uid 过滤
        const kept = filterByUid(result.items || [], who.uid, groupMatesOf(wbDataDir, who.uid, allUidsFor(who.uid)));
        const counts = countByKind(kept);

        // ② 人看界面（没带 body=1）：隐私库的【摘要】也藏起来
        //    （摘要往往就是正文第一句，等于泄露内容）
        const items = wantBody
          ? kept
          : kept.map((it) => (canViewContent(it.kind, it.project)
            ? it
            : Object.assign({}, it, { summary: '', bodyHidden: true })));

        const limit = Number(url.searchParams.get('limit') || 50);
        const offset = Number(url.searchParams.get('offset') || 0);

        // ③ 自我描述（老板 2026-11-13）：
        //   不带 uid 时只给全局内容，但【必须告诉调用方"你只看到了一部分"】。
        //   为什么：之前是静默残缺 —— agent 看到 5 条就断言"库里没有这个项目"，
        //   实际全库 94 条属于多个账号。残缺不可怕，静默残缺才致命。
        const accounts = store.listAccounts();
        const scoped = !!who.uid;
        const payload = {
          ok: true,
          total: items.length,
          items: items.slice(offset, offset + limit),
          counts,          // 各库条数（含隐私库）—— 界面显示"已存多少条"
          uid: who.uid,
          uidFrom: who.from,
          scoped,                       // false = 你没指定账号，看到的只是一部分
          shown: items.length,          // 本次可见条数（账号过滤后）
          totalAll: result.total,       // 全库条数（不按账号过滤）
          accounts,                     // [{uid, account, total}] 机器可直接用
        };
        if (!scoped) {
          payload.notice = `未指定 uid：只返回了全局内容（${items.length} 条）。`
            + `本库共 ${result.total} 条，分属 ${accounts.length} 个账号。`
            + `要查全部账号：加 ?uid=*；要查某个账号：加 ?uid=<uid>`
            + `（uid 用 accounts[].uid，不要用昵称）。`;
        }
        return sendJson(res, 200, payload);
      }

      // ── WorkBuddy 账号清单 ──
      if (route === 'GET /api/accounts') {
        return sendJson(res, 200, { ok: true, accounts: store.listAccounts() });
      }

      // ── WorkBuddy：云端会话（手机版）清单 ──
      // 这些会话内容在云端服务器，本地无文件；但元数据（标题/时间/账号）能读到。
      // 用户自己在 WorkBuddy 侧栏里看不到它们，这个接口是给他们补的。
      if (route === 'GET /api/cloud-sessions') {
        const dir = opts.dataDir || store.dataDir;
        const list = listCloudSessions(dir);
        return sendJson(res, 200, { ok: true, total: list.length, sessions: list });
      }

      // ── WorkBuddy：agent 接入了没有 ──
      // 检测每个账号的 MEMORY.md 里有没有那段引导。
      // 没有 → 界面上提醒用户「再发一次引导语」。
      // 用途：防 agent 没写、或写了被清掉/被云端覆盖。
      if (route === 'GET /api/install-status') {
        const port = actualPort();
        // 传 dataDir：读 accounts.json 里的昵称（抓到过才有）
        const st = checkAgentInstalled(wbDataDir);
        // 附上「再发一次」要用的那句话（给本地文件路径 —— HTTP 会被网络策略拦）
        // 语言统一英文（老板 2026-11-07 定：挡住刨根问底的普通用户）
        const sentence = userSentence(port, 'en', wbGuideFile);
        return sendJson(res, 200, {
          ok: true,
          sentence,
          guideFile: wbGuideFile,
          needAttention: st.missing.length > 0,
          // 显示名规则：有昵称用昵称，没昵称用「账号 <uid 前 8 位>」
          installed: st.installed.map((x) => ({
            uid: x.uid, name: x.name, hasNickname: x.hasNickname, size: x.size,
          })),
          missing: st.missing.map((x) => ({
            uid: x.uid, name: x.name, hasNickname: x.hasNickname, hasFile: x.hasFile,
          })),
          total: st.all.length,
        });
      }

      // ── WorkBuddy：给 agent 读的接入说明（纯文本，也供 agent 直接 curl） ──
      if (route === 'GET /agent-rules') {
        const port = actualPort();
        const accounts = store.listAccounts();
        const lang = pickLang(req, url);
        // selfBlock：给 agent 抄进自己 MEMORY.md 的那段
        // （由 agent 自己写，我们不碰 WorkBuddy 的文件 —— 规避法律风险）
        const selfBlock = memoryBlock(port, 'zh', wbPaths);
        // accountPaths：本机检测到的账号 MEMORY.md 完整路径
        // （直接列给 agent 选，省得它自己拼路径/换文件名）
        const accountPaths = accountMemoryPaths();
        const body = buildGuide(port, {
          accounts, lang, selfBlock, accountPaths,
          dataDir: wbDataDir, exportDir: wbExportDir,
        });
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
          'Cache-Control': 'no-cache',
        });
        res.end(body);
        return;
      }

      // ── WorkBuddy：高频词触发时读的短文件（极短，唤起记忆用） ──
      if (route === 'GET /Remember.md') {
        const port = actualPort();
        const body = rememberBlock(port, wbPaths);
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
          'Cache-Control': 'no-cache',
        });
        res.end(body);
        return;
      }

      // ── WorkBuddy：给用户的一句话（复制粘贴给新 agent 用） ──
      if (route === 'GET /api/user-sentence') {
        const port = actualPort();
        const lang = pickLang(req, url);
        return sendJson(res, 200, {
          ok: true,
          sentence: userSentence(port, lang, wbGuideFile),
          guideFile: wbGuideFile,
        });
      }

      // ── WorkBuddy：写进账号 MEMORY.md 的那段（供安装脚本用） ──
      if (route === 'GET /api/memory-block') {
        const port = actualPort();
        const lang = pickLang(req, url);
        const text = memoryBlock(port, lang, wbPaths);
        return sendJson(res, 200, { ok: true, text, guideFile: wbGuideFile });
      }

      // ── WorkBuddy：导出给 agent 直接读的文件（不经过网络） ──
      if (route === 'POST /api/export' || route === 'GET /api/export') {
        const port = actualPort();
        const r = exportAgentArtifacts({ store, dataDir: wbDataDir, port });
        return sendJson(res, r.ok ? 200 : 500, r);
      }

      // ── WorkBuddy：手动触发同步 ──
      if (route === 'POST /api/sync' || route === 'GET /api/sync') {
        const syncer = opts.syncer || server.__syncer;
        if (!syncer) return sendJson(res, 503, { ok: false, error: '同步器未启用' });
        const force = url.searchParams.get('force') === '1';
        const r = await syncer.run({ force });
        return sendJson(res, r.ok ? 200 : 409, r);
      }

      // ── WorkBuddy：同步状态 ──
      if (route === 'GET /api/sync/status') {
        const syncer = opts.syncer || server.__syncer;
        if (!syncer) return sendJson(res, 503, { ok: false, error: '同步器未启用' });
        return sendJson(res, 200, { ok: true, ...syncer.status() });
      }

      // ── 删除（仅外部库） ──
      if (route === 'DELETE /api/item') {
        const id = url.searchParams.get('id');
        if (!id) return sendJson(res, 400, { ok: false, error: '缺少 id' });
        const result = store.remove(id);
        return sendJson(res, result.ok ? 200 : 403, result);
      }

      // ── 库类型说明（给 agent 读的） ──
      if (route === 'GET /api/kinds') {
        return sendJson(res, 200, {
          ok: true,
          kinds: Object.entries(KINDS).map(([kind, meta]) => ({
            kind,
            label: meta.label,
            sourceType: meta.sourceType,
            deletable: meta.sourceType === 'external',
          })),
        });
      }

      // ── 配置 ──
      if (route === 'GET /api/config') {
        const cfg = opts.config ? opts.config.get() : {};
        return sendJson(res, 200, { ok: true, config: cfg });
      }

      if (route === 'POST /api/config') {
        if (!opts.config) return sendJson(res, 500, { ok: false, error: '配置未初始化' });
        const body = await readBody(req);
        const cfg = opts.config.update(body);
        return sendJson(res, 200, { ok: true, config: cfg });
      }

      // ── 备份 ──
      //
      // 老板定的规则（2026-11-04）：
      //   「每周备份一次也没问题……每三个月删除 3 个月以前的，这样还可以。」
      //   「备份到哪儿？就像你说的备份到 data 下的 backup 目录。
      //     在设置里面允许用户修改。」
      // ── 帮助文档 ──
      //
      // 老板要求（2026-11-05）：
      //   「在我们平台设置一个栏目 help 帮助，把说明书放到我们平台上」
      if (route === 'GET /api/help') {
        return sendJson(res, 200, { ok: true, help: HELP });
      }

      // ── 广告位（内容配置化）──
      //
      // 设计（老板 2026-11-07 定）：
      //   广告内容（图 + 链接 + 开关）放在数据目录的 ads.json，
      //   图片放在数据目录的 ads/ 下。
      //   以后上广告 / 换图 / 换链接，只改这两个，不用改代码、不用重发版。
      if (route === 'GET /api/ads') {
        return sendJson(res, 200, { ok: true, ads: readAdsConfig(wbDataDir) });
      }

      // 广告图片（从数据目录读，防目录穿越）
      if (route === 'GET /api/ad-image') {
        const file = path.basename(url.searchParams.get('file') || '');
        if (!file) return sendJson(res, 400, { ok: false, error: 'no file' });
        const p = path.join(wbDataDir, 'ads', file);
        try {
          const buf = fs.readFileSync(p);
          const mime = file.endsWith('.png') ? 'image/png'
            : file.endsWith('.jpg') || file.endsWith('.jpeg') ? 'image/jpeg'
            : file.endsWith('.gif') ? 'image/gif'
            : file.endsWith('.webp') ? 'image/webp'
            : 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': mime, 'Content-Length': buf.length, 'Cache-Control': 'no-cache' });
          res.end(buf);
          return;
        } catch {
          return sendJson(res, 404, { ok: false, error: 'not found' });
        }
      }

      // ── 远程内容下发（Remote Config）──
      // 检测云端是否有新内容（用户客户端启动时查，有更新就弹窗）
      if (route === 'GET /api/remote-check') {
        const r = await checkRemoteUpdate(wbDataDir);
        return sendJson(res, 200, { ok: true, hasUpdate: r.hasUpdate });
      }

      // 执行更新（用户在弹窗里点「更新」后调）
      if (route === 'GET /api/remote-update' || route === 'POST /api/remote-update') {
        const r = await applyRemoteUpdate(wbDataDir);
        return sendJson(res, 200, { ok: r.ok, remote: r.cfg || null });
      }

      // ── 软件版本增量更新（2.0）──
      // 检测云端有没有新版本（比对 remote.json 的 version 字段）
      if (route === 'GET /api/update-check') {
        const r = await checkUpdate(wbDataDir);
        return sendJson(res, 200, {
          ok: true,
          hasUpdate: r.hasUpdate,
          remoteVersion: r.remoteVersion,
          localVersion: r.localVersion,
          notes: r.notes,
        });
      }

      // 执行增量更新（用户点「更新」后调；更新的是 code/ 目录，非 exe）
      if (route === 'GET /api/update-apply' || route === 'POST /api/update-apply') {
        const r = await applyUpdate(wbDataDir);
        // 更新成功 → 安排重启，让新代码立即生效
        // 注意：先返回响应，再延迟重启（scheduleRestart 里 setTimeout 1200ms，
        //       足够 sendJson 把响应写完）
        if (r.ok) scheduleRestart();
        return sendJson(res, 200, { ok: r.ok, error: r.error || null, version: r.version || null });
      }

      // 回滚到上一版（更新失败或新版本有问题时，用户点「回滚」）
      if (route === 'GET /api/update-rollback' || route === 'POST /api/update-rollback') {
        const r = rollback(wbDataDir);
        return sendJson(res, 200, { ok: r.ok, error: r.error || null });
      }

      // 是否有可回滚的备份（前端决定是否显示「回滚」按钮）
      if (route === 'GET /api/update-backup-status') {
        return sendJson(res, 200, { ok: true, hasBackup: hasBackup() });
      }

      // 远程配置（本地缓存，前端渲染二维码入口用）
      if (route === 'GET /api/remote') {
        const cfg = readCachedRemote(wbDataDir);
        return sendJson(res, 200, {
          ok: true,
          remote: cfg || { qr: { enabled: false, image: '', title: '' } },
        });
      }

      // 远程图片（二维码等，从本地缓存读）
      if (route === 'GET /api/remote-image') {
        const file = url.searchParams.get('file') || '';
        const buf = readRemoteImage(wbDataDir, file);
        if (!buf) return sendJson(res, 404, { ok: false, error: 'not found' });
        const mime = file.endsWith('.png') ? 'image/png'
          : file.endsWith('.jpg') || file.endsWith('.jpeg') ? 'image/jpeg'
          : file.endsWith('.gif') ? 'image/gif'
          : file.endsWith('.webp') ? 'image/webp'
          : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime, 'Content-Length': buf.length, 'Cache-Control': 'no-cache' });
        res.end(buf);
        return;
      }

      if (route === 'GET /api/backup') {
        return sendJson(res, 200, { ok: true, backup: backupStatus(wbDataDir) });
      }

      // 立即备份
      if (route === 'POST /api/backup/now') {
        const r = backupNow(wbDataDir);
        if (!r.ok) return sendJson(res, 500, { ok: false, error: r.error });
        return sendJson(res, 200, {
          ok: true,
          name: r.name,
          size: r.size,
          cleaned: r.cleaned,
        });
      }

      // 改备份配置（目录 / 周期 / 保留月数）
      if (route === 'POST /api/backup/config') {
        const b = await readBody(req);
        const patch = {};

        if (b.dir !== undefined) {
          const dir = String(b.dir || '').trim();
          if (dir) {
            // 校验：能不能建目录 + 能不能写（不然用户填错了，备份永远失败）
            const resolved = path.resolve(dir);
            try {
              fs.mkdirSync(resolved, { recursive: true });
              const probe = path.join(resolved, '.write-test');
              fs.writeFileSync(probe, 'ok');
              fs.unlinkSync(probe);
            } catch (e) {
              return sendJson(res, 400, {
                ok: false,
                error: '这个目录用不了：' + e.message,
              });
            }
            patch.dir = resolved;
          } else {
            patch.dir = '';   // 空 = 回到默认
          }
        }

        if (b.weekly !== undefined) patch.weekly = Boolean(b.weekly);

        if (b.keepMonths !== undefined) {
          const m = Number(b.keepMonths);
          if (!(m > 0 && m <= 120)) {
            return sendJson(res, 400, { ok: false, error: '保留月数要在 1 到 120 之间' });
          }
          patch.keepMonths = m;
        }

        saveBackupConfig(wbDataDir, patch);
        return sendJson(res, 200, { ok: true, backup: backupStatus(wbDataDir) });
      }

      // ── 给 agent 的接入指令（WorkBuddy 版）──
      // 注意：这里不用主线的 buildAgentGuide —— 那是「让 agent 配置自己 + 写库」，
      // 本项目是【只读】的（数据从磁盘自动同步），定位完全不同。
      if (route === 'GET /api/agent-guide') {
        const port = actualPort();
        const lang = pickLang(req, url);
        // 传 guidePath：统一用本地文件路径（跟概览页 installNotice 一致）
        const sentence = userSentence(port, lang, wbGuideFile);
        return sendJson(res, 200, {
          ok: true,
          text: sentence,
          sentence,
          rulesUrl: `http://127.0.0.1:${port}/agent-rules`,
          lang,
        });
      }

      // ── 一句话提醒（给 hook 用，极短） ──
      // 注：原主线的 `/agent-rules`（返回 buildAgentGuide 的完整说明书）已删除 ——
      // 本项目的 `/agent-rules` 在上面（WorkBuddy 版），那是「怎么查记忆」的说明，
      // 不是「让 agent 配置自己 + 写库」的主线流程。
      if (route === 'GET /reminder') {
        const lang = pickLang(req, url);
        const port = actualPort();
        const body = buildReminder(port, lang);
        return sendJson(res, 200, { ok: true, reminder: body, lang });
      }

      // ── 会话开始提示（给 SessionStart hook 用） ──
      if (route === 'GET /session-hint') {
        const lang = pickLang(req, url);
        const port = actualPort();
        const body = buildSessionHint(port, lang);
        return sendJson(res, 200, { ok: true, hint: body, lang });
      }

      // ── 支持的 agent 列表 ──
      if (route === 'GET /api/agents') {
        return sendJson(res, 200, { ok: true, agents: AGENT_TARGETS });
      }

      // ── 生成某个 agent 的适配配置 ──
      if (route === 'GET /api/agent-adapter') {
        const agentId = url.searchParams.get('agent') || 'claude-code';
        const lang = pickLang(req, url);
        const port = actualPort();
        const r = buildAgentAdapter(agentId, port, lang);
        if (r.error) return sendJson(res, 400, { ok: false, error: r.error });
        return sendJson(res, 200, { ok: true, agent: r.target, files: r.files });
      }

      // ── Hook 端点（返回双重兼容格式：同时支持 Claude Code 与 Hermes） ──
      // 三个事件各一个端点，Claude Code 或 Hermes 的配置文件里直接 curl 调用即可，无需中转脚本
      if (route === 'GET /hook/session-start' || route === 'GET /hook/stop' || route === 'GET /hook/pre-compact') {
        const lang = pickLang(req, url);
        const port = actualPort();
        const eventName =
          url.pathname === '/hook/session-start' ? 'SessionStart' :
          url.pathname === '/hook/pre-compact' ? 'PreCompact' : 'Stop';
        const out = buildClaudeHookOutput(eventName, port, lang);
        return sendJson(res, 200, out);
      }

      // ── 抓取 GitHub README ──
      //
      // 抓回来就【格式化】：去掉 HTML、徽章、语言导航、长链接，
      // 代码块收缩到合理长度，总量控制在 8000 字内。
      // 老板明确（2026-11-02）：「抓取过来的内容格式化一下，不要显示代码」
      if (route === 'POST /api/fetch-readme') {
        const body = await readBody(req);
        if (!body.url) return sendJson(res, 400, { ok: false, error: '缺少 url' });
        const r = await fetchGitHubReadme(body.url);
        if (!r.ok) return sendJson(res, 400, r);
        // 附上格式化后的正文（前端存的时候直接用这个）
        const fmt = buildExternalBody(r);
        return sendJson(res, 200, Object.assign({}, r, {
          cleaned: fmt.body,
          removed: fmt.removed,
        }));
      }

      return sendJson(res, 404, { ok: false, error: `未知接口: ${route}` });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: String(err && err.message || err) });
    }
  });

  return server;
}

/**
 * 按顺序尝试端口，返回第一个能用的
 * @param {http.Server} server
 * @param {number[]} [ports]
 * @returns {Promise<number>}
 */
export async function listenWithFallback(server, ports = DEFAULT_PORTS) {
  const errors = [];
  for (const port of ports) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (err) => {
          server.off('error', onError);
          reject(err);
        };
        server.once('error', onError);
        server.listen(port, '127.0.0.1', () => {
          server.off('error', onError);
          resolve();
        });
      });
      return port;
    } catch (err) {
      errors.push(`${port}: ${err.code || err.message}`);
    }
  }
  throw new Error(`所有端口都被占用：${errors.join(', ')}`);
}

// ── 工具 ─────────────────────────────────────────────────

/**
 * 判断返回哪种语言
 * 优先级：?lang= 参数 > Accept-Language 头 > 默认中文
 *
 * 中文用户为主（见开发文档 1.7），所以默认中文。
 */
function pickLang(req, url) {
  const q = url.searchParams.get('lang');
  if (q === 'en' || q === 'zh') return q;
  const al = req.headers['accept-language'] || '';
  if (/^en\b/i.test(al) || /,\s*en\b/i.test(al)) return 'en';
  return 'zh';
}


/**
 * 读广告位配置（data/ads.json）。
 * 不存在或读坏了 → 返回「全部禁用」，页面不渲染广告位，保持干净。
 */
function readAdsConfig(dataDir) {
  const p = path.join(dataDir, 'ads.json');
  const empty = {
    group: { enabled: false, image: '', title: '' },
  };
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const cfg = JSON.parse(raw);
    return {
      group: cfg.group || empty.group,
    };
  } catch {
    return empty;
  }
}


/**
 * 提供静态文件。返回 true 表示已处理。
 * 优先用内嵌资源（exe 环境），回退到磁盘（开发环境）。
 */
function serveStatic(pathname, res, method) {
  // 防目录穿越
  if (pathname.includes('..')) {
    res.writeHead(400);
    res.end('Bad request');
    return true;
  }

  const asset = readAsset(pathname);
  if (asset) {
    // index.html 里的 __VER__ 要换成构建标记 —— 否则浏览器会用旧的 app.js
    //
    // 为什么（2026-11-02 踩过）：改了 app.js 之后，用户打开设置页看不到新功能，
    // 因为浏览器缓存了旧文件。`/` 走的正是这个分支，所以替换必须放这里。
    let body = asset.body;
    if (body.indexOf('__VER__') !== -1) {
      body = body.replace(/__VER__/g, String(BUILD_STAMP));
    }
    res.writeHead(200, {
      'Content-Type': asset.mime,
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    // HEAD 请求只回头，不回体
    res.end(method === 'HEAD' ? undefined : body);
    return true;
  }

  // SPA 兜底：非资源请求返回 index.html
  if (!/\.[a-z0-9]+$/i.test(pathname)) {
    const idx = readIndexHtml();
    if (idx) {
      // 把 __VER__ 换成构建时间戳 —— 强制浏览器重新拉 app.js/app.css
      //
      // 为什么（2026-11-02 踩过）：改了 app.js 之后用户打开设置页看不到新功能，
      // 因为浏览器缓存了旧文件。加版本号是最省事的解法。
      const body = idx.body.replace(/__VER__/g, String(BUILD_STAMP));
      res.writeHead(200, {
        'Content-Type': idx.mime,
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(body);
      return true;
    }
  }

  return false;
}
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req, optional = false) {
  if (req.method === 'GET') return {};
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) {
    if (optional) return {};
    throw new Error('请求体为空');
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('请求体不是合法 JSON');
  }
}
