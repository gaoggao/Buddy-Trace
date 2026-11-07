/**
 * WorkBuddy 专属：同步调度
 *
 * 全自动（用户不点任何按钮）：
 *   ① 服务启动时扫一次（补上关机期间的变化）
 *   ② 之后每 N 分钟扫一次（默认 30 分钟，可用 BT_INTERVAL 改）
 *
 * 去重：
 *   扫描产出的每条都带 fingerprint，写入前先查库里有没有同 fingerprint 的，
 *   有就跳过 —— 所以重扫一百遍也不会翻倍。
 *
 * 开销（实测）：没变化时每轮只 stat 39 个文件，约 6 毫秒。
 */

import crypto from 'node:crypto';
import { scan, captureLoginAccount, loadAccounts, harvestAccountNamesToStore } from './wb-sync.js';
import { backupNow, shouldAutoBackup } from './backup.js';

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;

export class WbSyncer {
  /**
   * @param {object} opts
   * @param {import('./store.js').Store} opts.store
   * @param {string} opts.dataDir
   * @param {number} [opts.intervalMs]
   * @param {boolean} [opts.autoStart] 是否自动起定时器（测试时关掉）
   */
  constructor(opts) {
    this.store = opts.store;
    this.dataDir = opts.dataDir;
    // port 可以是数字，也可以是函数 —— 函数形式能跟着实际监听端口变化
    // （老板 2026-11-03：端口变了，引导语里的地址也得跟着变）
    this._port = opts.port || Number(process.env.BT_PORT || 41829);
    this.intervalMs = opts.intervalMs
      || Number(process.env.BT_INTERVAL || DEFAULT_INTERVAL_MS);
    this.mtimeCache = new Map();
    // 已知 fingerprint 集合（启动时从库里灌一次，之后增量维护）
    this.known = new Set();
    this.timer = null;
    this.running = false;
    this.last = null;   // 上次同步结果
  }

  /** 当前端口（支持传函数，实时取） */
  get port() {
    return typeof this._port === 'function' ? Number(this._port()) : Number(this._port);
  }

  set port(v) {
    this._port = v;
  }

