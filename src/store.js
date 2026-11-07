/**
 * LBASE 存储层
 *
 * 设计依据（见 docs/00-开发文档.md 第四章）：
 * - 文件 + 索引：内容以 markdown 文件存在磁盘上，agent 可直接读
 * - 索引只用于快速检索（JSON 文件，非数据库）
 * - 内部库写入后不可删改（溯源）；外部库可任意删改
 *
 * 目录结构：
 *   <dataDir>/
 *   ├── projects.json              项目表
 *   ├── index.json                 索引
 *   └── <projectId>/
 *       ├── skills/                技能（internal）
 *       ├── wiki/                  知识（internal）
 *       ├── changelog/             变更（internal）
 *       ├── memory/                记忆（internal）
 *       ├── agent-memory/          agent 记忆文件备份（internal）
 *       └── external/              外部资源（external，可删改）
 *           ├── candidates/        候选（只存 README）
 *           ├── wiki/              外部知识
 *           └── skills/            外部技能
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { matchScore, similarity, tokenize } from './text.js';
import { Index } from './index-store.js';

/** 四个自有库 + 外部三类 */
export const KINDS = {
  skill: { dir: 'skills', sourceType: 'internal', label: '技能库' },
  wiki: { dir: 'wiki', sourceType: 'internal', label: '知识库' },
  changelog: { dir: 'changelog', sourceType: 'internal', label: '溯源库' },
  memory: { dir: 'memory', sourceType: 'internal', label: '上下文记忆库' },
  // 第 5 个库：备份 agent 自己维护的持久记忆文件（如 ~/.dsh/AGENTS.md）
  // 和 memory 的区别：memory 是 agent 每次会话写进来的要点，
  // agent-memory 是 agent 自己的那个几千字节的长期文件，防丢失用。
  'agent-memory': { dir: 'agent-memory', sourceType: 'internal', label: 'Agent 记忆备份' },
  'external-candidate': { dir: 'external/candidates', sourceType: 'external', label: '外部候选' },
  'external-wiki': { dir: 'external/wiki', sourceType: 'external', label: '外部知识库' },
  'external-skill': { dir: 'external/skills', sourceType: 'external', label: '外部技能库' },
};

/** 外部来源的 kind 前缀 */
export function isExternalKind(kind) {
  return String(kind).startsWith('external-');
}

export class Store {
  /**
   * @param {string} dataDir 数据目录
   */
  constructor(dataDir, opts = {}) {
    this.dataDir = path.resolve(dataDir);
    fs.mkdirSync(this.dataDir, { recursive: true });

    this.projectsFile = path.join(this.dataDir, 'projects.json');
    this.projects = this.#loadProjects();
    this.index = new Index(path.join(this.dataDir, 'index.json'));

    // 只读开关：成品部署时设 BT_READONLY=1，内部库内容锁定、不能删改。
    // 开发阶段不设这个变量 = 可以随意删改（方便清理测试数据、调整内容）。
    this.readonly = opts.readonly !== undefined
      ? Boolean(opts.readonly)
      : process.env.BT_READONLY === '1';
  }

  // ── 项目 ────────────────────────────────────────────────