  /** 从库里已有的记录灌入 fingerprint → { id, hash }（去重 + 检测内容变化的基础） */
  #loadKnown() {
    this.knownMap = new Map();
    for (const row of this.store.index.all()) {
      if (!row.fingerprint) continue;
      let hash = '';
      try {
        // 用文件里存下来的内容算哈希（跟新扫出来的对比）
        const item = this.store.get(row.id);
        if (item && item.content) {
          const bodyOnly = String(item.content).replace(/^---\n[\s\S]*?\n---\n/, '');
          hash = this.#bodyHash(bodyOnly);
        }
      } catch { /* 读不到就当空，下次会更新 */ }
      this.knownMap.set(row.fingerprint, { id: row.id, hash });
    }
  }

  /** 内容哈希（判断"内容变了没"） */
  #bodyHash(body) {
    return crypto.createHash('sha1').update(String(body || '')).digest('hex').slice(0, 16);
  }

  /**
   * 同步一次
   * @param {object} [o]
   * @param {boolean} [o.force] 忽略 mtime 缓存（手动强制全扫）
   */
  async run(o = {}) {
    if (this.running) return { ok: false, error: '同步正在进行中' };
    this.running = true;
    const t0 = Date.now();
    try {
      // ① 抓当前登录账号的昵称（唯一获取时机）
      const login = captureLoginAccount(this.dataDir);

    // 从日志里补齐历史账号昵称（老板 2026-11-05 要求：显示昵称不用代码）
    //
    // 为什么需要：WorkBuddy 的昵称只在登录时存在，退出就没了。
    // 新装的程序只能抓到当前登录账号的昵称，其他账号（张三）显示成代号。
    // 日志里有 [auth_success: 昵称] + userId changed: -> uid 的配对，可以补。
    //
    // 实测：308ms 扫完，能挖到两个账号的昵称。
    let harvested = null;
    try {
      harvested = harvestAccountNamesToStore(this.dataDir);
    } catch { /* 挖不到就算了，不影响扫描 */ }

      // ② 扫描
      if (o.force) { this.mtimeCache = new Map(); this.sessCache = new Map(); }
      const res = scan({ dataDir: this.dataDir, mtimeCache: this.mtimeCache, sessCache: this.sessCache });

      // ③ 去重写入（内容变了要更新，不能只按 fingerprint 跳过）
      //
      // 教训（2026-11-02）：一开始只按 fingerprint 判断"已存在就跳过"，
      // 结果我改了生成逻辑（正文措辞），旧记录永远不更新 ——
      // 库里 10 条全是旧版，界面上还显示"不要假装你看过内容"那种错话。
      //
      // 所以改成：fingerprint 相同 + 【内容哈希】也相同才跳过；
      // 内容变了 → 覆盖更新旧记录（保持 id 不变，避免链接失效）。
      this.#loadKnown();
      let added = 0, updated = 0, dup = 0, fail = 0;
      const knownMap = this.knownMap || new Map();   // fingerprint → {id, hash}
      for (const it of res.items) {
        const hash = this.#bodyHash(it.body);
        const prev = knownMap.get(it.fingerprint);
        if (prev && prev.hash === hash) { dup += 1; continue; }

        if (prev && prev.id) {
          // 内容变了 → 更新旧记录（同一个 id，不新建）
          const u = this.store.updateItem(prev.id, {
            title: it.title,
            body: it.body,
            agent: it.agent,
            evidence: it.evidence,
            account: it.account,
            uid: it.uid,
          });
          if (u && u.ok) {
            updated += 1;
            knownMap.set(it.fingerprint, { id: prev.id, hash });
          } else {
            fail += 1;
          }
          continue;
        }

        const w = this.store.write({
          project: it.project,
          kind: it.kind,
          title: it.title,
          body: it.body,
          agent: it.agent,
          evidence: it.evidence,
          account: it.account,
          uid: it.uid,
          fingerprint: it.fingerprint,
          allowDuplicate: true,   // 去重已由 fingerprint 负责，不让查重再拦
        });
        if (w.ok) {
          added += 1;
          knownMap.set(it.fingerprint, { id: w.item.id, hash });
        } else {
          fail += 1;
        }
      }
      this.knownMap = knownMap;
      this.mtimeCache = res.mtimeCache;
      this.sessCache = res.sessCache;

      // 导出「给 agent 直接读的文件」
      //
      // 为什么（实测 2026-11-02）：WorkBuddy 的网络策略会拦 127.0.0.1，
      // HTTP 查询走不通 → 改成给它硬盘上的绝对路径，让它读文件。
      // 每次同步后重导一次，保证索引是最新的。
      let exported = null;
      try {
        const { exportAgentArtifacts } = await import('./wb-export.js');
        exported = exportAgentArtifacts({
          store: this.store,
          dataDir: this.dataDir,
          port: this.port || 41829,
        });
      } catch (e) {
        exported = { ok: false, error: String(e && e.message || e) };
      }

      this.last = {
        at: new Date().toISOString(),
        ms: Date.now() - t0,
        added, dup, fail,
        scanned: res.stats.scanned,
        skipped: res.stats.skipped,
        candidates: res.items.length,
        login: login ? (login.nickname || login.uid.slice(0, 8)) : null,
        loginIsNew: login ? login.isNew : false,
        exportDir: exported && exported.ok ? exported.dir : null,
        exportError: exported && !exported.ok ? exported.error : null,
      };
      return { ok: true, ...this.last };
    } finally {
      this.running = false;
    }
  }

  /** 起定时器（启动时同步跑一次） */
  start() {
    if (this.timer) return;

    // ── 自动备份检查（2026-11-04 老板定：每周一次）──
    //
    // 挂在扫描节奏上：每次扫描时看一眼"距上次备份够 7 天了吗"，
    // 够了就备份一次。这样不用另起定时器，也不用担心时间漂移。
    //
    // 老板原话：「每周备份一次也没问题……每三个月删除 3 个月以前的」
    const checkBackup = () => {
      try {
        const dataDir = this.dataDir;
        if (!dataDir) return;
        if (!shouldAutoBackup(dataDir)) return;

        const r = backupNow(dataDir);
        if (r.ok) {
          console.log(`[备份] 自动备份完成：${r.name}（${Math.round(r.size / 1024)} KB）`
            + (r.cleaned ? `，清理超期 ${r.cleaned} 个` : ''));
        } else {
          console.warn('[备份] 自动备份失败：' + r.error);
        }
      } catch (e) {
        console.warn('[备份] 自动备份出错：' + (e && e.message));
      }
    };

    // 启动扫一次（延后 2 秒，不挡服务起来）
    setTimeout(() => {
      this.run().then((r) => {
        if (r.ok) {
          const bits = [`新增 ${r.added}`, `跳过重复 ${r.dup}`];
          if (r.fail) bits.push(`失败 ${r.fail}`);
          if (r.loginIsNew) bits.push(`抓到新账号昵称「${r.login}」`);
          console.log(`[WorkBuddy 同步] 启动扫描完成：${bits.join('，')}（${r.ms}ms）`);
        } else {
          console.log(`[WorkBuddy 同步] 启动扫描跳过：${r.error}`);
        }
        checkBackup();
      }).catch((e) => console.error('[WorkBuddy 同步] 启动扫描出错:', e.message));
    }, 2000);

    this.timer = setInterval(() => {
      this.run().then((r) => {
        if (r.ok && (r.added || r.loginIsNew)) {
          console.log(`[WorkBuddy 同步] 新增 ${r.added} 条${r.loginIsNew ? `，抓到新账号「${r.login}」` : ''}`);
        }
        checkBackup();
      }).catch((e) => console.error('[WorkBuddy 同步] 定时扫描出错:', e.message));
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /** 当前状态（给接口用） */
  status() {
    return {
      intervalMs: this.intervalMs,
      intervalMinutes: Math.round(this.intervalMs / 60000),
      running: this.running,
      last: this.last,
      accounts: loadAccounts(this.dataDir),
    };
  }
}