  #loadProjects() {
    if (!fs.existsSync(this.projectsFile)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.projectsFile, 'utf8'));
    } catch {
      return [];
    }
  }

  #saveProjects() {
    const tmp = this.projectsFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.projects, null, 2), 'utf8');
    fs.renameSync(tmp, this.projectsFile);
  }

  /**
   * 创建项目
   * @param {string} name 项目名
   * @param {object} [opts]
   * @returns {{id: string, name: string, createdAt: string}}
   */
  createProject(name, opts = {}) {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('项目名不能为空');

    const existing = this.projects.find((p) => p.name === trimmed);
    if (existing) return existing;

    const project = {
      id: opts.id || 'prj-' + crypto.randomBytes(6).toString('hex'),
      name: trimmed,
      createdAt: new Date().toISOString(),
      // 二期预留：二级标签
      parentProjectId: null,
    };

    this.projects.push(project);
    this.#saveProjects();

    for (const meta of Object.values(KINDS)) {
      fs.mkdirSync(path.join(this.dataDir, project.id, meta.dir), { recursive: true });
    }

    return project;
  }

  /** 列出所有项目 */
  listProjects() {
    return this.projects.slice();
  }

  /**
   * 合并项目：把 from 的所有内容改成 belong 到 into，然后删掉 from
   *
   * 设计依据：
   * - 项目只是溯源用的标签，不是目录结构，所以只改索引里的 project_id
   * - 文件留在原物理目录，不影响任何查询（查询只走索引）
   * - 不可逆：原来哪些内容属于 from 的信息会丢失
   *
   * @param {string} fromRef 被合并的项目（id 或名字）
   * @param {string} intoRef 目标项目（id 或名字）
   * @returns {{ok: boolean, moved?: number, error?: string}}
   */
  mergeProjects(fromRef, intoRef) {
    const from = this.getProject(fromRef);
    const into = this.getProject(intoRef);

    if (!from) return { ok: false, error: '要合并的项目不存在: ' + fromRef };
    if (!into) return { ok: false, error: '目标项目不存在: ' + intoRef };
    if (from.id === into.id) return { ok: false, error: '不能合并到自己' };

    // 1. 把 from 下的所有内容改成 into
    const rows = this.index.query({ projectId: from.id });
    let moved = 0;
    for (const row of rows) {
      // 索引里只有 project_id，改它就够了
      this.index.update(row.id, { project_id: into.id });
      // 同步改正文文件 frontmatter 里的 project / project_id，避免「文件 vs 索引」不一致
      this.#updateFileProject(row.file_path, into);
      moved++;
    }

    // 2. 前端缓存里的 frontmatter 也更新（文件本身不动）
    //    注意：正文文件的 frontmatter 保留旧项目名，
    //    但查询和展示都以索引为准，不影响使用。

    // 3. 从项目列表里删掉 from
    this.projects = this.projects.filter((p) => p.id !== from.id);
    this.#saveProjects();

    return { ok: true, moved, from: from.name, into: into.name };
  }

  /** 按 id 或名字找项目 */
  /**
   * 给索引行补上项目名
   *
   * 索引里只存 project_id（避免项目改名后索引不一致），
   * 但对外返回时必须带上项目名，否则调用方（尤其是 agent 做溯源时）
   * 看不出这条记录属于哪个项目。
   */
  /**
   * 读 accounts.json 的历史昵称（uid → nickname）
   *
   * 带缓存：按文件 mtime 判断要不要重读，避免每次 list() 都碰盘。
   */
  #namesCache = null;
  #namesMtime = 0;

  #knownNames() {
    const p = path.join(this.dataDir, 'accounts.json');
    let mt = 0;
    try {
      mt = fs.statSync(p).mtimeMs;
    } catch {
      return new Map();
    }
    if (this.#namesCache && this.#namesMtime === mt) return this.#namesCache;

    const m = new Map();
    try {
      const d = JSON.parse(fs.readFileSync(p, 'utf8'));
      const acc = (d && d.accounts) || {};
      for (const uid in acc) {
        const nick = acc[uid] && acc[uid].nickname;
        if (nick && String(nick).trim()) m.set(uid, String(nick).trim());
      }
    } catch { /* 读不到就算了 */ }

    this.#namesCache = m;
    this.#namesMtime = mt;
    return m;
  }

  /**
   * 把「账号 aaaa1111」这类代号换成真昵称
   *
   * ── 老板的要求（2026-11-05）──
   *
   *   「至于叫张三还是要代码，我觉得应该按照人家的登录名去区分。
   *     用户不知道代码是谁的，必须得用他的昵称来代替。
   *     虽然我们记着他的 UID，但是显示出来也得是个昵称。」
   *
   * ── 为什么要在读的时候改（不是重扫）──
   *
   * 扫描时 accName() 算不出昵称（accounts.json 当时还没有记录），
   * 就把「账号 aaaa1111」写进了 index.json 的 account 字段和 title，
   * 也写进了 projects.json 的项目名。
   *    ↓
   * 后来昵称补上了（日志挖掘 / 登录快照），但盘上那些字符串不会自动变。
   *    ↓
   * 重扫一次能修，但用户已经装好的库要么等 30 分钟、要么手动触发，
   * 而且 projects.json 里的项目名还得改（改项目名有风险，可能撞名）。
   *    ↓
   * 所以在【输出时】做一次映射：盘上数据不动，界面看到的永远是真名。
   * 旧数据、新数据、别人拷来的数据，全部立刻正确。
   */
  #nickOf(uid, names) {
    if (!uid) return '';
    return names.get(uid) || '';
  }

  /** 把一段文字里的「账号 xxxxxxxx」换成昵称 */
  #fixText(s, uid, names) {
    if (!s || typeof s !== 'string') return s;
    if (!names.size) return s;

    // 先按「账号 xxxxxxxx」找到 uid，再查昵称
    // （不管这一行的 uid 是什么都要替换 —— 组合名「李四 + 账号 aaaa1111」
    //   里的 uid 是 131 那个，但代号指的是张三，所以必须按代号本身反查）
    return s.replace(/账号\s+([0-9a-f]{8})/gi, (whole, short) => {
      const key = String(short).toLowerCase();
      for (const u of names.keys()) {
        if (u.toLowerCase().startsWith(key)) return names.get(u);
      }
      return whole;   // 查不到就原样保留
    });
  }

  #withProjectName(row) {
    if (!row) return row;
    const p = this.projects.find((x) => x.id === row.project_id);
    const projName = p ? p.name : null;

    const names = this.#knownNames();
    if (!names.size) return { ...row, project: projName };

    const uid = row.uid || '';
    const nick = this.#nickOf(uid, names);

    // account / agent 统一过一遍 #fixText
    //
    // 为什么要过：#fixText 会把任何位置的「账号 xxxxxxxx」替换成昵称，
    // 包括组合名「李四 + 账号 aaaa1111」→「李四 + 张三」。
    // 只判断"整串是否等于代号"不够（2026-11-05 实测残留 1 条组合名）。
    const fixField = (v) => {
      let s = v || '';
      // 代号 / 空 / WorkBuddy → 用这一行的 uid 对应的昵称
      //
      // 为什么特别处理 'WorkBuddy'：
      //   旧版 wb-extract.js 的默认值是 agent: opts.account || 'WorkBuddy'，
      //   抓不到账号名就填 'WorkBuddy'，界面显示在「账号」列，
      //   用户以为多了一个叫 WorkBuddy 的账号（2026-11-05 反馈）。
      if (!s || s === 'WorkBuddy' || s === '未标注账号' || /^账号\s+[0-9a-f]{8}$/i.test(s)) {
        if (nick) s = nick;
      }
      // 组合名里的代号也要换
      return this.#fixText(s, uid, names);
    };

    return {
      ...row,
      project: this.#fixText(projName, uid, names),
      title: this.#fixText(row.title, uid, names),
      account: fixField(row.account),
      agent: fixField(row.agent),
    };
  }

  getProject(ref) {
    if (!ref) return null;
    const p =
      this.projects.find((x) => x.id === ref) ||
      this.projects.find((x) => x.name === ref) ||
      null;
    if (!p) return null;

    // 项目名里也可能有「账号 aaaa1111」（扫描时写进去的）
    // 输出时换成昵称（盘上不动，见 #withProjectName 的注释）
    const names = this.#knownNames();
    if (!names.size) return p;

    // 从项目名里抠出 uid：项目名形如「账号：账号 aaaa1111」
    let uid = '';
    const m = /账号\s+([0-9a-f]{8})/i.exec(p.name || '');
    if (m) {
      const short = m[1].toLowerCase();
      for (const u of names.keys()) {
        if (u.toLowerCase().startsWith(short)) { uid = u; break; }
      }
    }

    return { ...p, name: this.#fixText(p.name, uid, names) };
  }

  // ── 写入 ────────────────────────────────────────────────

  /**
   * 写入一条内容
   *
   * @param {object} input
   * @param {string} input.project 项目 id 或名字
   * @param {string} input.kind 见 KINDS
   * @param {string} input.title 标题
   * @param {string} input.body 正文（markdown）
   * @param {string} [input.agent] 哪个 agent 写的
   * @param {string} [input.owner] 归属人（一期恒为 local）
   * @param {string} [input.evidence] 实测 / 官方文档 / 推断
   * @param {string[]} [input.tags]
   * @param {string} [input.status] active / standby / deprecated
   * @param {boolean} [input.allowDuplicate] 跳过查重
   * @param {string} [input.externalUrl] 外部来源地址
   * @returns {{ok: boolean, item?: object, error?: string, duplicates?: object[]}}
   */
  write(input) {
    const { project: projectRef, kind, title, body } = input;

    const meta = KINDS[kind];
    if (!meta) {
      return { ok: false, error: `未知的库类型: ${kind}（可用: ${Object.keys(KINDS).join(', ')}）` };
    }

    // 外部资源是全局书签，不归属任何项目（用户可以还没有项目就先收藏）
    const isExternal = meta.sourceType === 'external';

    // ── 溯源标签强制校验（内部库）──
    //
    // 设计依据：LBASE 的宗旨是给 agent 做备份，让以后能溯源。
    // 缺了「谁写的」「哪个项目」，这条记录就永久查不回是谁写的——
    // 那 LBASE 就白存了。所以这两项必须由 agent 提供，不接受缺失。
    //
    // 注意：这两项不能由 LBASE 代替填写——编出来的名字是错的，不如让 agent 写对。
    if (!isExternal) {
      const agentName = String(input.agent || '').trim();
      if (!agentName) {
        return {
          ok: false,
          error: '必须带上 agent 字段（你的名字）。只有你知道自己是谁；'
            + '不写这条记录以后就查不出是谁写的。补上 agent 再写一次。',
          missing: ['agent'],
        };
      }
      const projName = String(projectRef || '').trim();
      if (!projName) {
        return {
          ok: false,
          error: '必须说明这条内容属于哪个项目（project 字段）。'
            + '不确定就起个名字，系统会自动创建这个项目。补上 project 再写一次。',
          missing: ['project'],
        };
      }
    }

    let project = null;
    if (!isExternal) {
      project = this.getProject(projectRef);
      if (!project) {
        // 项目不存在就自动创建。
        // 设计依据：项目只是溯源用的标签，agent 判断出名字后不该再去手动建项目。
        try {
          project = this.createProject(String(projectRef).trim());
        } catch (e) {
          return { ok: false, error: `创建项目失败: ${e.message}` };
        }
      }
    } else if (projectRef) {
      // 外部资源允许显式挂到某项目（可选），不强制
      project = this.getProject(projectRef);
    }

    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) return { ok: false, error: '标题不能为空' };

    // 正文不能为空：只写标题等于没记，以后查回来不知道内容是什么。
    const cleanBody = String(body || '').trim();
    if (!cleanBody) {
      return { ok: false, error: '正文不能为空。只写标题等于没记，以后查回来不知道改了什么/学了什么。补上正文再写一次。' };
    }

    // 查重：内部库才查；外部库允许重复（可删改）
    if (!isExternal && !input.allowDuplicate) {
      const dups = this.#findDuplicates(project.id, kind, cleanTitle, body);
      if (dups.length > 0) {
        return { ok: false, error: '发现相似内容，请确认是否重复', duplicates: dups };
      }
    }

    const id = 'itm-' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();

    // 会话标签：原样存 agent 传过来的值。
    //
    // 宗旨：LBASE 是给 agent 做备份的，agent 怎么传就怎么记，不替它编。
    // 所以这里不做任何自动生成或按时间归并——
    //   agent 传了 sessionId → 原样存下来（作为查询用的标签）
    //   agent 没传          → 留空，我们不猜
    // 需要按会话查时，agent 用自己传的那个 ID 就能取回全部记录。
    const sessionId = input.sessionId || input.session_id || null;
    const sessionStartedAt = input.sessionStartedAt || null;

    // WorkBuddy 专属：账号归属
    //
    // 背景：一个用户可能有多个 WorkBuddy 账号（多个手机号），
    // 每个账号的数据在磁盘上是隔离的（user-<uid>-personal/）。
    // 所以要能回答「这条记录是哪个账号产生的」。
    //
    // 昵称只在登录时存在（account-snapshot.json），退出就被删——
    // 所以昵称是「抓到就存、抓不到就用代号」的松散信息，uid 才是稳定身份。
    const account = input.account || null;   // 显示名（昵称，可能为空）
    const uid = input.uid || null;           // WorkBuddy 账号 uid（稳定）

    // 指纹：用于增量导入去重（同一份来源重扫时靠它跳过）
    const fingerprint = input.fingerprint || null;

    const frontmatter = {
      id,
      title: cleanTitle,
      kind,
      source_type: meta.sourceType,
      project: project ? project.name : null,
      project_id: project ? project.id : null,
      agent: input.agent || null,
      owner: input.owner || 'local',
      // 会话信息：用于把同一次对话的多条记忆串起来（可溯源）
      session_id: sessionId,
      session_started: sessionStartedAt,
      // WorkBuddy 账号归属
      account,
      uid,
      fingerprint,
      evidence: input.evidence || null,
      status: input.status || 'active',
      tags: input.tags || [],
      created_at: now,
      ...(meta.sourceType === 'external'
        ? { external_url: input.externalUrl || null, fetched_at: input.fetchedAt || now }
        : {}),
    };

    const fileBody = `---\n${toYaml(frontmatter)}---\n\n${body || ''}\n`;
    // 外部资源放全局目录（不属于任何项目）
    const dir = isExternal && !project
      ? path.join(this.dataDir, '_external', meta.dir)
      : path.join(this.dataDir, project.id, meta.dir);
    fs.mkdirSync(dir, { recursive: true });

    const safeName = slugify(cleanTitle) || id;
    let fileName = `${safeName}.md`;
    let n = 1;
    while (fs.existsSync(path.join(dir, fileName))) {
      fileName = `${safeName}-${++n}.md`;
    }
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, fileBody, 'utf8');

    const relPath = path.relative(this.dataDir, filePath).replace(/\\/g, '/');
    const summary = input.summary || firstLine(body);

    this.index.insert({
      id,
      project_id: project ? project.id : null,
      kind,
      source_type: meta.sourceType,
      title: cleanTitle,
      summary,
      agent: input.agent || null,
      owner: input.owner || 'local',
      session_id: sessionId,
      session_started: sessionStartedAt,
      account,
      uid,
      fingerprint,
      file_path: relPath,
      tags: input.tags || [],
      evidence: input.evidence || null,
      status: input.status || 'active',
      created_at: now,
      updated_at: now,
    });

    return { ok: true, item: { ...frontmatter, file_path: relPath, summary } };
  }

  /** 查重 */
  #findDuplicates(projectId, kind, title, body) {
    const rows = this.index.query({ projectId, kind });
    const out = [];
    for (const row of rows) {
      const existingBody = this.#readBody(row.file_path);
      const sim = similarity({ title, body }, { title: row.title, body: existingBody });
      if (sim >= 0.8) {
        out.push({ id: row.id, title: row.title, similarity: Number(sim.toFixed(3)) });
      }
    }
    return out.sort((a, b) => b.similarity - a.similarity);
  }

  #readBody(relPath) {
    const full = path.join(this.dataDir, relPath);
    if (!fs.existsSync(full)) return '';
    const raw = fs.readFileSync(full, 'utf8');
    const m = raw.match(/^---\n[\s\S]*?\n---\n/);
    return m ? raw.slice(m[0].length) : raw;
  }

  /**
   * 更新正文文件 frontmatter 里的 project / project_id（合并项目时用）
   * 保持文件和索引一致，否则直接读文件会看到旧项目名。
   */
  #updateFileProject(relPath, project) {
    const full = path.join(this.dataDir, relPath);
    if (!fs.existsSync(full)) return;
    let raw = fs.readFileSync(full, 'utf8');
    raw = raw.replace(/(^|\n)project: .*/g, `$1project: ${JSON.stringify(project.name)}`);
    raw = raw.replace(/(^|\n)project_id: .*/g, `$1project_id: ${JSON.stringify(project.id)}`);
    fs.writeFileSync(full, raw, 'utf8');
  }

  // ── 读取 ────────────────────────────────────────────────

  /** 取内容全文 */
  get(id) {
    const row = this.index.getById(id);
    if (!row) return null;
    const full = path.join(this.dataDir, row.file_path);
    if (!fs.existsSync(full)) return null;
    return { ...this.#withProjectName(row), content: fs.readFileSync(full, 'utf8') };
  }

  /** 列表 */
  list({ project, kind, sourceType, agent, session, account, limit = 50, offset = 0 } = {}) {
    let rows;
    if (project) {
      const p = this.getProject(project);
      if (!p) return { total: 0, items: [] };
      rows = this.index.query({ projectId: p.id, kind, sourceType });
    } else {
      rows = this.index.query({ kind, sourceType });
    }
    // 溯源筛选：按 agent / 按会话 ID / 按 WorkBuddy 账号
    if (agent) rows = rows.filter((r) => r.agent === agent);
    if (session) rows = rows.filter((r) => r.session_id === session);
    if (account) rows = rows.filter((r) => r.account === account || r.uid === account);
    rows = rows.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const page = rows.slice(offset, offset + limit).map((r) => this.#withProjectName(r));
    return { total: rows.length, items: page };
  }

  /**
   * WorkBuddy 专属：账号清单
   *
   * 列出库中出现过的所有账号，以及每个账号有多少条记录。
   *
   * ── 昵称的三层兜底（2026-11-05 老板反馈后改）──
   *
   * 老板原话：
   *   「账号名原来是有一个叫张三的，现在变成一个代码了。
   *     你看一下这个代码是不是就是原来那个叫张三的。我建议你还是改回去，
   *     因为用户看到这个代码，他不知道这是谁。」
   *
   * 为什么新装的程序显示成代码：
   *   WorkBuddy 的昵称只在【登录时】存在（account-snapshot.json）。
   *   我们抓到的昵称存进 data/accounts.json。
   *   新装的程序用全新 data 目录，只抓到当前登录账号的昵称，
   *   其他账号（张三）的昵称没抓过 → 只能用代号。
   *
   * 修法：除了记录里的 account 字段，还要反查 accounts.json
   *      （那个文件里存着历史抓到的昵称，跨版本/跨次安装都还在）。
   */
  listAccounts() {
    const rows = this.index.all();

    // 读 accounts.json 的历史昵称（uid → nickname）
    const knownNames = new Map();
    try {
      const p = path.join(this.dataDir, 'accounts.json');
      const d = JSON.parse(fs.readFileSync(p, 'utf8'));
      const acc = (d && d.accounts) || {};
      for (const uid in acc) {
        const nick = acc[uid] && acc[uid].nickname;
        if (nick && String(nick).trim()) knownNames.set(uid, String(nick).trim());
      }
    } catch { /* 读不到就算了 */ }

    const map = new Map();
    for (const r of rows) {
      const uid = r.uid || '';

      // 昵称优先级：记录里的真名 → accounts.json 里的历史昵称 → 代号
      let name = '';
      if (r.account && r.account.indexOf('账号 ') !== 0 && r.account.indexOf('未标注') !== 0) {
        name = r.account;
      } else if (uid && knownNames.has(uid)) {
        name = knownNames.get(uid);
      } else if (uid) {
        name = '账号 ' + uid.slice(0, 8);
      } else {
        name = r.account || '未标注账号';
      }

      const key = uid || name;
      if (!map.has(key)) map.set(key, { uid, account: name, total: 0, kinds: {} });
      const e = map.get(key);
      e.total += 1;
      e.kinds[r.kind] = (e.kinds[r.kind] || 0) + 1;
      // 有真名就用真名（昵称后来补上的情况）
      if (r.account && r.account.indexOf('账号 ') !== 0 && r.account.indexOf('未标注') !== 0) {
        e.account = r.account;
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }

  /**
   * 检索
   * @param {string} query
   * @param {object} [opts] { project, kinds, limit, minScore }
   */
  /**
   * 列出所有会话（按最近活动倒序）
   *
   * 用途：agent 追溯"某次对话里发生了什么"。
   * 每个会话汇总：id、起止时间、agent、涉及项目、条数、涉及哪些库。
   *
   * @param {object} opts
   * @param {string} [opts.project] 只看某个项目
   * @param {string} [opts.agent] 只看某个 agent
   * @param {number} [opts.limit]
   */
  listSessions(opts = {}) {
    const { project, agent, limit = 100 } = opts;
    let rows = this.index.all();

    if (project) {
      const p = this.getProject(project);
      if (!p) return { ok: true, total: 0, sessions: [] };
      rows = rows.filter((r) => r.project_id === p.id);
    }
    if (agent) rows = rows.filter((r) => r.agent === agent);

    // 只统计有 session_id 的（外部资源没有）
    rows = rows.filter((r) => r.session_id);

    const map = new Map();
    for (const r of rows) {
      const sid = r.session_id;
      if (!map.has(sid)) {
        map.set(sid, {
          session_id: sid,
          started_at: r.session_started || r.created_at,
          last_at: r.created_at,
          agent: r.agent || null,
          project_id: r.project_id || null,
          items: 0,
          kinds: {},
        });
      }
      const s = map.get(sid);
      s.items++;
      s.kinds[r.kind] = (s.kinds[r.kind] || 0) + 1;
      if (r.created_at > s.last_at) s.last_at = r.created_at;
      if (r.created_at < s.started_at) s.started_at = r.created_at;
    }

    const sessions = [...map.values()].sort((a, b) => (a.last_at < b.last_at ? 1 : -1));

    // 补上项目名，方便 agent 直接读
    for (const s of sessions) {
      if (s.project_id) {
        const p = this.projects.find((x) => x.id === s.project_id);
        s.project = p ? p.name : null;
      }
    }

    return { ok: true, total: sessions.length, sessions: sessions.slice(0, limit) };
  }

  /**
   * 取某次会话的全部记忆（按时间正序）
   * @param {string} sessionId
   */
  getSession(sessionId) {
    if (!sessionId) return { ok: false, error: '缺少 session_id' };
    const rows = this.index.all().filter((r) => r.session_id === sessionId);
    if (rows.length === 0) return { ok: false, error: '会话不存在: ' + sessionId };

    rows.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

    const items = rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      summary: r.summary,
      agent: r.agent,
      project_id: r.project_id,
      created_at: r.created_at,
      body: this.#readBody(r.file_path),
    }));

    const first = rows[0];
    return {
      ok: true,
      session: {
        session_id: sessionId,
        started_at: first.session_started || first.created_at,
        last_at: rows[rows.length - 1].created_at,
        agent: first.agent || null,
        project_id: first.project_id || null,
        items: items.length,
      },
      items,
    };
  }

  search(query, opts = {}) {
    const { project, kinds, limit = 20, minScore = 0.4 } = opts;
    const q = String(query || '').trim();
    if (!q) return { total: 0, items: [] };

    let rows;
    if (project) {
      const p = this.getProject(project);
      if (!p) return { total: 0, items: [] };
      rows = this.index.query({ projectId: p.id });
    } else {
      rows = this.index.all();
    }
    if (kinds && kinds.length) rows = rows.filter((r) => kinds.includes(r.kind));

    // 先算所有候选文档的词元并集，供打分时判断「哪些查询词元是有效词」
    // （中文二元分词会产出跨词边界的垃圾词元，不该用来拉低分数）
    const corpusTokens = new Set();
    const bodies = new Map();
    for (const row of rows) {
      const body = this.#readBody(row.file_path);
      bodies.set(row.id, body);
      for (const t of tokenize(row.title + ' ' + body)) corpusTokens.add(t);
    }

    const scored = [];
    for (const row of rows) {
      const body = bodies.get(row.id);
      const score = matchScore(q, { title: row.title, body }, corpusTokens);
      if (score >= minScore) {
        scored.push({
          id: row.id,
          project_id: row.project_id,
          kind: row.kind,
          source_type: row.source_type,
          title: row.title,
          summary: row.summary,
          agent: row.agent,
          evidence: row.evidence,
          status: row.status,
          // 账号归属（隐私过滤靠这个字段，缺了会串号 —— 2026-11-02 踩过）
          account: row.account,
          uid: row.uid,
          file_path: row.file_path,
          created_at: row.created_at,
          match: Number(score.toFixed(3)),
        });
      }
    }

    scored.sort((a, b) => b.match - a.match);
    return { total: scored.length, items: scored.slice(0, limit) };
  }

  // ── 删除（仅外部库） ────────────────────────────────────

  /**
   * 删除内容。内部库拒绝。
   * @param {string} id
   */
  remove(id) {
    const row = this.index.getById(id);
    if (!row) return { ok: false, error: '内容不存在' };

    if (this.readonly && row.source_type === 'internal') {
      return {
        ok: false,
        error: '内部库的内容不能删除（用于溯源）。外部的库才可以删。'
          + '（当前是只读模式，见 BT_READONLY 开关）',
      };
    }

    const full = path.join(this.dataDir, row.file_path);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    this.index.removeById(id);
    return { ok: true };
  }

  /**
   * 更新一条记录的内容（同步时用：来源内容变了，覆盖旧版本）
   *
   * 为什么需要（2026-11-02 教训）：
   *   同步只按 fingerprint 判断"已存在就跳过"，结果改了生成逻辑之后，
   *   旧记录永远不更新 —— 库里 10 条全是旧版措辞。
   *   所以要有"内容变了就更新"的路。
   *
   * 注意：保持 id 不变（链接不会失效）；保留原来的 created_at。
   *
   * @param {string} id
   * @param {object} patch { title, body, agent, evidence, account, uid }
   */
  updateItem(id, patch = {}) {
    const row = this.index.getById(id);
    if (!row) return { ok: false, error: '内容不存在' };

    const full = path.join(this.dataDir, row.file_path);
    if (!fs.existsSync(full)) return { ok: false, error: '文件不存在' };

    const raw = fs.readFileSync(full, 'utf8');
    const m = raw.match(/^---\n[\s\S]*?\n---\n/);
    let fm = m ? m[0] : '';
    const oldBody = m ? raw.slice(m[0].length) : raw;
    const newBody = patch.body !== undefined ? String(patch.body) : oldBody;

    // 更新 frontmatter 里的可变字段（用简单替换，不重新生成整个 YAML）
    const setFm = (src, key, val) => {
      if (val === undefined || val === null || val === '') return src;
      const line = `${key}: ${JSON.stringify(val)}`;
      const re = new RegExp(`(^|\\n)${key}: .*(?=\\n|$)`);
      if (re.test(src)) return src.replace(re, `$1${line}`);
      // 没有这个 key 就在 frontmatter 末尾插入
      return src.replace(/\n---\n/, `\n${line}\n---\n`);
    };

    if (fm) {
      fm = setFm(fm, 'title', patch.title);
      fm = setFm(fm, 'agent', patch.agent);
      fm = setFm(fm, 'evidence', patch.evidence);
      fm = setFm(fm, 'account', patch.account);
      fm = setFm(fm, 'uid', patch.uid);
      fm = setFm(fm, 'updated_at', new Date().toISOString());
    }

    fs.writeFileSync(full, fm + newBody, 'utf8');

    // 同步索引
    const summary = patch.body !== undefined ? firstLine(newBody) : row.summary;
    this.index.update(id, {
      title: patch.title !== undefined ? patch.title : row.title,
      summary,
      agent: patch.agent !== undefined ? patch.agent : row.agent,
      evidence: patch.evidence !== undefined ? patch.evidence : row.evidence,
      account: patch.account !== undefined ? patch.account : row.account,
      uid: patch.uid !== undefined ? patch.uid : row.uid,
      updated_at: new Date().toISOString(),
    });

    return { ok: true, id };
  }

  /** 统计 */
  stats() {
    const all = this.index.all();
    const byKind = {};
    for (const it of all) byKind[it.kind] = (byKind[it.kind] || 0) + 1;
    return {
      total: all.length,
      byKind: Object.entries(byKind).map(([kind, c]) => ({ kind, c })),
      projects: this.projects.length,
    };
  }

  close() {
    // JSON 索引无需关闭
  }
}

// ── 工具函数 ──────────────────────────────────────────────

function firstLine(text) {
  if (!text) return '';
  const raw = String(text);
  // 先剥掉 YAML frontmatter（否则摘要会变成 "name: xxx" 这种元数据）
  const noFm = raw.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const line = noFm
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l
      && !l.startsWith('#')          // 标题
      && !l.startsWith('---')        // 分隔线
      && !l.startsWith('|')          // 表格行
      && !l.startsWith('```')        // 代码围栏
      && !/^[a-z_]+:\s/.test(l));    // 残留的 key: value
  return (line || '').slice(0, 200);
}

function slugify(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** 简单 YAML 生成 */
function toYaml(obj) {
  const lines = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) {
      lines.push(`${k}: null`);
    } else if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map((x) => JSON.stringify(x)).join(', ')}]`);
    } else if (typeof v === 'string') {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  return lines.join('\n') + '\n';
}
